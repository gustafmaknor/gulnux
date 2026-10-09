"""Greed-sidan (http://127.0.0.1:9303) och mottagningen av inlägg från Glome-tillägget."""

import json
import os
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlparse

from . import core, fetch

PORT = int(os.environ.get("GREED_PORT", "9303"))
STATIC = Path(__file__).parent / "static"
TYPES = {".html": "text/html", ".js": "text/javascript", ".css": "text/css"}

# Bara Gulnux eget Greed-tillägg (fast id via nyckeln i manifest.json) får skicka inlägg.
# Sidan själv kräver X-Greed, som andra webbsidor inte kan skicka hit utan att bli stoppade.
TILLAGG_ORIGIN = "chrome-extension://ccbiciocgndmnhmblociljbphlibegne"
HOSTS = {f"127.0.0.1:{PORT}", f"localhost:{PORT}"}

lock = threading.Lock()


def base_url():
    return f"http://127.0.0.1:{PORT}"


class Handler(BaseHTTPRequestHandler):
    server_version = "Greed"

    def log_message(self, *args):
        pass

    def _send(self, status, body, content_type="application/json; charset=utf-8", headers=()):
        if not isinstance(body, bytes):
            body = json.dumps(body, ensure_ascii=False).encode()
        self.send_response(status)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        for name, value in headers:
            self.send_header(name, value)
        self.end_headers()
        self.wfile.write(body)

    def _body(self):
        return json.loads(self._raw or b"{}")

    def _allowed(self, path):
        if self.headers.get("Host") not in HOSTS:
            return False
        if path == "/api/capture":
            return self.headers.get("Origin") == TILLAGG_ORIGIN
        if path.startswith("/api/"):
            return self.headers.get("X-Greed") == "1"
        return True

    def _handle(self, route):
        url = urlparse(self.path)
        if not self._allowed(url.path):
            return self._send(403, {"error": "not allowed"})
        try:
            db = core.Db()
            route(url.path, db)
        except core.GreedError as e:
            self._send(400, {"error": str(e)})
        except (ValueError, KeyError, TypeError) as e:
            self._send(400, {"error": f"bad request: {e}"})

    def do_GET(self):
        def route(path, db):
            if path in ("/", "/app.js", "/style.css", "/start", "/start.js", "/start.css"):
                name = {"/": "index.html", "/start": "start.html"}.get(path, path[1:])
                return self._send(200, (STATIC / name).read_bytes(), TYPES[Path(name).suffix] + "; charset=utf-8")
            if path == "/api/start":
                return self._send(200, start_data(db))
            if path == "/api/today":
                return self._send(200, {"digests": db.digests(3)})
            if path == "/api/sources":
                states = db.source_states()
                return self._send(200, {"sources": [{**s, "state": states.get(s["id"])} for s in core.load_sources()]})
            if path == "/api/profile":
                return self._send(200, {**core.profile(), "path": str(core.PROFILE_FILE)})
            if path.startswith("/go/"):
                # Öppna en post: räknas som en signal för vad användaren tycker är intressant
                item = int(path[4:])
                row = db.one("SELECT url FROM items WHERE id = ?", (item,))
                if not row or not row["url"].startswith("http"):
                    return self._send(404, {"error": "no such item"})
                db.event(item, "open")
                return self._send(302, b"", headers=[("Location", row["url"])])
            self._send(404, {"error": "not found"})
        self._handle(route)

    def do_POST(self):
        # Läs alltid hela anropet först: att svara (t.ex. 403) med oläst innehåll kan bryta anslutningen
        self._raw = self.rfile.read(int(self.headers.get("Content-Length") or 0))

        def route(path, db):
            body = self._body()
            if path == "/api/capture":
                return self._send(200, fetch.capture(db, body.get("site"), body.get("posts") or []))
            if path == "/api/feedback":
                db.feedback(int(body["id"]), int(body["value"]))
                return self._send(200, {"ok": True})
            if path == "/api/save":
                return self._send(200, {"message": save(db, int(body["id"]))})
            if path == "/api/sources":
                return self._send(200, core.add_source("rss", url=body.get("url"), title=body.get("title")))
            if path == "/api/sources/update":
                return self._send(200, core.update_source(body["id"], enabled=bool(body.get("enabled"))))
            if path == "/api/sources/remove":
                return self._send(200, {"message": core.remove_source(body["id"])})
            if path == "/api/refresh":
                with lock:
                    return self._send(200, refresh(db, force=True))
            self._send(404, {"error": "not found"})
        self._handle(route)


def start_data(db):
    """Det Glomes startsida visar: förnamn, dagens främsta val och appar Good Times kan."""
    name = ""
    try:
        import pwd
        name = pwd.getpwuid(os.getuid()).pw_gecos.split(",")[0].split(" ")[0]
    except (ImportError, KeyError, AttributeError):
        pass
    digests = db.digests(1)
    picks = [p for d in digests for p in d["picks"]][:5]
    apps = []
    for app_json in sorted((core.REPO / "gt").glob("*/app.json")):
        try:
            app = json.loads(app_json.read_text(encoding="utf-8"))
            apps.append({"title": app["title"], "url": app["startUrl"]})
        except (OSError, ValueError, KeyError):
            continue
    return {"name": name, "picks": picks, "apps": apps, "updated": digests[0]["created"] if digests else None}


def save(db, item):
    """Spara en post i Gulnux sök, så att den går att hitta senare."""
    import subprocess
    row = db.one("SELECT * FROM items WHERE id = ?", (item,))
    if not row:
        raise core.GreedError(f"No item {item}")
    if row["url"].startswith("http"):
        page = {"url": row["url"], "titel": row["title"], "text": fetch.article_text(row["url"]) or row["text"]}
        try:
            subprocess.run(["gulsearch", "save-page"], input=json.dumps(page), text=True, encoding="utf-8", capture_output=True, timeout=120, check=True)
        except (OSError, subprocess.SubprocessError):
            pass  # sökningen är inte installerad – posten markeras ändå som sparad i Greed
    db.event(item, "save")
    return f"Saved \"{row['title']}\""


def refresh(db, force=False):
    """Hämta, poängsätt och låt agenten välja ut nu."""
    from . import curate, score
    fetched = fetch.fetch_due(db, force=force)
    scored = score.score_new(db, core.profile())
    digest = curate.curate(db, core.settings(), core.profile())
    return {"fetched": fetched, "scored": scored, "digest": digest}


def serve():
    server = ThreadingHTTPServer(("127.0.0.1", PORT), Handler)
    threading.Thread(target=server.serve_forever, daemon=True).start()
    return server
