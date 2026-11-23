"""Server tests: start the real HTTP server on an ephemeral port in a thread."""
import json
import os
import sys
import tempfile
import threading
import time
import unittest
import urllib.error
import urllib.request

sys.path.insert(0, os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "server"))
import preaim_server as ps  # noqa: E402


class ServerTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.srv = ps.make_server("127.0.0.1", 0, db_path=os.path.join(self.tmp.name, "t.sqlite3"), rate_max=5, rate_window=60)
        self.base = f"http://127.0.0.1:{self.srv.server_address[1]}"
        self.th = threading.Thread(target=self.srv.serve_forever, daemon=True)
        self.th.start()

    def tearDown(self):
        ps.stop_server(self.srv)
        self.th.join(5)
        self.tmp.cleanup()

    def req(self, path, data=None, raw=None):
        body = raw if raw is not None else (json.dumps(data).encode() if data is not None else None)
        r = urllib.request.Request(self.base + path, data=body, headers={"Content-Type": "application/json"} if body else {})
        try:
            with urllib.request.urlopen(r, timeout=5) as resp:
                return resp.status, resp.read(), resp.headers
        except urllib.error.HTTPError as e:
            return e.code, e.read(), e.headers

    def post(self, ini, score, **kw):
        code, body, _ = self.req("/api/score", {"initials": ini, "score": score, **kw})
        return code, json.loads(body)

    def test_health_and_static(self):
        code, body, _ = self.req("/api/health")
        self.assertEqual(code, 200)
        self.assertEqual(json.loads(body)["service"], "preaim")
        code, body, h = self.req("/")
        self.assertEqual(code, 200)
        self.assertIn(b"<canvas", body)
        code, body, h = self.req("/js/game.js")
        self.assertEqual(code, 200)
        self.assertIn("javascript", h["Content-Type"])
        self.assertEqual(self.req("/board")[0], 200)
        self.assertEqual(self.req("/js/")[0], 404)  # no directory listings

    def test_post_and_top_ordering(self):
        for ini, s in [("AAA", 100), ("BBB", 900), ("CCC", 500)]:
            code, j = self.post(ini, s, avg_ms=300, avg_err=20, hit_pct=80)
            self.assertEqual(code, 201)
        self.assertEqual(j["entry"]["initials"], "CCC")
        code, body, _ = self.req("/api/top?period=all")
        names = [e["initials"] for e in json.loads(body)["entries"]]
        self.assertEqual(names, ["BBB", "CCC", "AAA"])
        code, body, _ = self.req("/api/top?period=day")
        self.assertEqual(len(json.loads(body)["entries"]), 3)
        self.assertEqual(self.req("/api/top?period=week")[0], 400)

    def test_top_limited_to_ten(self):
        for i in range(12):
            self.srv.app.store.add({"initials": "ZZZ", "score": i})
        code, body, _ = self.req("/api/top")
        rows = json.loads(body)["entries"]
        self.assertEqual(len(rows), 10)
        self.assertEqual(rows[0]["score"], 11)

    def test_day_vs_all(self):
        self.srv.app.store.add({"initials": "OLD", "score": 9999}, day="2000-01-01")
        self.post("NEW", 10)
        day = json.loads(self.req("/api/top?period=day")[1])["entries"]
        all_ = json.loads(self.req("/api/top?period=all")[1])["entries"]
        self.assertEqual([e["initials"] for e in day], ["NEW"])
        self.assertEqual(all_[0]["initials"], "OLD")

    def test_validation(self):
        self.srv.app.limiter.max_events = 1000  # invalid posts also count toward the limit
        bad = [
            {"initials": "ab1", "score": 1}, {"initials": "abc", "score": 1}, {"initials": "ABCD", "score": 1},
            {"initials": "ABC", "score": -1}, {"initials": "ABC", "score": ps.MAX_SCORE + 1},
            {"initials": "ABC", "score": 1.5}, {"initials": "ABC", "score": "10"}, {"initials": "ABC", "score": True},
            {"initials": "ABC"}, [1, 2],
        ]
        for b in bad:
            code, _, _ = self.req("/api/score", b)
            self.assertEqual(code, 400, b)
        self.assertEqual(self.req("/api/score", raw=b"{nope")[0], 400)
        self.assertEqual(self.req("/api/score", raw=b"x" * (ps.MAX_BODY + 1))[0], 413)
        self.assertEqual(self.req("/api/nothing", {"a": 1})[0], 404)
        code, j = self.post("ABC", 5, avg_ms="fast", hit_pct=500)
        self.assertEqual(code, 201)
        self.assertIsNone(j["entry"]["avg_ms"])
        self.assertIsNone(j["entry"]["hit_pct"])

    def test_rate_limit(self):
        codes = [self.post("RTE", i)[0] for i in range(7)]
        self.assertEqual(codes[:5], [201] * 5)
        self.assertEqual(codes[5:], [429, 429])

    def test_rate_limiter_window(self):
        now = [0.0]
        rl = ps.RateLimiter(2, 10, clock=lambda: now[0])
        self.assertTrue(rl.allow("a"))
        self.assertTrue(rl.allow("a"))
        self.assertFalse(rl.allow("a"))
        self.assertTrue(rl.allow("b"))
        now[0] = 11
        self.assertTrue(rl.allow("a"))

    def test_sse_stream_gets_hello_and_score(self):
        r = urllib.request.urlopen(self.base + "/api/stream", timeout=5)
        self.assertIn("text/event-stream", r.headers["Content-Type"])
        lines = []

        def read_until(event):
            while True:
                line = r.readline().decode()
                lines.append(line)
                if line.startswith("data:") and len(lines) >= 2 and lines[-2].strip() == f"event: {event}":
                    return json.loads(line[5:])

        hello = read_until("hello")
        self.assertEqual(hello["all"], [])
        for _ in range(50):
            if self.srv.app.hub.count():
                break
            time.sleep(0.02)
        self.post("SSE", 4321)
        ev = read_until("score")
        self.assertEqual(ev["entry"]["initials"], "SSE")
        self.assertEqual(ev["all"][0]["score"], 4321)
        r.close()

    def test_hub_drops_slow_clients(self):
        hub = ps.Hub()
        q = hub.subscribe()
        for i in range(70):
            hub.publish("x", {"i": i})
        self.assertEqual(hub.count(), 0)
        self.assertEqual(q.qsize(), 64)


if __name__ == "__main__":
    unittest.main()
