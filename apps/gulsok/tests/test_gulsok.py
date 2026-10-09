"""Testar Gulnux sök: indexering, fulltext, vektorer (mot en låtsas-ollama), Glome-lägen,
tjänstens HTTP-gränssnitt och MCP-servern.

Kör från apps/gulsok med en Python som har python-docx, openpyxl, python-pptx, pypdf och
sqlite-vec, och med Gloffice på PYTHONPATH:

  T=$(mktemp -d -p ~) PYTHONPATH=.:../gloffice python tests/test_gulsok.py
"""
import hashlib
import json
import math
import os
import re
import subprocess
import sys
import tempfile
import threading
import time
import urllib.request
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

# Allt hamnar i en egen katalog under hemkatalogen (Gloffice kräver det)
ROT = Path(os.environ.get("T") or tempfile.mkdtemp(dir=Path.home()))
os.environ["XDG_DATA_HOME"] = str(ROT / "data")
os.environ["XDG_CONFIG_HOME"] = str(ROT / "config")
DOK, MINNE = ROT / "Document", ROT / "memory"
DOK.mkdir(parents=True, exist_ok=True)
MINNE.mkdir(parents=True, exist_ok=True)


def skriv_config(**extra):
    fil = ROT / "config" / "gulsok" / "config.json"
    fil.parent.mkdir(parents=True, exist_ok=True)
    fil.write_text(json.dumps({"sources": {"documents": str(DOK), "memory": str(MINNE)}, **extra}), encoding="utf-8")


# ---------- låtsas-ollama: deterministiska vektorer från orden (fungerar som en enkel ordpåse)
DIM = 64


def vektor(text):
    v = [0.0] * DIM
    for o in re.findall(r"\w+", text.lower()):
        v[int(hashlib.md5(o.encode()).hexdigest(), 16) % DIM] += 1
    norm = math.sqrt(sum(x * x for x in v)) or 1
    return [x / norm for x in v]


class Ollama(BaseHTTPRequestHandler):
    anrop = 0

    def log_message(self, *a):
        pass

    def do_GET(self):
        self.send_response(200)
        self.end_headers()
        self.wfile.write(b'{"models":[]}')

    def do_POST(self):
        data = json.loads(self.rfile.read(int(self.headers["Content-Length"])))
        Ollama.anrop += 1
        body = json.dumps({"embeddings": [vektor(t) for t in data["input"]]}).encode()
        self.send_response(200)
        self.end_headers()
        self.wfile.write(body)


ollama = ThreadingHTTPServer(("127.0.0.1", 0), Ollama)
threading.Thread(target=ollama.serve_forever, daemon=True).start()
os.environ["GULSOK_OLLAMA"] = f"http://127.0.0.1:{ollama.server_address[1]}"

from gloffice import core as gloffice  # noqa: E402
from gulsok import core  # noqa: E402

ok = lambda text: print("OK  ", text)  # noqa: E731

# ---------- dela
lang = " ".join(f"Mening nummer {i} handlar om något." for i in range(400))
bitar = core.dela(lang)
assert all(len(b) <= core.BIT_STORLEK for b in bitar) and len(bitar) > 5
assert "Mening nummer 0 " in bitar[0] and "nummer 399" in bitar[-1]
assert core.dela("") == [] and core.dela("kort") == ["kort"]
ok(f"dela ({len(bitar)} bitar)")

# ---------- testdokument
skriv_config()
offert = DOK / "offert-tak.docx"
gloffice.create(str(offert))
gloffice.docx_insert_paragraph(str(offert), "Offert takbyte", style="Heading 1")
gloffice.docx_insert_paragraph(str(offert), "Byte av tegeltak på sommarstugan i Roslagen, 142 000 kr inklusive moms.")
budget = DOK / "budget.xlsx"
gloffice.create(str(budget))
gloffice.sheet_write(str(budget), "A1", [["Post", "Belopp"], ["Växthus", 25000], ["Hyra", 9500]])
deck = DOK / "Projekt" / "kickoff.pptx"
gloffice.create(str(deck))
gloffice.slide_add(str(deck), "Kickoff Gulnux", ["Tidsplan för hösten", "Ansvariga"])
(DOK / "anteckning.md").write_text("# Recept\n\nKardemummabullar med mycket smör.", encoding="utf-8")
(DOK / "sida.html").write_text("<html><script>var hemlig=1</script><body><p>Guide till Sway-fönsterhanteraren</p></body></html>", encoding="utf-8")
(DOK / ".dold.md").write_text("ska inte indexeras", encoding="utf-8")
(DOK / "bild.png").write_bytes(b"\x89PNG")
(MINNE / "MEMORY.md").write_text("- [Föredrar mörkt tema](tema.md) — användaren vill ha mörka färger", encoding="utf-8")

# Minimal PDF med en textrad
pdf_text = "Hyresavtal for lagenheten pa Sodermalm"
strom = f"BT /F1 12 Tf 72 720 Td ({pdf_text}) Tj ET".encode()
objekt = [b"<< /Type /Catalog /Pages 2 0 R >>", b"<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
          b"<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>",
          b"<< /Length %d >>stream\n" % len(strom) + strom + b"\nendstream",
          b"<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>"]
pdf, platser = b"%PDF-1.4\n", []
for i, o in enumerate(objekt, start=1):
    platser.append(len(pdf))
    pdf += b"%d 0 obj\n" % i + o + b"\nendobj\n"
xref = len(pdf)
pdf += b"xref\n0 %d\n0000000000 65535 f \n" % (len(objekt) + 1) + b"".join(b"%010d 00000 n \n" % p for p in platser)
pdf += b"trailer\n<< /Size %d /Root 1 0 R >>\nstartxref\n%d\n%%%%EOF\n" % (len(objekt) + 1, xref)
(DOK / "avtal.pdf").write_bytes(pdf)

# ---------- indexering och fulltext
index = core.Index()
installn = core.installningar()
assert index.skanna(installn["sources"]) == 7, index.db.execute("select sokvag from dokument").fetchall()
assert index.skanna(installn["sources"]) == 0, "oförändrade filer ska inte indexeras om"
assert index.vec is not None, "sqlite-vec ska gå att ladda"
fragor = {
    "takbyte sommarstugan": "offert-tak.docx",
    "vaxthus": "budget.xlsx",              # utan prickar ska hitta Växthus
    "tidsplan hösten": "kickoff.pptx",
    "kardemummabullar": "anteckning.md",
    "Sway": "sida.html",
    "hyresavtal Södermalm": "avtal.pdf",
    "mörkt tema": "MEMORY.md",
    "sommarstuga": "offert-tak.docx",       # grundform hittar böjd form ("sommarstugan") via prefix
}
for fraga, vantat in fragor.items():
    r = index.sok(fraga, installn=None)
    assert r["traffar"] and r["traffar"][0]["titel"] == vantat, (fraga, r)
assert not index.sok("hemlig", installn=None)["traffar"], "script-innehåll ska inte indexeras"
assert not index.sok("indexeras", installn=None)["traffar"], "dolda filer ska hoppas över"
assert index.sok("och i att", installn=None)["traffar"] == [], "bara stoppord ska inte ge brus"
assert index.sok("tema", kalla="documents", installn=None)["traffar"] == []
ok("indexering och fulltext (" + ", ".join(fragor.values()) + ")")

# ---------- vektorer och hybrid
gjorda = index.vektorisera(installn)
s = index.status(installn)
assert gjorda == s["bitar"] == s["med_vektor"] and s["ollama"], s
r = index.sok("tegeltak Roslagen", installn=installn)
assert r["lage"] == "hybrid" and r["traffar"][0]["titel"] == "offert-tak.docx", r
assert index.vektorisera(installn) == 0
ok(f"vektorer och hybridsökning ({gjorda} bitar)")

# ---------- ändrade och borttagna filer
time.sleep(0.05)
gloffice.docx_replace_paragraph(str(offert), 1, "Byte av plåttak, nytt pris 98 000 kr.")
os.utime(offert, None)
(DOK / "anteckning.md").unlink()
assert index.skanna(installn["sources"]) == 2
assert index.sok("plåttak", installn=None)["traffar"][0]["titel"] == "offert-tak.docx"
assert not index.sok("tegeltak", installn=None)["traffar"]
assert not index.sok("kardemummabullar", installn=None)["traffar"]
assert index.vektorisera(installn) > 0
ok("ändrade och borttagna filer")

# ---------- Glome-lägen
sida = ("https://example.com/artikel#del2", "NixOS flakes förklarat", "En lång artikel om hur NixOS flakes låser beroenden. " * 5)
skriv_config(glome="off")
assert not index.spara_sida(*sida, "manual", core.installningar())["sparad"]
skriv_config(glome="manual")
assert not index.spara_sida(*sida, "auto", core.installningar())["sparad"]
svar = index.spara_sida(*sida, "manual", core.installningar())
assert svar["sparad"], svar
skriv_config(glome="auto", exclude=["bank"])
installn = core.installningar()
assert not index.spara_sida("https://minbank.se/konto", "Konto", "x" * 100, "auto", installn)["sparad"]
assert index.spara_sida("https://minbank.se/konto", "Konto", "Saldo och transaktioner " * 5, "manual", installn)["sparad"], \
    "knappen ska fungera även på undantagna sidor"
assert not index.spara_sida("https://example.com/tom", "Tom", "kort", "auto", installn)["sparad"]
assert not index.spara_sida("file:///etc/passwd", "x", "y" * 100, "manual", installn)["sparad"]
assert index.spara_sida(*sida, "auto", installn)["id"] == svar["id"], "samma sida igen ska inte dubbleras"
t = index.sok("flakes låser beroenden", installn=installn)["traffar"][0]
assert t["kalla"] == "glome" and t["sokvag"] == "https://example.com/artikel", t
assert "låser beroenden" in index.las(t["id"])["text"]
print(index.glom("https://minbank.se/konto"))
assert not index.sok("transaktioner", installn=None)["traffar"]
ok("Glome: av, manuell, auto, undantag och glöm")

# ---------- bakgrundstjänstens HTTP-gränssnitt
env = {**os.environ, "GULSOK_PORT": "9391", "GULSOK_INTERVALL": "3600", "PYTHONIOENCODING": "utf-8"}
tjanst = subprocess.Popen([sys.executable, "-m", "gulsok", "watch"], env=env, stdout=subprocess.PIPE, text=True)
from gulsok import bevaka  # noqa: E402
URSPRUNG = f"chrome-extension://{bevaka.TILLAGG_ID}"


def http(vag, data=None, origin=URSPRUNG, host="127.0.0.1:9391"):
    huvud = {"Content-Type": "application/json", "Host": host}
    if origin:
        huvud["Origin"] = origin
    req = urllib.request.Request("http://127.0.0.1:9391" + vag, headers=huvud,
                                 data=None if data is None else json.dumps(data).encode())
    try:
        with urllib.request.urlopen(req, timeout=5) as svar:
            return svar.status, json.load(svar)
    except urllib.error.HTTPError as e:
        return e.code, json.load(e)


try:
    for _ in range(50):
        try:
            if http("/api/glome", {})[0] == 200:
                break
        except OSError:
            time.sleep(0.1)
    assert http("/api/glome", {}) == (200, {"lage": "auto"})
    assert http("/api/glome", {}, origin=None)[0] == 403, "utan Origin ska nekas"
    assert http("/api/glome", {}, origin="https://evil.example")[0] == 403, "vanliga webbsidor ska nekas"
    assert http("/api/glome", {}, host="evil.example:9391")[0] == 403, "DNS-rebinding ska nekas"
    status, svar = http("/api/glome/spara", {"url": "https://wiki.example/sway", "titel": "Sway-tips",
                                             "text": "Tips om tangentbordsgenvägar i Sway och tiling. " * 4,
                                             "lage": "manual"})
    assert status == 200 and svar["sparad"], svar
    assert core.Index().sok("tangentbordsgenvägar", installn=None)["traffar"][0]["titel"] == "Sway-tips"
    ok("tjänstens HTTP-gränssnitt för Glome-tillägget")
finally:
    tjanst.terminate()

# ---------- MCP
p = subprocess.Popen([sys.executable, "-m", "gulsok", "mcp"], stdin=subprocess.PIPE, stdout=subprocess.PIPE,
                     env=env, text=True, encoding="utf-8")


def rpc(id_, metod, params=None):
    p.stdin.write(json.dumps({"jsonrpc": "2.0", "id": id_, "method": metod, "params": params or {}}) + "\n")
    p.stdin.flush()
    return json.loads(p.stdout.readline())


assert rpc(1, "initialize")["result"]["serverInfo"]["name"] == "gulsok"
verktyg = [t["name"] for t in rpc(2, "tools/list")["result"]["tools"]]
svar = rpc(3, "tools/call", {"name": "search", "arguments": {"query": "plåttak pris"}})
resultat = json.loads(svar["result"]["content"][0]["text"])
assert resultat["lage"] == "hybrid" and resultat["traffar"][0]["titel"] == "offert-tak.docx", resultat
svar = rpc(4, "tools/call", {"name": "read", "arguments": {"id": 999999}})
assert svar["result"]["isError"]
status = json.loads(rpc(5, "tools/call", {"name": "status"})["result"]["content"][0]["text"])
assert status["glome"] == "auto" and status["dokument"]["glome"] == 2, status
p.stdin.close()
p.wait(5)
ok(f"mcp ({', '.join(verktyg)})")

print("\nAlla tester gick igenom.")
