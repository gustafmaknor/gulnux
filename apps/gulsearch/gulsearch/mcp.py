"""Gulnux sök som MCP-server (stdio): låter agenterna söka i användarens dokument, minne
och sparade webbsidor."""

import json
import subprocess
import sys

from . import __version__, core

INSTRUCTIONS = """Search the user's own documents (~/Document: Word, Excel, PowerPoint, PDF, text),
the Gulnux memory and web pages saved from Glome. The search understands both exact words and
meaning, so feel free to query with a whole sentence. Read a whole document with read. Open
Office files with gloffice and web pages with glome."""

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
        raise core.SokFel(f"Could not read the page in Glome: {e}") from None
    return core.Index().spara_sida(sida["url"], sida["titel"], sida["text"], "manual", core.installningar())


def _reindex():
    installn = core.installningar()
    index = core.Index()
    andrade = index.skanna(installn["sources"])
    return f"Updated {andrade} documents. Vectors are computed in the background."


ID = {"type": ["integer", "string"], "description": "The document id from search, or a path/URL"}
tool("search", "Search the user's documents, memory and saved web pages. Returns the best hits with excerpts.",
     _search, required=("query",),
     query={"type": "string", "description": "What you are looking for, preferably as a sentence"},
     limit={"type": "integer", "description": "Max number of hits (default 10)"},
     source={"type": "string", "description": "Only one source: documents, memory, glome or another source from status"})
tool("read", "Read the full text of a document from the search index.",
     lambda id: core.Index().las(id), required=("id",), id=ID)
tool("save_glome_page", "Save the page the user has open in Glome to the search index.", _save_glome_page)
tool("forget", "Remove a document or saved web page from the search index (the file is not touched).",
     lambda id: core.Index().glom(id), required=("id",), id=ID)
tool("status", "Show what is indexed and whether vector search is running.",
     lambda: core.Index().status(core.installningar()))
tool("reindex", "Look for new and changed files now instead of waiting for the background service.", _reindex)


def handle(msg):
    method = msg.get("method")
    params = msg.get("params") or {}
    if method == "initialize":
        return {"result": {
            "protocolVersion": params.get("protocolVersion", "2025-06-18"),
            "capabilities": {"tools": {}},
            "serverInfo": {"name": "gulsearch", "version": __version__},
            "instructions": INSTRUCTIONS,
        }}
    if method == "ping":
        return {"result": {}}
    if method == "tools/list":
        return {"result": {"tools": [spec for _, spec in TOOLS.values()]}}
    if method == "tools/call":
        name = params.get("name")
        if name not in TOOLS:
            return {"error": {"code": -32602, "message": f"Unknown tool: {name}"}}
        try:
            out = TOOLS[name][0](**(params.get("arguments") or {}))
            text = out if isinstance(out, str) else json.dumps(out, ensure_ascii=False, indent=1)
            return {"result": {"content": [{"type": "text", "text": text}]}}
        except Exception as e:
            return {"result": {"content": [{"type": "text", "text": f"Error: {e}"}], "isError": True}}
    if "id" in msg:
        return {"error": {"code": -32601, "message": f"Unknown method: {method}"}}
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
