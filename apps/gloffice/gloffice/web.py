"""Gloffice webbserver – körs lokalt på 127.0.0.1 och visas i Glome."""

import json
import os
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, quote, urlparse

from . import core

PORT = int(os.environ.get("GLOFFICE_PORT", "9300"))
STATIC = Path(__file__).parent / "static"
EXPORT_DIR = Path(os.environ.get("XDG_CACHE_HOME", core.HOME / ".cache")) / "gloffice"
CONTENT_TYPES = {".html": "text/html", ".js": "text/javascript", ".css": "text/css"}

# Skydd mot att webbsidor i Glome pratar med servern: Host-kontrollen stoppar
# DNS-rebinding och X-Gloffice-huvudet kräver att anropet kommer från vår egen sida.
ALLOWED_HOSTS = {f"127.0.0.1:{PORT}", f"localhost:{PORT}"}
OPEN_PATHS = {"/api/export", "/api/download"}  # öppnas som vanliga länkar

write_lock = threading.Lock()


def base_url():
    return f"http://127.0.0.1:{PORT}"


def _set_cell(b):
    message = core.sheet_write(b["path"], b["cell"], [[core.parse_input(b["value"])]], b.get("sheet"))
    # Räkna om direkt så att formeln visar ett värde (samma ångra-steg som själva ändringen)
    if str(b["value"]).startswith("=") and core.has_libreoffice():
        core.recalculate(b["path"], backup=False)
    return message


ACTIONS = {
    "/api/new": lambda b: core.create(b["path"]),
    "/api/undo": lambda b: core.undo(b["path"]),
    "/api/docx/paragraph": lambda b: core.docx_replace_paragraph(b["path"], b["index"], b["text"]),
    "/api/docx/insert": lambda b: core.docx_insert_paragraph(b["path"], b["text"], b.get("style"), b.get("after")),
    "/api/docx/delete": lambda b: core.docx_delete_paragraph(b["path"], b["index"]),
    "/api/sheet/cell": _set_cell,
    "/api/slide/text": lambda b: core.slide_set_text(b["path"], b["slide"], b["shape"], b["text"]),
    "/api/slide/add": lambda b: core.slide_add(b["path"], b.get("title", "Ny bild")),
}


class Handler(BaseHTTPRequestHandler):
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

    def _file(self, path, inline):
        path = Path(path)
        types = {".pdf": "application/pdf"}
        disposition = "inline" if inline else "attachment"
        self._send(200, path.read_bytes(), types.get(path.suffix.lower(), "application/octet-stream"),
                   [("Content-Disposition", f"{disposition}; filename*=UTF-8''{quote(path.name)}")])

    def _allowed(self, path):
        if self.headers.get("Host") not in ALLOWED_HOSTS:
            self._send(403, {"error": "fel värdnamn"})
            return False
        if path.startswith("/api/") and path not in OPEN_PATHS and self.headers.get("X-Gloffice") != "1":
            self._send(403, {"error": "saknar X-Gloffice"})
            return False
        return True

    def _handle(self, fn):
        try:
            fn()
        except (core.GlofficeError, KeyError, ValueError, IndexError, TypeError) as e:
            self._send(400, {"error": str(e)})
        except Exception as e:  # visa felet i gränssnittet i stället för att tappa anslutningen
            self._send(500, {"error": f"{type(e).__name__}: {e}"})

    def do_GET(self):
        url = urlparse(self.path)
        if not self._allowed(url.path):
            return
        q = {k: v[0] for k, v in parse_qs(url.query).items()}

        def route():
            if url.path in ("/", "/index.html", "/app.js", "/style.css"):
                name = "index.html" if url.path == "/" else url.path[1:]
                self._send(200, (STATIC / name).read_bytes(), CONTENT_TYPES[Path(name).suffix] + "; charset=utf-8")
            elif url.path == "/api/ping":
                self._send(200, {"ok": True})
            elif url.path == "/api/files":
                self._send(200, {"dir": str(core.DOCS_DIR), "files": core.list_documents()})
            elif url.path == "/api/open":
                self._send(200, core.read(q["path"]))
            elif url.path == "/api/mtime":
                self._send(200, {"mtime": core.mtime(q["path"])})
            elif url.path == "/api/export":
                self._file(core.convert(q["path"], q.get("format", "pdf"), EXPORT_DIR), inline=True)
            elif url.path == "/api/download":
                p, _ = core._existing(q["path"])
                self._file(p, inline=False)
            else:
                self._send(404, {"error": "finns inte"})
        self._handle(route)

    def do_POST(self):
        url = urlparse(self.path)
        if not self._allowed(url.path):
            return

        def route():
            action = ACTIONS.get(url.path)
            if action is None:
                return self._send(404, {"error": "finns inte"})
            body = json.loads(self.rfile.read(int(self.headers.get("Content-Length", 0))) or b"{}")
            with write_lock:
                message = action(body)
            path = message if url.path == "/api/new" else body["path"]
            self._send(200, {"message": message, "path": path, "mtime": core.mtime(path)})
        self._handle(route)


def serve():
    server = ThreadingHTTPServer(("127.0.0.1", PORT), Handler)
    print(f"Gloffice körs på {base_url()}", flush=True)
    server.serve_forever()
