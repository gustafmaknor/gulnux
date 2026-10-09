"""Greed som MCP-server (stdio): agenterna kan läsa flödet, ge återkoppling och ändra källor och intressen."""

import json
import sys

from . import __version__, core

INSTRUCTIONS = """Greed is the user's self-curating feed: it collects news and posts from many sources and
picks what is really interesting for the user a few times a day. Use today when the user asks what
has happened that they care about. The user's interests are in their profile (get_profile,
update_profile); keep the format: "## Intressen" and "## Inte intresserad av", one "- " line each."""

TOOLS = {}


def tool(name, description, handler, /, required=(), **props):
    TOOLS[name] = (handler, {"name": name, "description": description,
                             "inputSchema": {"type": "object", "properties": props, "required": list(required)}})


def _today(days=1):
    return core.Db().digests(days)


def _refresh():
    from .web import refresh
    return refresh(core.Db(), force=True)


tool("today", "The latest picks from the user's feed, with summaries and why each was picked.", _today,
     days={"type": "integer", "description": "How many days back (default 1)"})
tool("feedback", "Tell Greed the user wants more (1) or less (-1) of something like this item, or undo (0).",
     lambda item, value: core.Db().feedback(int(item), int(value)) or "Noted",
     required=("item", "value"), item={"type": "integer"}, value={"type": "integer"})
tool("get_profile", "The user's interest profile (memory/greed.md).", lambda: core.profile()["text"])
tool("update_profile", "Replace the user's interest profile. Keep the two sections; tell the user what you changed.",
     lambda text: core.save_profile(text) or "Saved", required=("text",), text={"type": "string"})
tool("list_sources", "List the feed's sources.", lambda: core.load_sources())
tool("add_source",
     "Add a source: type rss with url (news sites, YouTube, Reddit, Mastodon, Bluesky …), type glome with site "
     "(posts the user scrolls past in Glome: facebook.com, instagram.com, x.com), or type gt with app and tool for "
     "active reading through a Good Times tool – only if the user explicitly chose active reading for that source.",
     lambda type, url=None, site=None, app=None, tool=None, title=None, every=None:
         core.add_source(type, title=title, url=url, site=site, app=app, tool=tool, every=every),
     required=("type",), type={"type": "string", "enum": ["rss", "glome", "gt"]}, url={"type": "string"},
     site={"type": "string"}, app={"type": "string"}, tool={"type": "string"}, title={"type": "string"},
     every={"type": "integer", "description": "Minutes between fetches"})
tool("remove_source", "Remove a source.", lambda id: core.remove_source(id), required=("id",), id={"type": "string"})
tool("refresh", "Fetch all sources and let the agent pick now instead of at the next scheduled time.", _refresh)


def handle(msg):
    method, params = msg.get("method"), msg.get("params") or {}
    if method == "initialize":
        return {"result": {"protocolVersion": params.get("protocolVersion", "2025-06-18"), "capabilities": {"tools": {}},
                           "serverInfo": {"name": "greed", "version": __version__}, "instructions": INSTRUCTIONS}}
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
    return {"error": {"code": -32601, "message": f"Unknown method: {method}"}} if "id" in msg else None


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
