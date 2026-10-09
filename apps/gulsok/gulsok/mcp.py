"""Gulnux sök som MCP-server (stdio): låter agenterna söka i användarens dokument, minne
och sparade webbsidor."""

import json
import subprocess
import sys

from . import __version__, core

INSTRUCTIONS = """Sök i användarens egna dokument (~/Dokument: Word, Excel, PowerPoint, PDF, text),
Gulnux minne och webbsidor som sparats från Glome. Sökningen förstår både exakta ord och
betydelse, så fråga gärna med en hel mening. Läs hela dokumentet med read. Office-filer
öppnas med gloffice, webbsidor med glome."""

TOOLS = {}


def tool(name, description, handler, /, required=(), **props):
    TOOLS[name] = (handler, {
        "name": name,
        "description": description,
        "inputSchema": {"type": "object", "properties": props, "required": list(required)},
    })


def _search(query, limit=10, source=None):
    return core.Index().sok(query, limit, source, core.installningar())


def _save_glome_page():
    try:
        sida = json.loads(subprocess.run(["glome-read", "--json"], capture_output=True, text=True,
                                         check=True, timeout=30).stdout)
    except (OSError, subprocess.SubprocessError, ValueError) as e:
        raise core.SokFel(f"Kunde inte läsa sidan i Glome: {e}") from None
    return core.Index().spara_sida(sida["url"], sida["titel"], sida["text"], "manuell", core.installningar())


def _reindex():
    installn = core.installningar()
    index = core.Index()
    andrade = index.skanna(installn["kallor"])
    return f"Uppdaterade {andrade} dokument. Vektorer räknas fram i bakgrunden."


ID = {"type": ["integer", "string"], "description": "Dokumentets id från search, eller sökväg/adress"}
tool("search", "Sök i användarens dokument, minne och sparade webbsidor. Ger de bästa träffarna med utdrag.",
     _search, required=("query",),
     query={"type": "string", "description": "Vad du letar efter, gärna som en mening"},
     limit={"type": "integer", "description": "Max antal träffar (standard 10)"},
     source={"type": "string", "description": "Bara en källa: dokument, minne, glome eller annan källa från status"})
tool("read", "Läs hela texten i ett dokument från sökindexet.",
     lambda id: core.Index().las(id), required=("id",), id=ID)
tool("save_glome_page", "Spara sidan som användaren har framme i Glome i sökindexet.", _save_glome_page)
tool("forget", "Ta bort ett dokument eller en sparad webbsida ur sökindexet (filen påverkas inte).",
     lambda id: core.Index().glom(id), required=("id",), id=ID)
tool("status", "Visa vad som är indexerat och om vektorsökningen är igång.",
     lambda: core.Index().status(core.installningar()))
tool("reindex", "Leta efter nya och ändrade filer nu i stället för att vänta på bakgrundstjänsten.", _reindex)


def handle(msg):
    method = msg.get("method")
    params = msg.get("params") or {}
    if method == "initialize":
        return {"result": {
            "protocolVersion": params.get("protocolVersion", "2025-06-18"),
            "capabilities": {"tools": {}},
            "serverInfo": {"name": "gulsok", "version": __version__},
            "instructions": INSTRUCTIONS,
        }}
    if method == "ping":
        return {"result": {}}
    if method == "tools/list":
        return {"result": {"tools": [spec for _, spec in TOOLS.values()]}}
    if method == "tools/call":
        name = params.get("name")
        if name not in TOOLS:
            return {"error": {"code": -32602, "message": f"Okänt verktyg: {name}"}}
        try:
            out = TOOLS[name][0](**(params.get("arguments") or {}))
            text = out if isinstance(out, str) else json.dumps(out, ensure_ascii=False, indent=1)
            return {"result": {"content": [{"type": "text", "text": text}]}}
        except Exception as e:
            return {"result": {"content": [{"type": "text", "text": f"Fel: {e}"}], "isError": True}}
    if "id" in msg:
        return {"error": {"code": -32601, "message": f"Okänd metod: {method}"}}
    return None


def main():
    sys.stdin.reconfigure(encoding="utf-8")
    sys.stdout.reconfigure(encoding="utf-8")
    for line in sys.stdin:
        if not line.strip():
            continue
        try:
            msg = json.loads(line)
        except json.JSONDecodeError:
            continue
        reply = handle(msg)
        if reply is not None and "id" in msg:
            sys.stdout.write(json.dumps({"jsonrpc": "2.0", "id": msg["id"], **reply}, ensure_ascii=False) + "\n")
            sys.stdout.flush()
