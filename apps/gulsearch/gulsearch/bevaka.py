"""Bakgrundstjänsten: håller indexet uppdaterat och tar emot sidor från Glome-tillägget."""

import json
import os
import threading
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

from . import core, inbaddning

PORT = int(os.environ.get("GULSEARCH_PORT", "9301"))
INTERVALL = int(os.environ.get("GULSEARCH_INTERVALL", "60"))

# Bara Gulnux eget Glome-tillägg (fast id via nyckeln i manifest.json) får skicka sidor.
# Vanliga webbsidor kan inte förfalska Origin, så de kan inte fylla indexet med skräp.
TILLAGG_ID = "okelhmbnolibhpnjedoejgidbpnnoolh"
TILLATNA_URSPRUNG = {f"chrome-extension://{TILLAGG_ID}"}


class Hanterare(BaseHTTPRequestHandler):
    def log_message(self, *args):
        pass

    def _svar(self, status, data):
        body = json.dumps(data, ensure_ascii=False).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def _tillaten(self):
        if self.headers.get("Host") not in (f"127.0.0.1:{PORT}", f"localhost:{PORT}"):
            return False
        return self.headers.get("Origin") in TILLATNA_URSPRUNG

    # Bara POST: Chromium skickar inte Origin på GET-anrop från tillägg
    def do_POST(self):
        if not self._tillaten():
            return self._svar(403, {"fel": "not allowed"})
        if self.path == "/api/glome":
            return self._svar(200, {"lage": core.installningar()["glome"]})
        if self.path != "/api/glome/spara":
            return self._svar(404, {"fel": "not found"})
        try:
            data = json.loads(self.rfile.read(int(self.headers.get("Content-Length", 0))))
            svar = core.Index().spara_sida(str(data.get("url", "")), str(data.get("titel", "")),
                                           str(data.get("text", "")), str(data.get("lage", "manual")),
                                           core.installningar())
            self._svar(200, svar)
        except (ValueError, TypeError, AttributeError) as e:
            self._svar(400, {"fel": str(e)})


def kor():
    server = ThreadingHTTPServer(("127.0.0.1", PORT), Hanterare)
    threading.Thread(target=server.serve_forever, daemon=True).start()
    print(f"Gulnux search is watching the sources and accepting pages from Glome on 127.0.0.1:{PORT}", flush=True)

    index = core.Index()
    senaste_fel = None
    while True:
        installn = core.installningar()
        try:
            andrade = index.skanna(installn["sources"])
            if andrade:
                print(f"Updated {andrade} documents", flush=True)
            gjort = index.vektorisera(installn)
            if gjort:
                print(f"Computed vectors for {gjort} text chunks", flush=True)
            senaste_fel = None
        except inbaddning.InbaddningFel as e:
            # Fulltextsökningen fungerar ändå; vektorerna tas igen när ollama är igång
            if str(e) != senaste_fel:
                print(f"Vectors are waiting: {e}", flush=True)
                senaste_fel = str(e)
        except Exception as e:
            print(f"Error: {type(e).__name__}: {e}", flush=True)
        time.sleep(INTERVALL)
