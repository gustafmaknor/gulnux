"""Testar Gloffice: kärnan, MCP-servern över stdio och webbservern över HTTP.

Kör från apps/gloffice med en Python som har python-docx, openpyxl och python-pptx:

  GLOFFICE_DIR=$(mktemp -d -p ~) XDG_DATA_HOME=$(mktemp -d) GLOFFICE_PORT=9311 \
    PYTHONPATH=. python tests/test_gloffice.py
"""
import json
import os
import subprocess
import sys
import time
import urllib.request

from gloffice import core

D = core.DOCS_DIR
ok = lambda label: print("OK  ", label)

# ---------- kärnan
for name in ("test.docx", "budget.xlsx", "deck.pptx"):
    (D / name).unlink(missing_ok=True)
    core.create(name)
ok("create")

core.docx_insert_paragraph("test.docx", "Rubrik", style="Heading 1")
core.docx_insert_paragraph("test.docx", "Första stycket med kaffe.")
core.docx_insert_paragraph("test.docx", "Mellan", after=0)
core.docx_add_table("test.docx", [["Namn", "Pris"], ["Kaffe", 35]], after=1)
print(core.docx_find_replace("test.docx", "kaffe", "te"))
core.docx_replace_paragraph("test.docx", 1, "Mellan (ändrad)")
s = core.summary("test.docx")
print(s)
assert "[0] (Heading 1) Rubrik" in s and "[1] (Normal) Mellan (ändrad)" in s and "med te." in s
blocks = core.read("test.docx")["blocks"]
assert [b["type"] for b in blocks] == ["paragraph", "paragraph", "table", "paragraph"], blocks
core.docx_delete_paragraph("test.docx", 1)
print(core.undo("test.docx"))
assert "Mellan (ändrad)" in core.summary("test.docx")
ok("docx")

core.sheet_write("budget.xlsx", "A1", [["Post", "Belopp"], ["Hyra", 9500], ["Mat", 4000], ["Summa", "=SUM(B2:B3)"]])
core.sheet_add("budget.xlsx", "Höst")
r = core.sheet_read("budget.xlsx", cells="A1:B4")
print(r)
assert r["values"][1] == ["Hyra", 9500] and r["formulas"] == {"B4": "=SUM(B2:B3)"}
assert core.parse_input("12,5") == 12.5 and core.parse_input("7") == 7 and core.parse_input("=A1") == "=A1"
print(core.summary("budget.xlsx"))
ok("xlsx")

core.slide_add("deck.pptx", "Gulnux", ["AI-first", "NixOS", "Sway"])
core.slide_add("deck.pptx", "Att ta bort")
core.slide_set_text("deck.pptx", 1, 0, "Gulnux ✨")
core.slide_delete("deck.pptx", 2)
s = core.summary("deck.pptx")
print(s)
assert "Gulnux ✨" in s and "Bild 2" not in s and "AI-first" in s
ok("pptx")

for bad in (lambda: core.resolve("C:/Windows/x.docx" if os.name == "nt" else "/etc/x.docx"),
            lambda: core.docx_delete_paragraph("test.docx", 99),
            lambda: core.sheet_read("test.docx")):
    try:
        bad()
        raise AssertionError("borde ha gett fel")
    except core.GlofficeError as e:
        print("förväntat fel:", e)
ok("felhantering")

# ---------- MCP över stdio
env = {**os.environ, "PYTHONIOENCODING": "utf-8"}
p = subprocess.Popen([sys.executable, "-m", "gloffice", "mcp"], stdin=subprocess.PIPE, stdout=subprocess.PIPE,
                     env=env, text=True, encoding="utf-8")
def rpc(id, method, params=None):
    p.stdin.write(json.dumps({"jsonrpc": "2.0", "id": id, "method": method, "params": params or {}}) + "\n")
    p.stdin.flush()
    return json.loads(p.stdout.readline())
init = rpc(1, "initialize", {"protocolVersion": "2025-06-18", "capabilities": {}, "clientInfo": {"name": "t", "version": "0"}})
assert init["result"]["serverInfo"]["name"] == "gloffice"
p.stdin.write(json.dumps({"jsonrpc": "2.0", "method": "notifications/initialized"}) + "\n")
tools = rpc(2, "tools/list")["result"]["tools"]
print("verktyg:", ", ".join(t["name"] for t in tools))
res = rpc(3, "tools/call", {"name": "sheet_write", "arguments": {"path": "budget.xlsx", "start": "C1", "values": [["Via MCP"]]}})
assert not res["result"].get("isError"), res
res = rpc(4, "tools/call", {"name": "sheet_read", "arguments": {"path": "budget.xlsx", "range": "C1"}})
assert "Via MCP" in res["result"]["content"][0]["text"], res
res = rpc(5, "tools/call", {"name": "docx_delete_paragraph", "arguments": {"path": "test.docx", "index": 42}})
assert res["result"]["isError"], res
res = rpc(6, "nope")
assert res["error"]["code"] == -32601
p.stdin.close(); p.wait(5)
ok(f"mcp ({len(tools)} verktyg)")

# ---------- webbservern
port = os.environ["GLOFFICE_PORT"]
srv = subprocess.Popen([sys.executable, "-m", "gloffice", "serve"], env=env, stdout=subprocess.DEVNULL)
base = f"http://127.0.0.1:{port}"
def http(path, body=None, headers={"X-Gloffice": "1"}):
    req = urllib.request.Request(base + path, data=None if body is None else json.dumps(body).encode(),
                                 headers={**headers, "Content-Type": "application/json"})
    try:
        with urllib.request.urlopen(req) as r:
            return r.status, r.read()
    except urllib.error.HTTPError as e:
        return e.code, e.read()
try:
    for _ in range(50):
        try:
            if http("/api/ping")[0] == 200: break
        except OSError:
            time.sleep(0.1)
    assert http("/")[0] == 200 and b"Gloffice" in http("/")[1]
    assert http("/app.js")[0] == 200
    files = json.loads(http("/api/files")[1])["files"]
    assert {"test.docx", "budget.xlsx", "deck.pptx"} <= {f["name"] for f in files}
    path = str(D / "budget.xlsx")
    status, body = http("/api/sheet/cell", {"path": path, "sheet": "Sheet", "cell": "B2", "value": "9800,5"})
    assert status == 200, body
    doc = json.loads(http(f"/api/open?path={urllib.parse.quote(path)}")[1])
    assert doc["sheets"][0]["rows"][1][1]["v"] == 9800.5 and doc["sheets"][0]["rows"][3][1]["f"] == "=SUM(B2:B3)"
    assert http("/api/files", headers={})[0] == 403, "saknat X-Gloffice ska nekas"
    assert http("/api/files", headers={"X-Gloffice": "1", "Host": "evil.example:80"})[0] == 403, "fel Host ska nekas"
    assert http("/api/open?path=C:/Windows/win.ini")[0] == 400
    ok("web")
finally:
    srv.terminate()
print("\nAlla tester gick igenom.")
