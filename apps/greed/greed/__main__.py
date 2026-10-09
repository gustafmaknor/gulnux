"""greed – Gulnux självkurerande flöde

  greed                          open Greed in Glome
  greed today                    print the latest picks
  greed sources                  list sources
  greed add <rss-url>            add an RSS source (news sites, YouTube, Reddit, Mastodon, Bluesky …)
  greed add --glome <site>       collect posts you scroll past in Glome (facebook.com, instagram.com, x.com)
  greed add --gt <app> <tool>    active reading through a Good Times tool (your choice, your risk)
  greed remove <id>              remove a source
  greed refresh                  fetch, score and let the agent pick now
  greed watch                    the background service (started by systemd)
  greed mcp                      MCP server for the agents
"""

import json
import shutil
import subprocess
import sys
import time
import urllib.request
import webbrowser
from datetime import datetime

from . import core


def notify(title, body):
    try:
        subprocess.run(["notify-send", "-a", "Gulnux", title, body], capture_output=True, timeout=10)
    except (OSError, subprocess.SubprocessError):
        pass


def watch():
    """Bakgrundstjänsten: hämtar, poängsätter och låter agenten välja ut på de inställda tiderna."""
    from . import curate, fetch, score, web
    web.serve()
    print(f"Greed is running on {web.base_url()}", flush=True)
    db = core.Db()
    last_prune = 0
    while True:
        settings = core.settings()
        try:
            with web.lock:
                for source, result in fetch.fetch_due(db).items():
                    if isinstance(result, str):
                        print(f"{source}: {result}", flush=True)
                score.score_new(db, core.profile())
                if curate.due(db, settings["times"]):
                    first_today = not db.one("SELECT 1 FROM digests WHERE created >= ?",
                                             (datetime.now().replace(hour=0, minute=0, second=0).timestamp(),))
                    digest = curate.curate(db, settings, core.profile())
                    if digest and digest["picks"]:
                        titles = [p["title"] for p in db.digests(1)[0]["picks"]][:5]
                        heading = f"Greed: {digest['picks']} saker {'idag' if first_today else 'nu'}"
                        notify(heading, "\n".join(f"• {t}" for t in titles))
            if time.time() - last_prune > 86400:
                db.prune(settings["keep_days"])
                last_prune = time.time()
        except core.GreedError as e:
            print(f"Greed: {e}", flush=True)
        except Exception as e:  # tjänsten ska leva vidare även om en runda misslyckas
            print(f"Greed error: {type(e).__name__}: {e}", flush=True)
        time.sleep(60)


def open_ui():
    from . import web
    url = web.base_url() + "/"
    try:
        urllib.request.urlopen(url, timeout=1)
    except OSError:
        subprocess.Popen([sys.executable, "-m", "greed", "watch"], stdin=subprocess.DEVNULL,
                         stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, start_new_session=True)
        time.sleep(1.5)
    if shutil.which("glome"):
        subprocess.Popen(["glome", f"--app={url}"], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, start_new_session=True)
    else:
        webbrowser.open(url)


def main():
    args = sys.argv[1:]
    command = args[0] if args else "open"
    try:
        if command == "open":
            open_ui()
        elif command == "today":
            digests = core.Db().digests(1)
            if not digests:
                print("No picks yet today – run: greed refresh")
            for d in digests:
                print(f"== {datetime.fromtimestamp(d['created']):%H:%M}  {d['note']}")
                for p in d["picks"]:
                    print(f"● {p['title']}  [{', '.join(p['sources'])}]{'  (outside your profile)' if p['kind'] == 'surprise' else ''}")
                    print(f"    {p['summary']}\n    → {p['reason']}\n    {p['url']}")
        elif command == "sources":
            states = core.Db().source_states()
            for s in core.load_sources():
                state = states.get(s["id"]) or {}
                where = s.get("url") or s.get("site") or f"{s.get('app')} {s.get('tool')}"
                flag = "" if s.get("enabled", True) else "  (paused)"
                error = f"\n    error: {state['last_error']}" if state.get("last_error") else ""
                print(f"● {s['id']}  {s['type']}  {where}{flag}{error}")
        elif command == "add":
            if len(args) >= 3 and args[1] == "--glome":
                entry = core.add_source("glome", site=args[2])
            elif len(args) >= 4 and args[1] == "--gt":
                entry = core.add_source("gt", app=args[2], tool=args[3])
            elif len(args) >= 2:
                entry = core.add_source("rss", url=args[1])
            else:
                sys.exit("Usage: greed add <rss-url> | --glome <site> | --gt <app> <tool>")
            print(f"Added {entry['id']}")
        elif command == "remove":
            print(core.remove_source(args[1]))
        elif command == "refresh":
            from .web import refresh
            print(json.dumps(refresh(core.Db(), force=True), ensure_ascii=False, indent=2))
        elif command == "watch":
            watch()
        elif command == "mcp":
            from . import mcp
            mcp.main()
        else:
            print(__doc__)
    except core.GreedError as e:
        sys.exit(f"greed: {e}")
    except IndexError:
        sys.exit("greed: missing argument – see: greed help")


if __name__ == "__main__":
    main()
