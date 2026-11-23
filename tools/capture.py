#!/usr/bin/env python3
"""Headless screenshots for QA (needs Playwright + Chromium). Server must be running.

usage: python tools/capture.py [base_url] [out_dir]
"""
import json
import os
import sys

from playwright.sync_api import sync_playwright

BASE = sys.argv[1] if len(sys.argv) > 1 else "http://localhost:8765"
OUT = sys.argv[2] if len(sys.argv) > 2 else "shots"
os.makedirs(OUT, exist_ok=True)


def main():
    errors = []
    with sync_playwright() as p:
        b = p.chromium.launch(headless=True, args=["--mute-audio"])
        pg = b.new_page(viewport={"width": 1600, "height": 900}, device_scale_factor=1)
        pg.on("pageerror", lambda e: errors.append(f"pageerror: {e}"))
        pg.on("console", lambda m: m.type == "error" and errors.append(f"console: {m.text}"))

        pg.goto(f"{BASE}/index.html")
        pg.wait_for_function("window.__preaim && window.__preaim.mode")
        pg.wait_for_timeout(1500)
        pg.screenshot(path=f"{OUT}/01_attract.png")
        print("mode:", pg.evaluate("window.__preaim.mode"))

        pg.goto(f"{BASE}/index.html?demo=1&seed=7")
        pg.wait_for_function("window.__preaim && window.__preaim.mode")
        pg.evaluate("window.__preaim.step(1600)")  # bot clicks start
        pg.evaluate("window.__preaim.step(1500)")
        pg.wait_for_timeout(100)
        pg.screenshot(path=f"{OUT}/02_countdown.png")
        for name, ms in (("03_play_early", 9000), ("04_play_late", 38000)):
            pg.evaluate(f"window.__preaim.step({ms})")
            # stop right when a peek is live so the shot shows an enemy or a cue
            pg.evaluate("""() => { const a = window.__preaim; for (let i = 0; i < 400; i++) {
                const r = a.game.run; if (!r) return; const live = r.peeks.find(p => !p.fake && !p.resolved && r.t > p.appearAt + 60);
                if (live) return; a.step(16); } }""")
            pg.wait_for_timeout(120)
            pg.screenshot(path=f"{OUT}/{name}.png")
        pg.evaluate("window.__preaim.step(16000)")
        pg.wait_for_timeout(100)
        state = pg.evaluate("({phase: window.__preaim.game.phase, summary: window.__preaim.game.summary})")
        print("after play:", json.dumps(state))
        pg.screenshot(path=f"{OUT}/05_results.png")
        pg.evaluate("window.__preaim.step(8000)")
        pg.wait_for_timeout(300)
        pg.screenshot(path=f"{OUT}/06_ingame_board.png")
        print("phase:", pg.evaluate("window.__preaim.game.phase"))

        bp = b.new_page(viewport={"width": 1920, "height": 1080})
        bp.on("pageerror", lambda e: errors.append(f"board pageerror: {e}"))
        bp.goto(f"{BASE}/board.html")
        bp.wait_for_timeout(1500)
        bp.screenshot(path=f"{OUT}/07_board.png")
        # live update through SSE: post a score from the page and catch the highlight
        bp.evaluate("""fetch('./api/score', {method: 'POST', headers: {'Content-Type': 'application/json'},
                       body: JSON.stringify({initials: 'NEW', score: 16000, avg_ms: 280, avg_err: 15, hit_pct: 92})})""")
        bp.wait_for_timeout(900)
        bp.screenshot(path=f"{OUT}/08_board_new_entry.png")
        print("board status:", bp.inner_text("#status"), "| highlighted:", bp.locator("li.new").count())

        lp = b.new_page(viewport={"width": 1280, "height": 720}, device_scale_factor=2)
        lp.on("pageerror", lambda e: errors.append(f"pages-mode pageerror: {e}"))
        lp.route("**/api/**", lambda route: route.fulfill(status=404, body="not found"))  # simulate a static host
        lp.goto(f"{BASE}/index.html")
        lp.wait_for_function("window.__preaim && window.__preaim.mode")
        lp.wait_for_timeout(800)
        lp.screenshot(path=f"{OUT}/09_static_host_dpr2.png")
        print("static-host mode:", lp.evaluate("window.__preaim.mode"))
        b.close()
    print("errors:", errors or "none")
    return 1 if errors else 0


if __name__ == "__main__":
    sys.exit(main())
