#!/usr/bin/env python3
"""PreAim booth server. Python 3 stdlib only.

Serves web/, stores scores in SQLite, exposes:
  POST /api/score               {"initials":"ABC","score":1234,...}
  GET  /api/top?period=day|all  top 10
  GET  /api/stream              Server-Sent Events for the live board
  GET  /api/health              {"ok": true, "service": "preaim"}
"""
import argparse
import collections
import datetime
import json
import os
import queue
import re
import sqlite3
import threading
import time
from http import HTTPStatus
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import parse_qs, urlsplit

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DEFAULT_WEB = os.path.join(ROOT, "web")
DEFAULT_DB = os.path.join(ROOT, "server", "preaim.sqlite3")
INITIALS_RE = re.compile(r"^[A-Z]{3}$")
MAX_SCORE = 100000
MAX_BODY = 2048
TOP_N = 10


def today():
    return datetime.date.today().isoformat()


class Store:
    def __init__(self, path):
        self.lock = threading.Lock()
        self.db = sqlite3.connect(path, check_same_thread=False)
        self.db.row_factory = sqlite3.Row
        with self.lock, self.db:
            self.db.execute(
                "CREATE TABLE IF NOT EXISTS scores (id INTEGER PRIMARY KEY AUTOINCREMENT, initials TEXT NOT NULL,"
                " score INTEGER NOT NULL, avg_ms INTEGER, avg_err INTEGER, hit_pct INTEGER, day TEXT NOT NULL, ts REAL NOT NULL)"
            )
            self.db.execute("CREATE INDEX IF NOT EXISTS idx_day_score ON scores(day, score DESC)")

    def add(self, e, day=None):
        day = day or today()
        with self.lock, self.db:
            cur = self.db.execute(
                "INSERT INTO scores (initials, score, avg_ms, avg_err, hit_pct, day, ts) VALUES (?,?,?,?,?,?,?)",
                (e["initials"], e["score"], e.get("avg_ms"), e.get("avg_err"), e.get("hit_pct"), day, time.time()),
            )
            row = self._row(cur.lastrowid)
        return row

    def _row(self, rid):
        r = self.db.execute("SELECT * FROM scores WHERE id=?", (rid,)).fetchone()
        return dict(r) if r else None

    def top(self, period="all", day=None, limit=TOP_N):
        sql = "SELECT * FROM scores"
        args = []
        if period == "day":
            sql += " WHERE day=?"
            args.append(day or today())
        sql += " ORDER BY score DESC, ts ASC LIMIT ?"
        args.append(limit)
        with self.lock:
            rows = [dict(r) for r in self.db.execute(sql, args).fetchall()]
        return rows

    def close(self):
        with self.lock:
            self.db.close()


class RateLimiter:
    def __init__(self, max_events=10, window_s=60.0, clock=time.monotonic):
        self.max_events, self.window_s, self.clock = max_events, window_s, clock
        self.hits = collections.defaultdict(collections.deque)
        self.lock = threading.Lock()

    def allow(self, key):
        now = self.clock()
        with self.lock:
            dq = self.hits[key]
            while dq and now - dq[0] > self.window_s:
                dq.popleft()
            allowed = len(dq) < self.max_events
            if allowed:
                dq.append(now)
            if len(self.hits) > 10000:  # bound memory under abuse
                for k in [k for k, v in self.hits.items() if not v]:
                    del self.hits[k]
        return allowed


class Hub:
    """Fan-out of SSE messages to subscriber queues."""

    def __init__(self):
        self.subs = set()
        self.lock = threading.Lock()

    def subscribe(self):
        q = queue.Queue(maxsize=64)
        with self.lock:
            self.subs.add(q)
        return q

    def unsubscribe(self, q):
        with self.lock:
            self.subs.discard(q)

    def publish(self, event, data):
        msg = f"event: {event}\ndata: {json.dumps(data)}\n\n".encode()
        with self.lock:
            for q in list(self.subs):
                try:
                    q.put_nowait(msg)
                except queue.Full:
                    self.subs.discard(q)  # slow client: drop it, EventSource will reconnect

    def count(self):
        with self.lock:
            n = len(self.subs)
        return n


def validate(payload):
    """Return (entry, None) or (None, error message)."""
    if not isinstance(payload, dict):
        return None, "body must be a JSON object"
    ini = payload.get("initials")
    if not isinstance(ini, str) or not INITIALS_RE.match(ini):
        return None, "initials must be 3 letters A-Z"
    score = payload.get("score")
    if isinstance(score, bool) or not isinstance(score, int) or not 0 <= score <= MAX_SCORE:
        return None, f"score must be an integer 0..{MAX_SCORE}"
    entry = {"initials": ini, "score": score}
    for key, hi in (("avg_ms", 60000), ("avg_err", 5000), ("hit_pct", 100)):
        v = payload.get(key)
        entry[key] = v if isinstance(v, int) and not isinstance(v, bool) and 0 <= v <= hi else None
    return entry, None


class App:
    def __init__(self, db_path=DEFAULT_DB, web_dir=DEFAULT_WEB, rate_max=10, rate_window=60.0, verbose=False):
        self.store = Store(db_path)
        self.limiter = RateLimiter(rate_max, rate_window)
        self.hub = Hub()
        self.web_dir = web_dir
        self.verbose = verbose
        self.stopping = threading.Event()

    def snapshot(self):
        return {"day": self.store.top("day"), "all": self.store.top("all")}


def make_handler(app):
    class Handler(SimpleHTTPRequestHandler):
        server_version = "PreAim/1.0"
        protocol_version = "HTTP/1.1"

        def __init__(self, *a, **kw):
            # BaseHTTPRequestHandler serves the whole request inside __init__ and sets this per request;
            # declaring it first keeps the attribute defined in __init__.
            self.close_connection = True
            super().__init__(*a, directory=app.web_dir, **kw)

        def log_message(self, fmt, *args):
            if app.verbose:
                super().log_message(fmt, *args)

        def end_headers(self):
            self.send_header("Cache-Control", "no-cache")
            self.send_header("X-Content-Type-Options", "nosniff")
            super().end_headers()

        def list_directory(self, _path):
            self.send_error(HTTPStatus.NOT_FOUND)
            return None

        def send_json(self, code, obj):
            body = json.dumps(obj).encode()
            self.send_response(code)
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)

        def do_GET(self):
            url = urlsplit(self.path)
            if url.path == "/api/health":
                return self.send_json(200, {"ok": True, "service": "preaim", "clients": app.hub.count()})
            if url.path == "/api/top":
                period = parse_qs(url.query).get("period", ["all"])[0]
                if period not in ("day", "all"):
                    return self.send_json(400, {"error": "period must be day or all"})
                return self.send_json(200, {"period": period, "entries": app.store.top(period)})
            if url.path == "/api/stream":
                return self.stream()
            return super().do_GET()

        def translate_path(self, path):
            if urlsplit(path).path == "/board":
                path = "/board.html"
            return super().translate_path(path)

        def do_POST(self):
            if urlsplit(self.path).path != "/api/score":
                return self.send_json(404, {"error": "not found"})
            try:
                length = int(self.headers.get("Content-Length", "0"))
            except ValueError:
                length = -1
            if length < 0 or length > MAX_BODY:
                self.close_connection = True
                return self.send_json(413, {"error": "body too large"})
            raw = self.rfile.read(length)
            if not app.limiter.allow(self.client_address[0]):
                return self.send_json(429, {"error": "slow down"})
            try:
                payload = json.loads(raw.decode("utf-8"))
            except (UnicodeDecodeError, json.JSONDecodeError):
                return self.send_json(400, {"error": "invalid JSON"})
            entry, err = validate(payload)
            if err:
                return self.send_json(400, {"error": err})
            row = app.store.add(entry)
            snap = app.snapshot()
            app.hub.publish("score", {"entry": row, **snap})
            return self.send_json(201, {"entry": row, **snap})

        def stream(self):
            self.send_response(200)
            self.send_header("Content-Type", "text/event-stream")
            self.send_header("Connection", "keep-alive")
            self.end_headers()
            self.close_connection = True
            q = app.hub.subscribe()
            try:
                self.wfile.write(b"retry: 2000\n\n")
                self.wfile.write(f"event: hello\ndata: {json.dumps(app.snapshot())}\n\n".encode())
                self.wfile.flush()
                idle = 0.0
                while not app.stopping.is_set():
                    try:
                        msg = q.get(timeout=0.5)
                        idle = 0.0
                    except queue.Empty:
                        idle += 0.5
                        if idle < 15:
                            continue
                        msg, idle = b": keepalive\n\n", 0.0
                    self.wfile.write(msg)
                    self.wfile.flush()
            except (BrokenPipeError, ConnectionResetError, ConnectionAbortedError, OSError):
                pass
            finally:
                app.hub.unsubscribe(q)

    return Handler


class PreAimServer(ThreadingHTTPServer):
    daemon_threads = True
    allow_reuse_address = True

    def __init__(self, address, app):
        self.app = app
        super().__init__(address, make_handler(app))


def make_server(host="127.0.0.1", port=8765, **app_kw):
    return PreAimServer((host, port), App(**app_kw))


def stop_server(srv: PreAimServer):
    srv.app.stopping.set()
    srv.shutdown()
    srv.server_close()
    srv.app.store.close()


def main(argv=None):
    ap = argparse.ArgumentParser(description="PreAim booth server (static files + leaderboard + SSE)")
    ap.add_argument("--host", default="127.0.0.1", help="bind address (use 0.0.0.0 to reach it from another device)")
    ap.add_argument("--port", type=int, default=8765)
    ap.add_argument("--db", default=os.environ.get("PREAIM_DB", DEFAULT_DB), help="SQLite file")
    ap.add_argument("--verbose", action="store_true")
    a = ap.parse_args(argv)
    srv = make_server(a.host, a.port, db_path=a.db, verbose=a.verbose)
    shown = "localhost" if a.host in ("127.0.0.1", "0.0.0.0") else a.host
    print(
        f"PreAim booth server on http://{shown}:{a.port}  (board: http://{shown}:{a.port}/board.html)  db={os.path.relpath(a.db)}",
        flush=True)
    try:
        srv.serve_forever()
    except KeyboardInterrupt:
        print("\nbye")
    finally:
        stop_server(srv)


if __name__ == "__main__":
    main()
