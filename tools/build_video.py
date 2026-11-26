"""Compose the PreAim demo: cards + captioned clips of the live recordings. Adapted from the genhacks-spiral builder.

usage: build_video.py VIDEODIR      (expects VIDEODIR/rec/*.webm + rec/timeline.json from record_demo.py)
-> VIDEODIR/preaim_demo.mp4 (1920x1080, 30 fps, captions burned in, silent audio track)
Numbers in captions come from rec/timeline.json (the recorded run) or from files in the repo."""
import json
import subprocess
import sys
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

d = Path(sys.argv[1]); rec = d / "rec"; seg = d / "seg"; seg.mkdir(exist_ok=True)
W, H, CW, CH, BAR = 1920, 1080, 1728, 972, 108
F = "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"; FB = "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"
BG, CYAN, PINK, TXT = (10, 14, 30), (46, 242, 255), (255, 60, 150), (225, 232, 245)
tl = json.load(open(rec / "timeline.json"))
S = tl["run"]["summary"]; ev = tl["run"]["ev"]; bev = tl["board"]["ev"]; jev = tl["jb"]["ev"]; dev = tl["demo"]["ev"]
assert tl["run"]["entry"]["initials"] == "BOT" and tl["board"]["flash"].startswith("BOT")


def card(name, title, lines, sub=None):
    im = Image.new("RGB", (W, H), BG); g = ImageDraw.Draw(im)
    g.text((140, 130), title, font=ImageFont.truetype(FB, 76), fill=CYAN)
    y = 150 + 76 + 30
    if sub:
        g.text((140, y), sub, font=ImageFont.truetype(F, 36), fill=PINK); y += 80
    else:
        y += 30
    for ln in lines:
        f = ImageFont.truetype(FB if ln.startswith("*") else F, 38); ln = ln.lstrip("*")
        g.text((140, y), ln, font=f, fill=TXT); y += 64 if ln else 34
    im.save(d / f"{name}.png")


def ts(s):
    s = max(0.0, s)
    return f"{int(s // 3600)}:{int(s % 3600 // 60):02d}:{s % 60:05.2f}"


def ass_file(name, caps):
    out = ["[Script Info]", "PlayResX: 1920", "PlayResY: 1080", "WrapStyle: 0", "", "[V4+ Styles]",
           "Format: Name, Fontname, Fontsize, PrimaryColour, OutlineColour, BackColour, Bold, Alignment, MarginL, MarginR, MarginV, BorderStyle, Outline, Shadow",
           "Style: C,DejaVu Sans,38,&H00FFFFFF,&H00000000,&H00000000,0,2,80,80,22,1,1,0", "", "[Events]",
           "Format: Layer, Start, End, Style, Text"]
    out += [f"Dialogue: 0,{ts(a)},{ts(b)},C,{t}" for a, b, t in caps]
    p = seg / f"{name}.ass"; p.write_text("\n".join(out) + "\n"); return p


run = lambda *a: subprocess.run(["ffmpeg", "-v", "error", "-y", *a], check=True)
enc = ["-c:v", "libx264", "-pix_fmt", "yuv420p", "-r", "30", "-crf", "20", "-preset", "medium"]
order = []


def clip(name, src, a, b, caps, crop=""):
    """caps: (start, end, text) in SOURCE seconds; shifted to the cut and clamped to it."""
    dur = b - a
    sc = [(max(0, s - a), min(dur, e - a), t) for s, e, t in caps if e > a and s < b]
    ass = ass_file(name, sc)
    vf = (f"{crop}scale={CW}:{CH},pad={W}:{H}:{(W - CW) // 2}:0:color=0x0a0e1e,"
          f"ass={ass},fade=in:st=0:d=0.3,fade=out:st={dur - 0.3:.2f}:d=0.3")
    run("-ss", f"{a:.2f}", "-t", f"{dur:.2f}", "-i", str(rec / f"{src}.webm"), "-vf", vf, "-an", *enc, str(seg / f"{name}.mp4"))
    order.append(name)


def still(name, sec):
    run("-loop", "1", "-t", str(sec), "-i", str(d / f"{name}.png"), "-vf", f"fade=in:0:12,fade=out:st={sec - 0.4}:d=0.4",
        *enc, str(seg / f"{name}.mp4"))
    order.append(name)


card("c_title", "PreAim", [
    "A 60-second, mouse-only reaction game for the Cloud9 booth.",
    "It trains crosshair placement: aim where the enemy WILL appear,",
    "so the shot is a small correction, not a big flick.", "",
    "Every clip in this video is the real game and server, recorded live",
    "in a headless browser. Captions only, no voice.",
], sub="Cloud9 x JetBrains hackathon, Category 3: Event Mini Game")
card("c_tests", "Booth requirements, as tests", [
    "*node --test tests/   9/9 pass",
    "Includes 500 full bot sessions in a row: the complete loop every time,",
    "and the game state after every reset is identical to a fresh one",
    "(clean reset between players).", "",
    "*python3 -m unittest discover -s tests   9/9 pass",
    "Real HTTP server on an ephemeral port: score validation, rate limit, SSE.", "",
    "Server: Python standard library + SQLite. No internet needed at the booth.",
])
card("c_end", "Play it", [
    "*ferbin12.github.io/preaim",
    "(add ?demo=1 to watch the bot play)", "",
    "*github.com/FERBIN12/preaim   (MIT license)",
    "Booth: python3 server/preaim_server.py, then open the game and /board.html", "",
    "Built with Claude Code (AI coding agent), directed by Ferbin.",
    "JetBrains tool used: PyCharm 2026.3.0.1 (headless inspections + formatter).",
])
card("c_built", "How it was built", [
    "*Built with Claude Code (AI coding agent), directed by Ferbin.", "",
    "Ferbin set the goal and the ground rules: be honest, follow the event rules.",
    "Claude Code wrote the code, tests and docs, and checked every number",
    "by running the code. Process and mistakes: AI_SHOWCASE.md in the repo.",
])
card("c_jb", "JetBrains tools used", [
    "*PyCharm 2026.3.0.1 (free tier, Linux), run headless by the AI agent:", "",
    "inspect.sh code inspections, Python + JavaScript:",
    "      54 findings on the first run, 23 after fixes (each one reviewed).",
    "format.sh code formatter on server/ (it changed 1 line).",
    "The .idea project files and inspection profile are committed.", "",
    "No other JetBrains tools were used.",
])

still("c_title", 7)
clip("s_attract", "attract", 0.5, 9.5, [
    (0, 4.8, "Attract screen: loops by itself while nobody is playing, with the 3 rules on screen."),
    (4.8, 99, "BOOTH MODE: scores go to a local Python server. Today's top score is shown to pull players in."),
])
dp = dev["play"]
clip("s_demo", "demo", 0.6, dp + 15.5, [
    (0, dev["countdown"], "?demo=1: the built-in bot plays the real game (its scores stay in memory)."),
    (dev["countdown"], dp, "One click starts the run: 3, 2, 1."),
    (dp, dp + 7.5, "An amber glow marks the edge where the next enemy will peek. Park the crosshair there."),
    (dp + 7.5, 99, "Each hit scores pre-aim error (px from the head when it appeared) and reaction time (ms)."),
])
rs, rp = ev["start_click"], ev["play"]
clip("s_run1", "run", rs - 1.5, rp + 12, [
    (0, 99, "Now a scripted mouse run in BOOTH MODE: Playwright moves the real pointer, aiming from the game's peek state. Not a human."),
])
rr = ev["results"]
clip("s_run2", "run", rr - 13, ev["end"] - 0.6, [
    (rr - 13, rr, "Later in the 60 s: faster, wider peeks, double peeks, and fake peeks (shoulder only: hold your fire)."),
    (rr, ev["initial_B"] - 0.3,
     f"Results: {S['score']} points, avg reaction {S['avgReactionMs']} ms, "
     f"avg pre-aim error {S['avgErrorPx']} px, hit rate {S['hitPct']}%, rank {S['rank']}."),
    (ev["initial_B"] - 0.3, ev["submit"], "Initials, mouse only: click the arrows or spin the wheel. This run enters BOT."),
    (ev["submit"], 999, "DONE posts the score to the local server, and the game shows the top 10."),
])
bs = bev["flash"]
clip("s_board", "board", bs - 4.5, bs + 7.5, [
    (bs - 4.5, bs, "Second monitor: board.html, today and all time. Pre-filled with 5 sample scores for this demo."),
    (bs, 999, f"Server-Sent Events: BOT {S['score']} lands live at the top, no refresh."),
])
still("c_tests", 9)
still("c_built", 8)
still("c_jb", 9)
clip("s_jb", "jb", jev["loaded"] - 0.4, jev["end"] - 0.5, [
    (0, jev["table"], "JetBrains: PyCharm 2026.3 code inspections (inspect.sh, headless), run by the AI agent. Report in docs/inspections."),
    (jev["table"], jev["fixed"], "First run: 54 findings. After fixing the real ones and re-running: 23, each reviewed and documented."),
    (jev["fixed"], 999, "Real bugs PyCharm caught that the tests missed: a missing await and an ignored promise in main.js."),
], crop="crop=1240:698:0:0,")
still("c_end", 10)

(seg / "list.txt").write_text("".join(f"file '{n}.mp4'\n" for n in order))
run("-f", "concat", "-safe", "0", "-i", str(seg / "list.txt"), "-f", "lavfi", "-i", "anullsrc=r=48000:cl=stereo",
    "-shortest", *enc, "-c:a", "aac", "-b:a", "64k", "-movflags", "+faststart", str(d / "preaim_demo.mp4"))
print("ok", d / "preaim_demo.mp4")
