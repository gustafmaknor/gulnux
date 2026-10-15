"""Finsortering: några gånger om dagen får agenten kandidaterna (de bäst poängsatta sedan förra
urvalet) och ett slumpat urval utanför profilen, och väljer ut det som verkligen är intressant."""

import json
import os
import random
import subprocess
import time
from datetime import datetime
from pathlib import Path

from .core import GreedError
from .fetch import article_text

PROMPTS = Path(os.environ.get("GREED_PROMPTS") or Path(__file__).resolve().parents[3] / "agent" / "prompts")


def agent_name():
    conf = Path(os.environ.get("XDG_CONFIG_HOME", Path.home() / ".config")) / "gulnux" / "agent"
    if conf.exists():
        return conf.read_text().strip()
    if os.environ.get("GULNUX_AGENT"):
        return os.environ["GULNUX_AGENT"]
    try:
        return Path("/etc/gulnux/default-agent").read_text().strip()
    except OSError:
        return "claude"


def run_agent(prompt):
    """Kör användarens agent utan verktyg och returnerar svaret."""
    if os.environ.get("GREED_AGENT_CMD"):  # för tester
        command = json.loads(os.environ["GREED_AGENT_CMD"])
    elif agent_name() == "codex":
        command = ["codex", "exec", "--skip-git-repo-check"]
    else:
        command = ["claude", "-p", "--max-turns", "1"]
    try:
        out = subprocess.run(command, input=prompt, capture_output=True, text=True, encoding="utf-8", timeout=900, check=True)
    except subprocess.CalledProcessError as e:
        raise GreedError(f"The agent failed: {(e.stderr or '').strip()[-300:]}") from None
    except (OSError, subprocess.TimeoutExpired) as e:
        raise GreedError(f"Could not run the agent: {e}") from None
    return out.stdout


def _parse(answer):
    start, end = answer.find("{"), answer.rfind("}")
    if start < 0 or end <= start:
        raise GreedError("The agent did not answer with JSON")
    try:
        return json.loads(answer[start:end + 1])
    except ValueError:
        raise GreedError("The agent's JSON could not be read") from None


def _describe(rows, enrich=False):
    lines = []
    for r in rows:
        text = (r["text"] or "").strip()
        if enrich and len(text) < 200:
            text = (article_text(r["url"]) or text)
        text = " ".join(text.split())[:600]
        lines.append(f"[{r['id']}] ({r['source']}) {r['title']}\n    {text}")
    return "\n".join(lines) or "(inga)"


def due(db, times, now=None):
    """Är det dags för ett urval? Ja om en av tiderna har passerats sedan förra urvalet."""
    now = datetime.fromtimestamp(now or time.time())
    last = db.one("SELECT max(created) AS t FROM digests")["t"] or 0
    for t in times:
        hour, minute = (int(x) for x in t.split(":"))
        moment = now.replace(hour=hour, minute=minute, second=0, microsecond=0).timestamp()
        if last < moment <= now.timestamp():
            return True
    return False


def curate(db, settings, profile):
    """Låt agenten välja ut. Returnerar urvalet, eller None om det inte finns något nytt."""
    since = (db.one("SELECT max(created) AS t FROM digests")["t"] or 0) - 3600
    candidates = db.q(
        "SELECT * FROM items WHERE status = 'scored' AND fetched >= ? ORDER BY score DESC LIMIT ?",
        (min(since, time.time() - 86400), settings["candidates"]))
    if not candidates:
        return None
    ids = [r["id"] for r in candidates]
    others = db.q(
        f"SELECT * FROM items WHERE status = 'scored' AND fetched >= ? AND id NOT IN ({','.join('?' * len(ids))})",
        (time.time() - 86400, *ids))
    surprises = random.sample(others, min(15, len(others))) if settings["surprise"] else []

    liked = [r["title"] for r in db.q(
        "SELECT i.title FROM feedback f JOIN items i ON i.id = f.item WHERE f.value = 1 ORDER BY f.time DESC LIMIT 15")]
    disliked = [r["title"] for r in db.q(
        "SELECT i.title FROM feedback f JOIN items i ON i.id = f.item WHERE f.value = -1 ORDER BY f.time DESC LIMIT 15")]

    prompt = (PROMPTS / "greed-curate.md").read_text(encoding="utf-8")
    for key, value in {
        "@PROFIL@": profile["text"].strip(),
        "@GILLAT@": "\n".join(f"- {t}" for t in liked) or "(inget än)",
        "@OGILLAT@": "\n".join(f"- {t}" for t in disliked) or "(inget än)",
        "@KANDIDATER@": _describe(candidates[:15], enrich=True) + "\n" + _describe(candidates[15:]),
        "@OVERRASKNINGAR@": _describe(surprises),
        "@ANTAL@": str(settings["picks"]),
        "@OVERRASK_ANTAL@": str(settings["surprise"]),
    }.items():
        prompt = prompt.replace(key, value)

    answer = _parse(run_agent(prompt))
    allowed = {r["id"]: "interest" for r in candidates} | {r["id"]: "surprise" for r in surprises}
    picks, used = [], set()
    for p in answer.get("picks") or []:
        try:
            item = int(p.get("id"))
        except (TypeError, ValueError):
            continue
        if item not in allowed or item in used:
            continue
        related = [int(x) for x in p.get("related") or [] if str(x).isdigit() and int(x) in allowed and int(x) != item]
        used.update([item, *related])
        picks.append({"item": item, "kind": allowed[item], "reason": str(p.get("reason") or "")[:300],
                      "summary": str(p.get("summary") or "")[:600], "related": related})
    # Högst settings["surprise"] överraskningar och settings["picks"] från profilen
    kept, room = [], {"surprise": settings["surprise"], "interest": settings["picks"]}
    for p in picks:
        if room[p["kind"]] > 0:
            room[p["kind"]] -= 1
            kept.append(p)
    picks = kept

    with db.db:
        digest = db.db.execute("INSERT INTO digests (created, note) VALUES (?, ?)",
                               (time.time(), str(answer.get("note") or "")[:300])).lastrowid
        for position, p in enumerate(picks):
            db.db.execute("INSERT INTO picks (digest, item, position, kind, reason, summary, related) VALUES (?, ?, ?, ?, ?, ?, ?)",
                          (digest, p["item"], position, p["kind"], p["reason"], p["summary"], json.dumps(p["related"])))
        considered = ids + [r["id"] for r in surprises]
        db.db.execute(f"UPDATE items SET status = 'considered' WHERE id IN ({','.join('?' * len(considered))})", considered)
        chosen = [p["item"] for p in picks]
        if chosen:
            db.db.execute(f"UPDATE items SET status = 'picked' WHERE id IN ({','.join('?' * len(chosen))})", chosen)
    return {"digest": digest, "picks": len(picks), "candidates": len(candidates), "note": answer.get("note") or ""}
