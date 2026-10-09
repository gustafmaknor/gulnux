"""Testar Greed: insamling (RSS, Glome, Good Times), lokal grovsortering, agentens urval,
återkoppling, rensning, sidans server och MCP-servern – med låtsasflöden, låtsasmodell och
låtsasagent.

Kör från apps/greed med en Python som har feedparser och trafilatura, och med Gulnux sök på
PYTHONPATH:

  PYTHONPATH=.:../gulsearch python tests/test_greed.py
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
import urllib.error
import urllib.request
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

ROT = Path(tempfile.mkdtemp(dir=Path.home()))
os.environ.update({
    "GULNUX_PERSONAL": str(ROT / "repo"),
    "XDG_DATA_HOME": str(ROT / "data"),
    "XDG_CONFIG_HOME": str(ROT / "config"),
    "GREED_PORT": "9393",
})

# ---------- låtsasflöden
NYHETER = [
    ("NixOS 26.11 släppt med ny installerare", "Den nya versionen av NixOS gör det enklare att installera Linux."),
    ("Bostadspriserna i Stockholm stiger igen", "Fastighetsmarknaden i Stockholm vände uppåt i september, bostadspriser ökar."),
    ("AIK vann derbyt", "Sport: fotboll i allsvenskan, AIK slog Djurgården."),
    ("Kändisparet skiljer sig", "Kändisar och skvaller från röda mattan."),
    ("Riksbanken sänker räntan", "Räntan sänks, vilket påverkar bostadspriser och bolån."),
]
UTRIKES = [
    ("NixOS release brings new installer", "Linux distribution NixOS ships a new installer."),  # samma nyhet, annan källa
    ("Storm hits the coast", "Weather news from abroad."),
]


def rss(items, base):
    entries = "".join(
        f"<item><title>{t}</title><link>{base}/{i}</link><description>{d}</description>"
        f"<pubDate>Thu, 09 Oct 2026 0{i}:00:00 GMT</pubDate></item>" for i, (t, d) in enumerate(items))
    return f'<?xml version="1.0" encoding="UTF-8"?><rss version="2.0"><channel><title>Test</title>{entries}</channel></rss>'


class Flode(BaseHTTPRequestHandler):
    def log_message(self, *a):
        pass

    def do_GET(self):
        feeds = {"/nyheter.xml": rss(NYHETER, "http://127.0.0.1:%d/n" % self.server.server_port),
                 "/utrikes.xml": rss(UTRIKES, "http://127.0.0.1:%d/u" % self.server.server_port)}
        if self.path in feeds:
            body = feeds[self.path].encode()
            self.send_response(200)
            self.send_header("Content-Type", "application/rss+xml")
        else:
            body = b"<html><body><p>Artikel</p></body></html>"
            self.send_response(404 if self.path == "/trasig.xml" else 200)
            self.send_header("Content-Type", "text/html")
        self.end_headers()
        self.wfile.write(body)


# ---------- låtsas-ollama (ordpåse) och låtsasagent
DIM = 64


def vektor(text):
    v = [0.0] * DIM
    for o in re.findall(r"\w+", text.lower()):
        v[int(hashlib.md5(o.encode()).hexdigest(), 16) % DIM] += 1
    n = math.sqrt(sum(x * x for x in v)) or 1
    return [x / n for x in v]


class Ollama(BaseHTTPRequestHandler):
    def log_message(self, *a):
        pass

    def do_GET(self):
        self.send_response(200)
        self.end_headers()
        self.wfile.write(b"{}")

    def do_POST(self):
        data = json.loads(self.rfile.read(int(self.headers["Content-Length"])))
        body = json.dumps({"embeddings": [vektor(t) for t in data["input"]]}).encode()
        self.send_response(200)
        self.end_headers()
        self.wfile.write(body)


servers = [ThreadingHTTPServer(("127.0.0.1", 0), h) for h in (Flode, Ollama)]
for s in servers:
    threading.Thread(target=s.serve_forever, daemon=True).start()
FLODE = f"http://127.0.0.1:{servers[0].server_address[1]}"
os.environ["GULSEARCH_OLLAMA"] = f"http://127.0.0.1:{servers[1].server_address[1]}"

AGENT = ROT / "agent.py"
AGENT.write_text(r'''
import json, re, sys
prompt = sys.stdin.read()
open(sys.argv[1], "w", encoding="utf-8").write(prompt)
kandidater = prompt.split("## Kandidater")[1].split("## Utanför profilen")[0]
utanfor = prompt.split("## Utanför profilen")[1].split("## Uppgift")[0]
def poster(del_):
    return [(int(i), t) for i, t in re.findall(r"^\[(\d+)\] \([^)]*\) (.+)$", del_, re.M)]
k = poster(kandidater)
nix = [i for i, t in k if "NixOS" in t]
picks = []
if nix:
    picks.append({"id": nix[0], "related": nix[1:], "summary": "NixOS har en ny installerare.", "reason": "Du följer NixOS."})
picks += [{"id": i, "summary": "Bostäder.", "reason": "Fastighetsmarknaden i Stockholm."} for i, t in k if "Bostad" in t]
picks.append({"id": 999999, "summary": "Påhittad", "reason": "Ska ignoreras"})
picks += [{"id": i, "summary": "Utanför.", "reason": "Överraskning"} for i, _ in poster(utanfor)]
print("Här är mitt urval:\n" + json.dumps({"picks": picks, "note": "Lugn dag."}, ensure_ascii=False))
''', encoding="utf-8")
PROMPT_LOGG = ROT / "senaste-prompt.txt"
os.environ["GREED_AGENT_CMD"] = json.dumps([sys.executable, str(AGENT), str(PROMPT_LOGG)])

from greed import core, curate, fetch, score, web  # noqa: E402

ok = lambda text: print("OK  ", text)  # noqa: E731

# ---------- profil och källor
p = core.profile()
assert p["likes"] == [] and core.PROFILE_FILE.exists(), "en tom profil ska skapas"
core.save_profile("""# Greed – mina intressen

## Intressen

- NixOS och Linux
- Fastighetsmarknaden och bostadspriser i Stockholm

## Inte intresserad av

- Sport och fotboll
- Kändisar och skvaller
""")
p = core.profile()
assert p["likes"][0] == "NixOS och Linux" and p["dislikes"][1] == "Kändisar och skvaller", p
core.add_source("rss", url=f"{FLODE}/nyheter.xml", title="Nyheter")
core.add_source("rss", url=f"{FLODE}/utrikes.xml", title="Utrikes")
core.add_source("rss", url=f"{FLODE}/trasig.xml", title="Trasig")
core.add_source("glome", site="x.com")
core.add_source("glome", site="facebook.com")
for bad in (lambda: core.add_source("rss", url="ftp://x"), lambda: core.add_source("rss", url=f"{FLODE}/nyheter.xml"),
            lambda: core.add_source("gt", app="facebook")):
    try:
        bad()
        raise AssertionError("borde ha gett fel")
    except core.GreedError:
        pass
ok("profil och källor")

# ---------- insamling
db = core.Db()
res = fetch.fetch_due(db, force=True)
assert res["127.0.0.1"] == 5 and res["127.0.0.1-2"] == 2 and str(res["127.0.0.1-3"]).startswith("error"), res
assert fetch.fetch_due(db, force=True)["127.0.0.1"] == 0, "samma artiklar ska inte sparas två gånger"
assert list(fetch.due(db, core.load_sources())) == [], "nyss hämtade källor är inte på tur"
assert db.source_states()["127.0.0.1-3"]["last_error"]

r = fetch.capture(db, "x.com", [{"url": "https://x.com/a/status/1", "text": "Ny version av NixOS ute nu, installeraren är mycket bättre", "author": "nixos_org"},
                                 {"text": "Ett inlägg utan egen länk men med tillräckligt mycket text"}, {"text": "kort"}])
assert r["saved"] == 2, r
assert fetch.capture(db, "x.com", [{"text": "Ett inlägg utan egen länk men med tillräckligt mycket text"}])["saved"] == 0
core.update_source("facebook.com", enabled=False)
assert fetch.capture(db, "facebook.com", [{"text": "Något på Facebook som inte ska sparas alls"}])["saved"] == 0
assert fetch.capture(db, "instagram.com", [{"text": "Instagram är ingen källa i testet än"}])["saved"] == 0
assert db.one("SELECT url FROM items WHERE url LIKE 'glome://%'")

real_run = subprocess.run
subprocess.run = lambda cmd, **kw: subprocess.CompletedProcess(cmd, 0, json.dumps({"summary": "2 inlägg", "data": [
    {"url": "https://facebook.com/posts/1", "text": "Mäklaren tipsar om bostadspriser i Stockholm i höst", "author": "Anna"},
    {"url": "https://facebook.com/posts/2", "text": "Bild från semestern på stranden"}]}), "")
try:
    assert fetch.fetch_gt({"app": "facebook", "tool": "flode"})[0]["author"] == "Anna"
    assert db.ingest("facebook-flode", fetch.fetch_gt({"app": "facebook", "tool": "flode"})) == 2
finally:
    subprocess.run = real_run
ok("insamling: RSS, trasig källa, Glome (påslagen, avstängd, okänd), aktiv läsning via GT")

# ---------- lokal grovsortering
assert score.score_new(db, core.profile()) == 11
s = {r["title"]: r["score"] for r in db.q("SELECT title, score FROM items")}
assert s["NixOS 26.11 släppt med ny installerare"] > s["AIK vann derbyt"], s
assert s["Bostadspriserna i Stockholm stiger igen"] > s["Kändisparet skiljer sig"], s
assert db.one("SELECT count(*) AS n FROM items WHERE status = 'new'")["n"] == 0
ok("grovsortering: intressen före sport och kändisar")

# ---------- agentens urval
settings = {**core.DEFAULTS, "candidates": 6, "surprise": 1}
d = curate.curate(db, settings, core.profile())
assert d and d["picks"] >= 3 and d["note"] == "Lugn dag.", d
prompt = PROMPT_LOGG.read_text(encoding="utf-8")
assert "NixOS och Linux" in prompt and "Kändisar och skvaller" in prompt and not re.search(r"@[A-Z_]+@", prompt)
dig = db.digests(1)[0]
titles = [p["title"] for p in dig["picks"]]
assert "NixOS" in titles[0], titles
nix = dig["picks"][0]
assert len(nix["sources"]) == 2, "samma nyhet från två källor ska bli ett kort med båda källorna"
assert sum(p["kind"] == "surprise" for p in dig["picks"]) <= 1
assert not any("Påhittad" in (p["summary"] or "") for p in dig["picks"]), "påhittade id ska ignoreras"
assert db.one("SELECT count(*) AS n FROM items WHERE status = 'scored'")["n"] < 11
ok(f"agentens urval: {len(titles)} valda, samma nyhet slås ihop, högst en överraskning")

# ---------- tider
now = time.mktime(time.strptime("2026-10-09 12:30", "%Y-%m-%d %H:%M"))
with db.db:
    db.db.execute("UPDATE digests SET created = ?", (now - 3 * 3600,))  # förra urvalet 09:30
assert curate.due(db, ["07:00", "12:00", "18:00"], now) is True
assert curate.due(db, ["07:00", "18:00"], now) is False
ok("schemat för urval")

# ---------- återkoppling och rensning
item = dig["picks"][0]["id"]
db.feedback(item, 1)
assert db.digests(5)[0]["picks"][0]["feedback"] == 1
db.feedback(item, 0)
try:
    db.feedback(item, 5)
    raise AssertionError("borde ha gett fel")
except core.GreedError:
    pass
sport = db.one("SELECT id FROM items WHERE title = 'AIK vann derbyt'")["id"]
db.feedback(sport, -1)
with db.db:
    db.db.execute("UPDATE items SET fetched = fetched - 40 * 86400")
removed = db.prune(30)
assert removed > 0 and db.one("SELECT 1 FROM items WHERE id = ?", (sport,)), "inlägg med återkoppling ska sparas"
ok(f"återkoppling och rensning ({removed} gamla inlägg borttagna)")

# ---------- sidans server
server = web.serve()
B = f"http://127.0.0.1:{web.PORT}"


def http(path, body=None, headers=None, follow=True):
    h = {"Content-Type": "application/json", **(headers if headers is not None else {"X-Greed": "1"})}
    req = urllib.request.Request(B + path, data=None if body is None else json.dumps(body).encode(), headers=h)
    opener = urllib.request.build_opener() if follow else urllib.request.build_opener(NoRedirect)
    try:
        with opener.open(req, timeout=10) as r:
            return r.status, r.read(), r.headers
    except urllib.error.HTTPError as e:
        return e.code, e.read(), e.headers


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, *a, **k):
        return None


assert http("/")[0] == 200 and b"Greed" in http("/")[1]
assert http("/api/today", headers={})[0] == 403, "utan X-Greed ska nekas"
assert http("/api/today", headers={"X-Greed": "1", "Host": "evil.example"})[0] == 403
digests = json.loads(http("/api/today")[1])["digests"]
assert digests and digests[0]["picks"]
pick = digests[0]["picks"][0]
status, _, headers = http(f"/go/{pick['id']}", headers={}, follow=False)
assert status == 302 and headers["Location"] == pick["url"]
assert db.one("SELECT 1 FROM events WHERE item = ? AND kind = 'open'", (pick["id"],))
assert http("/api/feedback", {"id": pick["id"], "value": -1})[0] == 200
TILLAGG = {"Origin": web.TILLAGG_ORIGIN}
cap = {"site": "x.com", "posts": [{"url": "https://x.com/b/status/2", "text": "Ännu ett inlägg om NixOS och Linux på skrivbordet"}]}
assert http("/api/capture", cap, headers={})[0] == 403, "utan tilläggets Origin ska nekas"
assert http("/api/capture", cap, headers={"Origin": "https://evil.example"})[0] == 403
assert json.loads(http("/api/capture", cap, headers=TILLAGG)[1])["saved"] == 1
sources = json.loads(http("/api/sources")[1])["sources"]
assert any(s["state"] and s["state"]["last_error"] for s in sources)
assert http("/api/sources", {"url": "https://example.com/feed.xml"})[0] == 200
assert http("/api/sources/remove", {"id": "example.com"})[0] == 200
assert "NixOS och Linux" in json.loads(http("/api/profile")[1])["text"]
saved = json.loads(http("/api/profile", {"likes": ["NixOS och Linux", "  Segling \n i skärgården "], "dislikes": []})[1])
assert saved["likes"] == ["NixOS och Linux", "Segling i skärgården"] and saved["dislikes"] == [], saved
assert saved["text"].startswith("# Greed – mina intressen") and "## Inte intresserad av\n\n-\n" in saved["text"], saved["text"]
saved = json.loads(http("/api/profile", {"text": saved["text"].replace("Segling", "Kajak")})[1])
assert "Kajak i skärgården" in saved["likes"]
assert http("/api/profile", {"likes": ["x"], "dislikes": []}, headers={})[0] == 403
server.shutdown()
ok("sidans server: flödet, öppna, återkoppling, tilläggets inlägg, källor och profil")

# ---------- MCP
env = {**os.environ, "PYTHONIOENCODING": "utf-8"}
mcp = subprocess.Popen([sys.executable, "-m", "greed", "mcp"], stdin=subprocess.PIPE, stdout=subprocess.PIPE, env=env, text=True, encoding="utf-8")


def rpc(i, method, params=None):
    mcp.stdin.write(json.dumps({"jsonrpc": "2.0", "id": i, "method": method, "params": params or {}}) + "\n")
    mcp.stdin.flush()
    return json.loads(mcp.stdout.readline())


assert rpc(1, "initialize")["result"]["serverInfo"]["name"] == "greed"
tools = [t["name"] for t in rpc(2, "tools/list")["result"]["tools"]]
today = json.loads(rpc(3, "tools/call", {"name": "today", "arguments": {"days": 5}})["result"]["content"][0]["text"])
assert today and today[0]["picks"]
added = rpc(4, "tools/call", {"name": "add_source", "arguments": {"type": "rss", "url": "https://www.svt.se/nyheter/rss.xml"}})
assert not added["result"].get("isError"), added
assert rpc(5, "tools/call", {"name": "add_source", "arguments": {"type": "gt", "app": "x"}})["result"]["isError"]
assert "NixOS" in rpc(6, "tools/call", {"name": "get_profile"})["result"]["content"][0]["text"]
mcp.stdin.close()
mcp.wait(5)
ok(f"MCP ({', '.join(tools)})")

print("\nAlla tester gick igenom.")
