"""Insamling: RSS/Atom (nyhetssajter, YouTube, Reddit, Mastodon, Bluesky …), aktiv läsning via
Good Times och inlägg som Glome-tillägget skickar när du scrollar förbi dem."""

import calendar
import hashlib
import html
import json
import re
import subprocess
import time

from .core import GreedError, load_sources


def _strip_html(text):
    text = re.sub(r"<(script|style)[^>]*>.*?</\1>", " ", text or "", flags=re.S | re.I)
    text = re.sub(r"<[^>]+>", " ", text)
    return re.sub(r"\s+", " ", html.unescape(text)).strip()


def fetch_rss(source):
    import feedparser
    feed = feedparser.parse(source["url"], agent="Gulnux Greed/0.1 (+https://github.com/gustafmaknor/gulnux)")
    if feed.bozo and not feed.entries:
        raise GreedError(f"Could not read the feed: {feed.bozo_exception}")
    entries = []
    for e in feed.entries:
        published = e.get("published_parsed") or e.get("updated_parsed")
        entries.append({
            "url": e.get("link", ""),
            "title": _strip_html(e.get("title", "")),
            "text": _strip_html(e.get("summary", "") or (e.get("content") or [{}])[0].get("value", "")),
            "author": e.get("author", ""),
            "published": calendar.timegm(published) if published else None,
        })
    return entries


def fetch_gt(source):
    """Aktiv läsning: ett Good Times-verktyg som returnerar inlägg i data
    ([{url, title?, text, author?, published?}, …])."""
    try:
        out = subprocess.run(["gt", "run", source["app"], source["tool"]], capture_output=True, text=True, encoding="utf-8",
                             timeout=600, check=True).stdout
        data = json.loads(out).get("data") or []
    except subprocess.CalledProcessError as e:
        raise GreedError((e.stderr or "").strip() or f"gt run {source['app']} {source['tool']} failed") from None
    except (OSError, ValueError, subprocess.TimeoutExpired) as e:
        raise GreedError(f"Good Times: {e}") from None
    if not isinstance(data, list):
        raise GreedError("The Good Times tool must return a list of posts in data")
    return data


def due(db, sources, now=None):
    now = now or time.time()
    states = db.source_states()
    for s in sources:
        if not s.get("enabled", True) or s["type"] == "glome":
            continue
        last = (states.get(s["id"]) or {}).get("last_fetch") or 0
        if now - last >= s.get("every", 30) * 60:
            yield s


def fetch_due(db, force=False):
    """Hämta från källorna som är på tur. Returnerar {källa: antal nya eller felmeddelande}."""
    sources = load_sources()
    result = {}
    for s in (sources if force else due(db, sources)):
        if s["type"] == "glome" or not s.get("enabled", True):
            continue
        try:
            entries = fetch_rss(s) if s["type"] == "rss" else fetch_gt(s)
            result[s["id"]] = db.ingest(s["id"], entries)
        except Exception as e:  # en trasig källa ska inte stoppa de andra
            db.fetch_failed(s["id"], e)
            result[s["id"]] = f"error: {e}"
    return result


def capture(db, site, posts):
    """Inlägg som du scrollat förbi i Glome. Sparas bara om källan för sajten är påslagen."""
    site = re.sub(r"^www\.", "", (site or "").lower())
    source = next((s for s in load_sources() if s["type"] == "glome" and s.get("site") == site), None)
    if not source or not source.get("enabled", True):
        return {"saved": 0, "reason": f"{site} is not a Greed source (or it is turned off)"}
    entries = []
    for p in posts[:100]:
        text = str(p.get("text") or "").strip()[:3000]
        if len(text) < 20:
            continue
        url = str(p.get("url") or "")
        if not re.match(r"^https?://", url):
            # Inlägg utan egen adress får en stabil adress från innehållet
            url = f"glome://{site}/{hashlib.sha1(text.encode()).hexdigest()[:16]}"
        lines = [line for line in text.splitlines() if line.strip()]
        entries.append({"url": url, "title": lines[0][:200] if lines else "", "text": text, "author": str(p.get("author") or "")})
    return {"saved": db.ingest(source["id"], entries)}


def article_text(url):
    """Hela artikeltexten, för de få kandidater där RSS-sammanfattningen är för kort."""
    if not url.startswith("http"):
        return ""
    try:
        import trafilatura
        downloaded = trafilatura.fetch_url(url)
        return (trafilatura.extract(downloaded) or "") if downloaded else ""
    except Exception:  # sidan gick inte att hämta – sammanfattningen får räcka
        return ""
