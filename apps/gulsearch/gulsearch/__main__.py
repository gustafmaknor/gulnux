"""gulsearch – Gulnux search

  gulsearch search <query>    search documents, memory and saved web pages
  gulsearch read <id>         show the full text of a hit
  gulsearch save-page         save a web page (JSON with url, titel and text on stdin)
  gulsearch forget <id>       remove a document from the index
  gulsearch status            what is indexed
  gulsearch index             update the index now, in the foreground
  gulsearch watch             the background service (started by systemd)
  gulsearch mcp               the MCP server for the agents
"""

import datetime
import json
import os
import shutil
import sys
import textwrap
import urllib.parse
from pathlib import Path

from . import core, inbaddning


SOURCES = {"documents": "Document", "memory": "Memory", "glome": "Web page"}


def style(code):
    """ANSI-färg bara när utskriften går till en terminal (och NO_COLOR inte är satt)."""
    if not sys.stdout.isatty() or os.environ.get("NO_COLOR"):
        return lambda text: text
    return lambda text: f"\033[{code}m{text}\033[0m"


AMBER = style("38;2;138;97;0")
BOLD = style("1")
DIM = style("38;2;107;100;87")
MARK = style("1;38;2;31;29;24;48;2;255;243;196")


def when(day):
    date = datetime.date.fromisoformat(day)
    days = (datetime.date.today() - date).days
    if days == 0:
        return "today"
    if days == 1:
        return "yesterday"
    if days < 7:
        return f"{days} days ago"
    return date.strftime("%-d %b" if date.year == datetime.date.today().year else "%-d %b %Y")


def place(hit):
    path = hit["sokvag"]
    if hit["kalla"] == "glome":
        url = urllib.parse.urlparse(path)
        return url.netloc + (url.path if url.path != "/" else "")
    home = str(Path.home())
    return "~" + path[len(home):] if path.startswith(home) else path


def highlight(text, words):
    out, last = [], 0
    for start, end in core.matchningar(text, words):
        out += [text[last:start], MARK(text[start:end])]
        last = end
    return "".join(out + [text[last:]])


def print_hits(query, result):
    hits = result["traffar"]
    words = result.get("ord", [])
    if not hits:
        print(f"No hits for \"{query}\".")
        if result["lage"] == "fulltext":
            print(DIM("(Full-text search only – vector search is not running, see 'gul search status'.)"))
        return
    width = max(40, min(shutil.get_terminal_size((100, 20)).columns, 110))
    print(DIM(f"{len(hits)} {'hit' if len(hits) == 1 else 'hits'} for ") + BOLD(f"\"{query}\"") + "\n")
    for nr, hit in enumerate(hits, start=1):
        meta = f"{SOURCES.get(hit['kalla'], hit['kalla'])} · {when(hit['andrad'])}"
        if hit.get("traff") == "betydelse":
            meta = "related · " + meta
        meta += f" · id {hit['id']}"
        number = f"{nr:>2}  "
        title = hit["titel"]
        room = width - len(number) - len(meta) - 2
        if len(title) > room:
            title = title[:max(10, room - 1)] + "…"
        print(AMBER(number) + BOLD(title) + " " * max(2, width - len(number) - len(title) - len(meta)) + DIM(meta))
        print("    " + DIM(place(hit)))
        lines = textwrap.wrap(hit["utdrag"], width - 4, max_lines=3, placeholder=" …")
        for line in lines:
            print("    " + highlight(line, words))
        print()
    print(DIM(f"Read a hit in full: gul search read {hits[0]['id']}"))
    if result["lage"] == "fulltext":
        print(DIM("(Full-text search only – vector search is not running, see 'gul search status'.)"))


def print_status(s):
    print(f"Index: {s['index']}")
    for source, count in sorted(s["dokument"].items()):
        print(f"  {source}: {count} documents")
    print(f"Text chunks: {s['bitar']}, of which {s['med_vektor']} have a vector")
    if not s["vektorstod"]:
        print("Vector search: sqlite-vec is missing – full text only")
    else:
        print(f"Vector search: model {s['model']}, ollama {'running' if s['ollama'] else 'not responding'}")
    print(f"Glome pages: {s['glome']}")
    print("Sources: " + ", ".join(f"{k} ({v})" for k, v in s["sources"].items()))


def main():
    args = sys.argv[1:]
    command = args[0] if args else "--help"
    settings = core.installningar()
    try:
        if command == "search":
            if len(args) < 2:
                sys.exit("What do you want to search for?")
            query = " ".join(args[1:])
            result = core.Index().sok(query, installn=settings)
            print_hits(query, result)
        elif command == "read":
            d = core.Index().las(args[1])
            print(f"# {d['titel']}\n{d['sokvag']}\n\n{d['text']}")
        elif command == "save-page":
            page = json.load(sys.stdin)
            answer = core.Index().spara_sida(page["url"], page.get("titel", ""), page.get("text", ""),
                                             "manual", settings)
            print(f"Saved \"{answer['titel']}\" to the search index." if answer["sparad"]
                  else f"Not saved: {answer['orsak']}")
        elif command == "forget":
            print(core.Index().glom(args[1]))
        elif command == "status":
            print_status(core.Index().status(settings))
        elif command == "index":
            index = core.Index()
            print(f"Updated {index.skanna(settings["sources"])} documents.")
            try:
                print(f"Computed vectors for {index.vektorisera(settings)} text chunks.")
            except inbaddning.InbaddningFel as e:
                print(f"The vectors will have to wait: {e}")
        elif command == "watch":
            from . import bevaka
            bevaka.kor()
        elif command == "mcp":
            from . import mcp
            mcp.main()
        else:
            print(__doc__)
    except core.SokFel as e:
        sys.exit(f"gulsearch: {e}")
    except (IndexError, KeyError, ValueError) as e:
        sys.exit(f"gulsearch: bad arguments ({e})")


if __name__ == "__main__":
    main()
