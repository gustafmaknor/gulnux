"""Greed – ett självkurerande flöde.

Samlar in brett (RSS, inlägg du scrollar förbi i Glome och, om du valt det, aktiv läsning
via Good Times), sorterar grovt lokalt mot din intresseprofil och låter din agent välja ut
det som verkligen är intressant några gånger om dagen.

Källorna (greed/sources.json) och profilen (memory/greed.md) ligger i det personliga repot
och följer med mellan datorer. Inläggen ligger lokalt i ~/.local/share/greed.
"""

import json
import os
import re
import sqlite3
import time
from pathlib import Path

HOME = Path.home()
REPO = Path(os.environ.get("GULNUX_PERSONAL", HOME / "gulnux-personal"))
SOURCES_FILE = REPO / "greed" / "sources.json"
PROFILE_FILE = REPO / "memory" / "greed.md"
DATA_DIR = Path(os.environ.get("XDG_DATA_HOME", HOME / ".local" / "share")) / "greed"
CONFIG_FILE = Path(os.environ.get("XDG_CONFIG_HOME", HOME / ".config")) / "greed" / "config.json"

DEFAULTS = {
    "times": ["07:00", "12:00", "18:00"],  # när agenten väljer ut
    "picks": 8,                             # högst så många per urval
    "surprise": 1,                          # poster utanför profilen per urval
    "candidates": 50,                       # så många skickas till agenten
    "keep_days": 30,                        # osparade inlägg rensas efter så många dagar
}
TYPES = {"rss", "glome", "gt"}
ID = re.compile(r"^[a-z0-9][a-z0-9.-]*$")

PROFILE_TEMPLATE = """# Greed – mina intressen

Greed använder den här filen för att välja vad som hamnar i ditt flöde. Skriv med egna ord,
en rad per intresse. Agenten föreslår ändringar när den lär sig mer om vad du gillar.

## Intressen

-

## Inte intresserad av

-
"""


class GreedError(Exception):
    pass


def settings():
    values = dict(DEFAULTS)
    try:
        values.update(json.loads(CONFIG_FILE.read_text(encoding="utf-8")))
    except (OSError, ValueError):
        pass
    return values


# ------------------------------------------------------------------ profilen

def profile():
    """Intresseprofilen: {"likes": [...], "dislikes": [...], "text": "..."}."""
    if not PROFILE_FILE.exists():
        PROFILE_FILE.parent.mkdir(parents=True, exist_ok=True)
        PROFILE_FILE.write_text(PROFILE_TEMPLATE, encoding="utf-8")
    text = PROFILE_FILE.read_text(encoding="utf-8")
    likes, dislikes, section = [], [], None
    for line in text.splitlines():
        heading = line.strip().lower()
        if heading.startswith("## "):
            section = "dislikes" if "inte" in heading or "not" in heading else "likes"
        elif section and line.strip().startswith("- ") and line.strip()[2:].strip():
            (likes if section == "likes" else dislikes).append(line.strip()[2:].strip())
    return {"likes": likes, "dislikes": dislikes, "text": text}


def save_profile(text):
    PROFILE_FILE.parent.mkdir(parents=True, exist_ok=True)
    PROFILE_FILE.write_text(text, encoding="utf-8")


def save_profile_lists(likes, dislikes):
    """Skriv om profilens två listor och behåll det som står ovanför dem (rubrik och inledning)."""
    def clean(items):
        return [" ".join(str(i).split()) for i in items if str(i).strip()]
    text = profile()["text"]
    intro = re.split(r"(?m)^## ", text, maxsplit=1)[0].rstrip() or PROFILE_TEMPLATE.split("\n## ")[0].rstrip()
    lines = lambda items: "\n".join(f"- {i}" for i in clean(items)) or "-"
    save_profile(f"{intro}\n\n## Intressen\n\n{lines(likes)}\n\n## Inte intresserad av\n\n{lines(dislikes)}\n")
    return profile()


# ------------------------------------------------------------------ källorna

def load_sources():
    try:
        sources = json.loads(SOURCES_FILE.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return []
    return [s for s in sources if isinstance(s, dict) and s.get("type") in TYPES and ID.match(s.get("id", ""))]


def save_sources(sources):
    SOURCES_FILE.parent.mkdir(parents=True, exist_ok=True)
    SOURCES_FILE.write_text(json.dumps(sources, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def _source_id(base, sources):
    base = re.sub(r"[^a-z0-9.-]+", "-", base.lower()).strip("-") or "kalla"
    taken = {s["id"] for s in sources}
    name, n = base, 2
    while name in taken:
        name, n = f"{base}-{n}", n + 1
    return name


def add_source(kind, title=None, url=None, site=None, app=None, tool=None, every=None):
    """Lägg till en källa. rss: url. glome: site (t.ex. x.com). gt: app och tool (aktiv läsning)."""
    if kind not in TYPES:
        raise GreedError(f"Unknown source type {kind} (rss, glome or gt)")
    sources = load_sources()
    if kind == "rss":
        if not re.match(r"^https?://", url or ""):
            raise GreedError("An RSS source needs an http(s) address")
        if any(s.get("url") == url for s in sources):
            raise GreedError(f"{url} is already a source")
        base = re.sub(r"^www\.", "", url.split("/")[2].split(":")[0])
        entry = {"type": "rss", "url": url, "every": every or 30}
    elif kind == "glome":
        if not site:
            raise GreedError("A Glome source needs a site, e.g. x.com")
        base = site
        entry = {"type": "glome", "site": site}
    else:
        if not (app and tool):
            raise GreedError("Active reading needs a Good Times app and tool (gt tools <app>)")
        base = f"{app}-{tool}"
        entry = {"type": "gt", "app": app, "tool": tool, "every": every or 720, "active": True}
    entry = {"id": _source_id(base, sources), "title": title or base, "enabled": True, **entry}
    sources.append(entry)
    save_sources(sources)
    return entry


def update_source(source_id, **changes):
    sources = load_sources()
    for s in sources:
        if s["id"] == source_id:
            s.update({k: v for k, v in changes.items() if k in ("enabled", "title", "every")})
            save_sources(sources)
            return s
    raise GreedError(f"No source called {source_id}")


def remove_source(source_id):
    sources = load_sources()
    kept = [s for s in sources if s["id"] != source_id]
    if len(kept) == len(sources):
        raise GreedError(f"No source called {source_id}")
    save_sources(kept)
    return f"Removed {source_id}"


# ------------------------------------------------------------------ databasen

class Db:
    def __init__(self, path=None):
        self.path = Path(path or DATA_DIR / "greed.sqlite")
        self.path.parent.mkdir(parents=True, exist_ok=True)
        self.db = sqlite3.connect(self.path, timeout=30)
        self.db.row_factory = sqlite3.Row
        self.db.executescript("""
            PRAGMA journal_mode = WAL;
            CREATE TABLE IF NOT EXISTS items (
                id INTEGER PRIMARY KEY,
                source TEXT NOT NULL,
                url TEXT NOT NULL UNIQUE,
                title TEXT,
                text TEXT,
                author TEXT,
                published REAL,
                fetched REAL NOT NULL,
                vector BLOB,
                score REAL,
                status TEXT NOT NULL DEFAULT 'new'   -- new, scored, considered, picked
            );
            CREATE INDEX IF NOT EXISTS items_status ON items(status, fetched);
            CREATE TABLE IF NOT EXISTS source_state (
                source TEXT PRIMARY KEY, last_fetch REAL, last_error TEXT, total INTEGER DEFAULT 0
            );
            CREATE TABLE IF NOT EXISTS digests (id INTEGER PRIMARY KEY, created REAL NOT NULL, note TEXT);
            CREATE TABLE IF NOT EXISTS picks (
                digest INTEGER NOT NULL, item INTEGER NOT NULL, position INTEGER,
                kind TEXT, reason TEXT, summary TEXT, related TEXT
            );
            CREATE TABLE IF NOT EXISTS feedback (item INTEGER PRIMARY KEY, value INTEGER NOT NULL, time REAL);
            CREATE TABLE IF NOT EXISTS events (item INTEGER, kind TEXT, time REAL);
            CREATE TABLE IF NOT EXISTS vcache (key TEXT PRIMARY KEY, vector BLOB);
        """)

    def q(self, sql, args=()):
        return self.db.execute(sql, args).fetchall()

    def one(self, sql, args=()):
        return self.db.execute(sql, args).fetchone()

    def ingest(self, source, entries):
        """Spara nya inlägg; samma adress sparas bara en gång. Returnerar antalet nya."""
        new = 0
        now = time.time()
        with self.db:
            for e in entries:
                url = (e.get("url") or "").strip()
                text = (e.get("text") or "").strip()
                title = (e.get("title") or "").strip()
                if not url or not (title or text):
                    continue
                cur = self.db.execute(
                    "INSERT OR IGNORE INTO items (source, url, title, text, author, published, fetched) VALUES (?, ?, ?, ?, ?, ?, ?)",
                    (source, url, title[:300], text[:5000], (e.get("author") or "")[:200], e.get("published") or now, now))
                new += cur.rowcount
            self.db.execute(
                "INSERT INTO source_state (source, last_fetch, last_error, total) VALUES (?, ?, NULL, ?) "
                "ON CONFLICT(source) DO UPDATE SET last_fetch = excluded.last_fetch, last_error = NULL, total = total + ?",
                (source, now, new, new))
        return new

    def fetch_failed(self, source, error):
        with self.db:
            self.db.execute(
                "INSERT INTO source_state (source, last_fetch, last_error) VALUES (?, ?, ?) "
                "ON CONFLICT(source) DO UPDATE SET last_fetch = excluded.last_fetch, last_error = excluded.last_error",
                (source, time.time(), str(error)[:300]))

    def feedback(self, item, value):
        if value not in (-1, 0, 1):
            raise GreedError("Feedback is 1 (more like this), -1 (less) or 0 (undo)")
        if not self.one("SELECT 1 FROM items WHERE id = ?", (item,)):
            raise GreedError(f"No item {item}")
        with self.db:
            if value == 0:
                self.db.execute("DELETE FROM feedback WHERE item = ?", (item,))
            else:
                self.db.execute("INSERT OR REPLACE INTO feedback (item, value, time) VALUES (?, ?, ?)", (item, value, time.time()))

    def event(self, item, kind):
        with self.db:
            self.db.execute("INSERT INTO events (item, kind, time) VALUES (?, ?, ?)", (item, kind, time.time()))

    def prune(self, keep_days):
        """Rensa gamla inlägg som inte valts ut, sparats eller fått återkoppling."""
        cutoff = time.time() - keep_days * 86400
        with self.db:
            cur = self.db.execute("""
                DELETE FROM items WHERE fetched < ?
                  AND id NOT IN (SELECT item FROM feedback)
                  AND id NOT IN (SELECT item FROM events WHERE kind = 'save')
                  AND id NOT IN (SELECT item FROM picks WHERE digest IN (SELECT id FROM digests WHERE created >= ?))
            """, (cutoff, cutoff))
            self.db.execute("DELETE FROM picks WHERE item NOT IN (SELECT id FROM items)")
        return cur.rowcount

    def digests(self, days=3):
        """De senaste urvalen med sina poster, nyast först."""
        since = time.time() - days * 86400
        out = []
        for d in self.q("SELECT * FROM digests WHERE created >= ? ORDER BY created DESC", (since,)):
            picks = []
            for p in self.q("""
                SELECT p.*, i.title, i.url, i.source, i.author, i.published, f.value AS feedback,
                       EXISTS (SELECT 1 FROM events e WHERE e.item = i.id AND e.kind = 'save') AS saved
                FROM picks p JOIN items i ON i.id = p.item LEFT JOIN feedback f ON f.item = i.id
                WHERE p.digest = ? ORDER BY p.position""", (d["id"],)):
                related = json.loads(p["related"] or "[]")
                sources = [p["source"]] + [r["source"] for r in self.q(
                    f"SELECT source FROM items WHERE id IN ({','.join('?' * len(related))})", related)] if related else [p["source"]]
                picks.append({
                    "id": p["item"], "title": p["title"], "url": p["url"], "author": p["author"],
                    "sources": sorted(set(sources)), "kind": p["kind"], "reason": p["reason"],
                    "summary": p["summary"], "feedback": p["feedback"] or 0, "saved": bool(p["saved"]),
                })
            out.append({"id": d["id"], "created": d["created"], "note": d["note"], "picks": picks})
        return out

    def source_states(self):
        return {r["source"]: dict(r) for r in self.q("SELECT * FROM source_state")}
