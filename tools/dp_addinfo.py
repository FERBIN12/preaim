"""Fill Cloud9 Devpost additional-info (truthful answers), save. Usage: dp_addinfo.py <manage base url>"""
import asyncio, sys
sys.path.insert(0, "/home/ferbin/ferbins-world/tools")
from edge_session import edge, ensure_display
B = sys.argv[1].rstrip("/")
F = "#participants_submission_requirements_submission_field_values_attributes_%d_value"
TECH = ("PyCharm 2026.3.0.1 (free tier, Linux). Claude Code ran PyCharm headless: inspect.sh code inspections over the whole "
 "project (Python + JavaScript) with the profile committed in .idea/inspectionProfiles/Project_Default.xml. First run: 54 findings "
 "(incl. a missing await, an ignored promise, five inconsistent returns, a type mismatch). After fixes a clean re-run: 23, each "
 "reviewed and documented as a false positive or a required name. Reports in docs/inspections/. format.sh (default style) on server/. "
 ".idea committed so anyone can re-run the same inspections. No other JetBrains tools were used, and PyCharm was used headless by "
 "the agent, not interactively by a person.")
TEST = ("Play at https://ferbin12.github.io/preaim/ (mouse only, 60 s; add ?demo=1 to watch the built-in bot). Booth mode with the live "
 "second-monitor leaderboard: git clone https://github.com/FERBIN12/preaim && cd preaim && python3 server/preaim_server.py, then open "
 "http://localhost:8000/ and http://localhost:8000/board.html. Shift+R resets instantly. Tests: node --test tests/ and "
 "python3 -m unittest discover -s tests. No credentials needed.")
AI = ("Claude Code (Anthropic's AI coding agent) built the whole project as Ferbin's hackathon agent: it picked the idea, wrote all the "
 "code, ran PyCharm's inspections headless, ran the tests, and recorded the demo video with Playwright. Ferbin set the goal and the "
 "ground rules. No JetBrains AI tools (Junie, Air, AI Assistant) were used.")
async def main():
    ensure_display()
    async with edge() as ctx:
        pg = await ctx.new_page(); pg.set_default_timeout(25000)
        await pg.goto(B + "/additional-info/edit", wait_until="domcontentloaded"); await pg.wait_for_timeout(6000)
        await pg.select_option(F % 0, label="Individual")
        await pg.fill(F % 1, "N/A")
        await pg.select_option(F % 2, label="United States")
        await pg.fill(F % 3, "N/A")
        await pg.select_option(F % 4, label="Category 3 (Event Mini Game)")
        await pg.select_option(F % 5, label="New")
        await pg.fill(F % 6, "N/A: new project, first commit 2026-11-23, after the submission period opened.")
        await pg.fill(F % 7, "https://github.com/FERBIN12/preaim")
        await pg.fill(F % 8, "https://ferbin12.github.io/preaim/")
        await pg.fill(F % 9, TEST)
        await pg.fill(F % 10, TECH)
        await pg.select_option("#participants_submission_requirements_submission_field_values_attributes_11_values", label=["PyCharm"])
        await pg.select_option(F % 12, label="No")
        await pg.select_option(F % 13, label="No")
        await pg.fill(F % 14, open("/tmp/claude-1000/c9_method.txt").read().strip())
        await pg.select_option(F % 15, label="Yes")
        await pg.fill(F % 16, "https://github.com/FERBIN12/preaim/blob/main/AI_SHOWCASE.md")
        await pg.fill(F % 17, AI)
        await pg.select_option(F % 18, label="Somewhat")
        await pg.select_option(F % 19, label="Not sure")
        await pg.get_by_role("button", name="Save & continue").click(); await pg.wait_for_timeout(9000)
        print("URL", pg.url)
        print(" ".join((await pg.inner_text("body")).split())[:1500])
        await pg.screenshot(path="/tmp/claude-1000/c9_addinfo.png", full_page=True)
asyncio.run(main())
