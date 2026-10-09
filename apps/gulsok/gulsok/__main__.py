"""gulsok – Gulnux search

  gulsok search <query>    search documents, memory and saved web pages
  gulsok read <id>         show the full text of a hit
  gulsok save-page         save a web page (JSON with url, titel and text on stdin)
  gulsok forget <id>       remove a document from the index
  gulsok status            what is indexed
  gulsok index             update the index now, in the foreground
  gulsok watch             the background service (started by systemd)
  gulsok mcp               the MCP server for the agents
"""

import json
import sys

from . import core, inbaddning


def print_hits(result):
    hits = result["traffar"]
    if not hits:
        print("No hits.")
        return
    for nr, hit in enumerate(hits, start=1):
        print(f"{nr}. {hit['titel']}  [{hit['kalla']}, {hit['andrad']}, id {hit['id']}]")
        print(f"   {hit['sokvag']}")
        print(f"   {hit['utdrag']}\n")
    if result["lage"] == "fulltext":
        print("(Full-text search only – vector search is not running yet, see 'gul search status'.)")


def print_status(s):
    print(f"Index: {s['index']}")
    for source, count in sorted(s["dokument"].items()):
        print(f"  {source}: {count} documents")
    print(f"Text chunks: {s['bitar']}, of which {s['med_vektor']} have a vector")
    if not s["vektorstod"]:
        print("Vector search: sqlite-vec is missing – full text only")
    else:
        print(f"Vector search: model {s['modell']}, ollama {'running' if s['ollama'] else 'not responding'}")
    print(f"Glome pages: {s['glome']}")
    print("Sources: " + ", ".join(f"{k} ({v})" for k, v in s["kallor"].items()))


def main():
    args = sys.argv[1:]
    command = args[0] if args else "--help"
    settings = core.installningar()
    try:
        if command == "search":
            if len(args) < 2:
                sys.exit("What do you want to search for?")
            print_hits(core.Index().sok(" ".join(args[1:]), installn=settings))
        elif command == "read":
            d = core.Index().las(args[1])
            print(f"# {d['titel']}\n{d['sokvag']}\n\n{d['text']}")
        elif command == "save-page":
            page = json.load(sys.stdin)
            answer = core.Index().spara_sida(page["url"], page.get("titel", ""), page.get("text", ""),
                                             "manuell", settings)
            print(f"Saved \"{answer['titel']}\" to the search index." if answer["sparad"]
                  else f"Not saved: {answer['orsak']}")
        elif command == "forget":
            print(core.Index().glom(args[1]))
        elif command == "status":
            print_status(core.Index().status(settings))
        elif command == "index":
            index = core.Index()
            print(f"Updated {index.skanna(settings['kallor'])} documents.")
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
        sys.exit(f"gulsok: {e}")
    except (IndexError, KeyError, ValueError) as e:
        sys.exit(f"gulsok: bad arguments ({e})")


if __name__ == "__main__":
    main()
