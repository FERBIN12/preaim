# PreAim

A 60-second, mouse-only booth game that trains **crosshair placement**: keeping your crosshair where an enemy *will* appear, so the shot is a small correction instead of a big flick.

A stylized neon corridor has seven cover edges (two doorways, a crate stack, a pillar). Before each peek, an amber glow marks the live edge. An enemy silhouette (original vector art drawn on canvas) steps out at head height. Every target is scored on:

- **Pre-aim error**: distance in px from your crosshair to the head's first visible point at the instant it appears.
- **Reaction time**: ms from appearance to your hit click.

Misses cost points. Over the 60 seconds peeks get faster and wider, double peeks (two enemies) start around 18 s, and fake peeks (shoulder only) start around 12 s: shooting a fake costs 150, holding fire earns 25.

Flow: animated attract screen, 3-2-1, play, results (score, avg reaction ms, avg pre-aim error px, hit %, rank title, arcade-wheel initials entry with the mouse), top-10 board, then back to attract after 20 s idle.

## Booth setup (3 commands)

```
python3 server/preaim_server.py
# open http://localhost:8765            (game, booth screen)
# open http://localhost:8765/board.html (live leaderboard, second monitor)
```

Python 3 standard library only, no internet needed. Scores live in `server/preaim.sqlite3` (gitignored; change with `--db`). Use `--host 0.0.0.0` if the board runs on another machine on the booth LAN.

Play online (local-leaderboard mode): https://ferbin12.github.io/preaim/

Without the server (GitHub Pages, or opening `web/index.html` from disk) the game detects that `/api/health` is not a PreAim server and keeps the leaderboard in `localStorage` instead. The attract screen shows `BOOTH MODE` or `LOCAL MODE`.

## Controls

| Input | Action |
|---|---|
| Mouse move | Aim (custom crosshair, system cursor hidden) |
| Left click | Start, shoot, change initials, continue |
| Mouse wheel over a letter | Spin that initial |
| Fullscreen button (bottom right) | Toggle fullscreen (hidden during play) |
| Shift+R (operator) | Reset to attract immediately |
| Shift+M (operator) | Mute sound |

URL options: `?demo=1` runs a built-in autoplayer (for screenshots or video capture, does not touch the real leaderboard), `?seed=N` fixes the peek schedule.

## Tests

```
node --test tests/                     # game logic + 500-session stress test (no npm install)
python3 -m unittest discover -s tests  # server: real HTTP server on an ephemeral port
SESSIONS=2000 node --test tests/stress.test.mjs
```

Optional headless screenshots (needs Playwright with Chromium, server running): `python tools/capture.py http://localhost:8765 shots`.

## How it is built

- `web/js/` pure modules, no DOM: `rng.js` (seedable mulberry32), `scene.js` (geometry), `schedule.js` (escalating peek schedule + hit tests), `scoring.js`, `game.js` (state machine driven only by `update(dt)` and input calls, no timers), `bot.js` (demo autoplayer), `leaderboard.js` (server/localStorage client).
- Browser-only modules: `render.js` (canvas, particles, screen shake, devicePixelRatio aware, letterboxed 1600x900 virtual world), `audio.js` (WebAudio synthesized blips, no audio files), `main.js` (wiring), `board.js` (second-monitor page, Server-Sent Events).
- Clean reset between players: all per-player state hangs off one `run` object that `reset()` drops; async leaderboard replies carry a session token, so a late reply can never land on the next player's screen. The stress test plays 500 full sessions with the bot and asserts the machine is byte-identical to a fresh one after every reset.
- Server: `server/preaim_server.py`, `ThreadingHTTPServer` + SQLite. `POST /api/score` (initials `^[A-Z]{3}$`, integer score 0..100000, 2 KB body cap, 10 posts per minute per IP), `GET /api/top?period=day|all`, `GET /api/stream` (SSE), `GET /api/health`.

## How this was built

PreAim was built with Claude Code (an AI coding agent by Anthropic), run by Ferbin Richard as his hackathon agent. Ferbin set the goal and the ground rules (be honest, credit every library, follow the event rules); Claude Code picked the idea, wrote the code, tests and docs, and checked every number by running the code. Results were verified by running the test suites and headless screenshots.

## JetBrains tools used

**PyCharm 2026.3.0.1** (free tier, Linux), used from the command line by Claude Code:

- **Code inspections** (`inspect.sh`, headless) over the whole project, Python and JavaScript, with the inspection profile committed in [`.idea/inspectionProfiles/Project_Default.xml`](.idea/inspectionProfiles/Project_Default.xml). The first run found **54** findings ([baseline report](docs/inspections/2026-11-22-baseline.md)), including a missing `await` and an ignored promise in `main.js`, five inconsistent returns and a type mismatch in the server, and unused imports. After fixing the real ones, a clean re-run found **23**, all reviewed and documented as false positives or required names (for example CSS classes added at runtime, `do_GET`/`setUp` method names that the standard library requires) ([after report](docs/inspections/2026-11-23-after.md)).
- **Code formatter** (`format.sh`, default style) on `server/` (it changed one over-long line).
- The `.idea` project files (module, VCS mapping, inspection profile) are committed so the same inspections run for anyone who opens the project in a JetBrains IDE.

No other JetBrains tools were used. One trap worth knowing: on a re-run, `inspect.sh` returned results from its cache for files that had already changed; deleting PyCharm's `caches/` and `index/` folders before each run fixed it (details in the after report).
See [AI_SHOWCASE.md](AI_SHOWCASE.md) for how the AI agent and PyCharm were used together.

## License

MIT, see [LICENSE](LICENSE). All names, art, and sounds are original; no third-party game assets, maps, characters, or logos are used.
