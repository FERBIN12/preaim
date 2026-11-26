"""Record the real PreAim game + booth leaderboard (Playwright headless video) and log event times.
Adapted from the genhacks-spiral recorder.

usage: record_demo.py BASE_URL OUTDIR [jb]     (jb = re-record only the JetBrains segment; server must be running at BASE_URL, ideally on a fresh --db)
-> OUTDIR/{attract,demo,run,board,jb}.webm + OUTDIR/timeline.json

Segments:
  attract  booth-mode attract screen, no input
  demo     ?demo=1 built-in bot (memory leaderboard, never posts to the server)
  run      booth mode, Playwright moves the REAL mouse pointer (page.mouse), aiming from the game's own
           peek state; plays the full 60 s, enters initials BOT with clicks + wheel, submits to the server
  board    board.html recorded at the same time as `run`, catches the SSE update
  jb       the PyCharm inspection after-report as rendered on GitHub
Every number on screen is computed live by the game/server during the recording."""
import json
import random
import subprocess
import sys
import time
import urllib.request
from pathlib import Path

from playwright.sync_api import sync_playwright

BASE, OUT = sys.argv[1].rstrip("/"), Path(sys.argv[2])
OUT.mkdir(parents=True, exist_ok=True)
VW, VH = 1600, 900
JB_URL = "https://github.com/FERBIN12/preaim/blob/main/docs/inspections/2026-11-23-after.md"
ONLY_JB = len(sys.argv) > 3 and sys.argv[3] == "jb"
TL = json.load(open(OUT / "timeline.json")) if ONLY_JB else {}

STATE_JS = """async () => {
  if (!window.__sched) window.__sched = await import('/js/schedule.js');
  const g = window.__preaim.game, r = g.run;
  const out = { phase: g.phase, initials: g.initialsString(), summary: g.summary };
  if (!r) return out;
  out.t = r.t;
  const n = r.peeks.filter(p => p.cued && !p.resolved).sort((a, b) => a.appearAt - b.appearAt)[0];
  if (!n) return out;
  const q = window.__sched.enemyPose(n, r.t);
  out.peek = { id: r.peeks.indexOf(n), ax: n.edge.x, ay: n.edge.headY, appeared: n.appeared, appearAt: n.appearAt,
               fake: n.fake, hx: q.cx, hy: q.headY };
  return out;
}"""


def post(entry):
    req = urllib.request.Request(f"{BASE}/api/score", data=json.dumps(entry).encode(),
                                 headers={"Content-Type": "application/json"}, method="POST")
    return urllib.request.urlopen(req, timeout=5).status


def ctx_page(br, name, vw=VW, vh=VH):
    ctx = br.new_context(viewport={"width": vw, "height": vh}, record_video_dir=str(OUT / f"_{name}"),
                         record_video_size={"width": VW, "height": VH})
    pg = ctx.new_page()
    TL[name] = {"t0": time.monotonic(), "ev": {}}
    return ctx, pg


def mark(name, ev):
    TL[name]["ev"][ev] = round(time.monotonic() - TL[name]["t0"], 2)
    print(name, ev, TL[name]["ev"][ev], flush=True)


def finish(ctx, pg, name):
    mark(name, "end")
    v = pg.video
    ctx.close()
    Path(v.path()).rename(OUT / f"{name}.webm")


def scripted_run(pg, rng):
    """Real pointer events through the game's own handlers. Aim = ease toward the cued edge, then react."""
    mx, my = 800.0, 665.0
    pg.mouse.move(mx, my)
    plan = {}
    shots = 0
    while True:
        s = pg.evaluate(STATE_JS)
        if s["phase"] == "results":
            return shots
        p = s.get("peek")
        if s["phase"] == "play" and p:
            if p["id"] not in plan:
                plan[p["id"]] = {"react": rng.uniform(240, 420), "off": (rng.uniform(-14, 14), rng.uniform(-10, 10))}
            pl = plan[p["id"]]
            tx, ty = p["ax"] + pl["off"][0], p["ay"] + pl["off"][1]
            if p["appeared"] and not p["fake"] and s["t"] >= p["appearAt"] + pl["react"]:
                hx, hy = p["hx"] + rng.uniform(-4, 4), p["hy"] + rng.uniform(-4, 4)
                pg.mouse.move(hx, hy, steps=3)
                pg.mouse.click(hx, hy)
                shots += 1
                mx, my = hx, hy
                pl["react"] = 1e9  # one shot per peek
                continue
        else:
            tx, ty = 800, 420
        mx += (tx - mx) * 0.22
        my += (ty - my) * 0.22
        pg.mouse.move(mx, my)
        pg.wait_for_timeout(16)


def enter_initials(pg, name):
    """B: one click on the down arrow. O: mouse wheel up 12 notches. T: 7 clicks on the up arrow. Then DONE."""
    xs = [650, 800, 950]
    pg.mouse.move(xs[0], 704, steps=12); pg.wait_for_timeout(300)
    pg.mouse.click(xs[0], 704); mark(name, "initial_B"); pg.wait_for_timeout(700)
    pg.mouse.move(xs[1], 612, steps=12); pg.wait_for_timeout(300)
    for _ in range(12):
        pg.mouse.wheel(0, -100); pg.wait_for_timeout(180)
    mark(name, "initial_O"); pg.wait_for_timeout(500)
    pg.mouse.move(xs[2], 520, steps=12); pg.wait_for_timeout(300)
    for _ in range(7):
        pg.mouse.click(xs[2], 520); pg.wait_for_timeout(260)
    mark(name, "initial_T"); pg.wait_for_timeout(700)
    pg.mouse.move(800, 800, steps=15); pg.wait_for_timeout(400)
    pg.mouse.click(800, 800); mark(name, "submit")


def smooth_to(pg, y_target, n=60):
    y0 = pg.evaluate("window.scrollY")
    for i in range(1, n + 1):
        pg.evaluate(f"window.scrollTo(0, {y0 + (y_target - y0) * i / n})"); pg.wait_for_timeout(25)


def top_of(pg, tag, text, pad=70):
    return pg.evaluate("([tag, text, pad]) => { const e = [...document.querySelectorAll(tag)].find(x => x.textContent.trim().startsWith(text));"
                       " return e.getBoundingClientRect().top + window.scrollY - pad; }", [tag, text, pad])


def record_game(br, errors):
    top = json.load(urllib.request.urlopen(f"{BASE}/api/top?period=all", timeout=5))
    assert not (top.get("scores") or top.get("top") or top.get("entries")), "server DB is not empty: start it on a fresh --db"
    # Pre-fill the board with sample scores (real POSTs to the local server; caption says so).
    for ini, sc in (("ACE", 14250), ("JNK", 11800), ("MAX", 9600), ("RIO", 7300), ("ZED", 5100)):
        post({"initials": ini, "score": sc, "avg_ms": 330, "avg_err": 30, "hit_pct": 80})

    # 1. attract (booth mode)
    ctx, pg = ctx_page(br, "attract")
    pg.on("pageerror", lambda e: errors.append(f"attract: {e}"))
    pg.goto(f"{BASE}/index.html"); pg.wait_for_function("window.__preaim && window.__preaim.mode")
    mark("attract", "ready"); TL["attract"]["mode"] = pg.evaluate("window.__preaim.mode")
    pg.wait_for_timeout(9000)
    finish(ctx, pg, "attract")

    # 2. demo bot
    ctx, pg = ctx_page(br, "demo")
    pg.on("pageerror", lambda e: errors.append(f"demo: {e}"))
    pg.goto(f"{BASE}/index.html?demo=1&seed=7"); pg.wait_for_function("window.__preaim && window.__preaim.mode")
    mark("demo", "ready")
    pg.wait_for_function("window.__preaim.game.phase === 'countdown'"); mark("demo", "countdown")
    pg.wait_for_function("window.__preaim.game.phase === 'play'"); mark("demo", "play")
    pg.wait_for_timeout(20000)
    TL["demo"]["score_at_end"] = pg.evaluate("Math.round(window.__preaim.game.run.score)")
    finish(ctx, pg, "demo")

    # 3+4. scripted mouse run + board on its own "monitor"
    bctx, bp = ctx_page(br, "board")
    bp.on("pageerror", lambda e: errors.append(f"board: {e}"))
    bp.goto(f"{BASE}/board.html"); bp.wait_for_function("document.getElementById('status').textContent === 'LIVE'")
    mark("board", "live")
    ctx, pg = ctx_page(br, "run")
    pg.on("pageerror", lambda e: errors.append(f"run: {e}"))
    pg.goto(f"{BASE}/index.html?seed=11"); pg.wait_for_function("window.__preaim && window.__preaim.mode")
    TL["run"]["mode"] = pg.evaluate("window.__preaim.mode")
    pg.wait_for_timeout(2500)
    pg.mouse.move(800, 600, steps=10); pg.mouse.click(800, 600)
    mark("run", "start_click"); TL["board"]["ev"]["run_start_click"] = round(time.monotonic() - TL["board"]["t0"], 2)
    pg.wait_for_function("window.__preaim.game.phase === 'play'"); mark("run", "play")
    shots = scripted_run(pg, random.Random(11))
    mark("run", "results")
    TL["run"]["summary"] = pg.evaluate("window.__preaim.game.summary"); TL["run"]["shots_by_script"] = shots
    pg.wait_for_timeout(1800)
    enter_initials(pg, "run")
    TL["board"]["ev"]["run_submit"] = round(time.monotonic() - TL["board"]["t0"], 2)
    pg.wait_for_function("window.__preaim.game.board !== null", timeout=10000); mark("run", "ingame_board")
    TL["run"]["entry"] = pg.evaluate("window.__preaim.game.entry")
    bp.wait_for_function("document.getElementById('flash').textContent.includes('BOT')", timeout=10000)
    mark("board", "flash")
    TL["board"]["flash"] = bp.inner_text("#flash"); TL["board"]["all"] = bp.inner_text("#all")
    pg.wait_for_timeout(6000)
    finish(ctx, pg, "run")
    bp.wait_for_timeout(2000)
    finish(bctx, bp, "board")



def record_jb(br):
    # 5. PyCharm inspection report on GitHub (smaller viewport so text is bigger; Playwright pads it
    # into the 1600x900 video top-left, build_video.py crops 1240x698 and scales it up)
    ctx, pg = ctx_page(br, "jb", 1240, 698)
    ready = "[...document.querySelectorAll('h2')].some(x => x.textContent.trim().startsWith('Fixed (32'))"
    for attempt in range(3):
        try:
            pg.goto(JB_URL, wait_until="networkidle", timeout=60000)
            pg.wait_for_function(ready, timeout=20000); TL["jb"]["source"] = JB_URL; break
        except Exception:
            print("jb: markdown not rendered, retry", attempt, flush=True)
    else:
        # GitHub unavailable: render the same report file from the repo locally (python3 markdown, tables ext).
        md = Path(__file__).resolve().parent.parent / "docs/inspections/2026-11-23-after.md"
        body = subprocess.run(["python3", "-m", "markdown", "-x", "tables", str(md)], capture_output=True, text=True, check=True).stdout
        html = OUT / "_jb_report.html"
        html.write_text("<!doctype html><meta charset=utf-8><style>body{font:16px/1.55 -apple-system,'DejaVu Sans',sans-serif;"
                        "max-width:1000px;margin:24px auto;padding:0 32px;color:#1f2328}h1,h2{border-bottom:1px solid #d1d9e0;padding-bottom:.3em}"
                        "table{border-collapse:collapse}td,th{border:1px solid #d1d9e0;padding:5px 13px}tr:nth-child(2n){background:#f6f8fa}"
                        "code{background:#eff1f3;padding:.1em .3em;border-radius:4px}.path{font:14px monospace;color:#59636e}</style>"
                        f"<div class=path>FERBIN12/preaim / docs/inspections/2026-11-23-after.md</div>{body}")
        pg.goto(html.as_uri()); pg.wait_for_function(ready, timeout=10000); TL["jb"]["source"] = "local"
    mark("jb", "loaded")
    pg.wait_for_timeout(3000)
    smooth_to(pg, top_of(pg, "h2", "Before / after", 125)); mark("jb", "table")
    pg.wait_for_timeout(4500)
    smooth_to(pg, top_of(pg, "tr", "Total", 520), 50); mark("jb", "total")
    pg.wait_for_timeout(5500)
    smooth_to(pg, top_of(pg, "h2", "Fixed (32", 125)); mark("jb", "fixed")
    pg.wait_for_timeout(7000)
    finish(ctx, pg, "jb")


with sync_playwright() as pw:
    br = pw.chromium.launch(headless=True, args=["--mute-audio"])
    errors = []
    if not ONLY_JB:
        record_game(br, errors)
        json.dump(TL, open(OUT / "timeline.json", "w"), indent=1)  # keep the game timeline even if the jb segment fails
    record_jb(br)
    br.close()

TL["errors"] = TL.get("errors", []) + errors
json.dump(TL, open(OUT / "timeline.json", "w"), indent=1)
print("errors:", errors or "none")
