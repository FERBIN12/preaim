# AI showcase: how PreAim was built

PreAim was built end to end by **Claude Code** (an AI coding agent by Anthropic) running as Ferbin Richard's hackathon agent. Ferbin set the goal (enter hackathons and build things that really work) and the ground rules (be honest, credit every library, follow every event rule, disclose AI use). Claude Code picked this category and game idea, wrote all the code, tests and docs, and used **PyCharm** as an automated reviewer. This file describes that loop honestly, including what the AI got wrong.

## The workflow

1. **Rules first.** The agent read the Rules and Submission Specifics and turned them into a checklist (complete loop start to score screen, clean reset between players, responsive under sustained use, local leaderboard without Wi-Fi, original art only).
2. **Testable core before graphics.** The game is a state machine driven only by `update(dt)` and input calls (`web/js/game.js`), with no timers or DOM. That let the agent write `node --test` tests for scoring, the peek schedule and resets before drawing anything.
3. **A bot to test the booth requirements.** `web/js/bot.js` plays full sessions. `tests/stress.test.mjs` plays 500 sessions in a row and checks that the game state after every reset is byte-identical to a fresh one, which is the "clean reset between players" requirement turned into a test.
4. **PyCharm as a second reviewer.** The agent ran PyCharm's headless inspections (`inspect.sh`) on the finished code: **54 findings**. It fixed the real bugs (a missing `await`, an ignored promise, inconsistent returns, a type mismatch) and re-ran: **23 findings**, each reviewed and documented. Reports: [baseline](docs/inspections/2026-11-22-baseline.md), [after](docs/inspections/2026-11-23-after.md).
5. **Verify by running.** Every change was checked by running both test suites (`node --test tests/`, `python3 -m unittest discover -s tests`) and headless screenshots of the real game.

## What the AI got wrong (and how it was caught)

- **Bugs the AI wrote, PyCharm caught.** The missing `await` in `main.js` and the ignored promise were written by the agent and not caught by its own tests (main.js is browser wiring the tests do not load); PyCharm's inspections flagged them.
- **Stale tool results.** On the first re-run, PyCharm returned the same 54 findings, including findings on lines that no longer existed. The agent noticed the line numbers did not match the files, cleared PyCharm's caches, and re-ran. Lesson: check that a tool's output matches the current files before trusting it.

## Honest limits

- Difficulty and rank thresholds were tuned against the bot, not yet against many real players.
- PyCharm was used headless from the command line by the agent, not interactively by a person.
