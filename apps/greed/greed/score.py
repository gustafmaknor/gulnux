"""Lokal grovsortering: varje nytt inlägg jämförs med intresseprofilen med vektorer från den lokala
modellen (samma som Gulnux sök). Det kostar inget och sållar bort det mesta innan agenten tittar.
Utan ollama används en enkel ordmatchning i stället."""

import hashlib
import math
import re
from array import array

from gulsearch import core as search_core
from gulsearch import inbaddning

NEGATIVE_WEIGHT = 0.6


def _client():
    s = search_core.installningar()
    return inbaddning.Klient(s["ollama"], s["model"])


def _pack(vector):
    return array("f", vector).tobytes()


def _unpack(blob):
    a = array("f")
    a.frombytes(blob)
    return a


def _cosine(a, b):
    dot = sum(x * y for x, y in zip(a, b))
    na = math.sqrt(sum(x * x for x in a)) or 1.0
    nb = math.sqrt(sum(y * y for y in b)) or 1.0
    return dot / (na * nb)


def _cached_vectors(db, client, texts):
    """Vektorer för profilens rader och gillade/ogillade inlägg, cachade per text."""
    keys = [hashlib.sha1(f"{client.modell}:{t}".encode()).hexdigest() for t in texts]
    found = {r["key"]: _unpack(r["vector"]) for r in db.q(
        f"SELECT key, vector FROM vcache WHERE key IN ({','.join('?' * len(keys))})", keys)} if keys else {}
    missing = [(k, t) for k, t in zip(keys, texts) if k not in found]
    for i in range(0, len(missing), 16):
        batch = missing[i:i + 16]
        vectors = client.vektorer([t for _, t in batch])
        with db.db:
            for (k, _), v in zip(batch, vectors):
                db.db.execute("INSERT OR REPLACE INTO vcache (key, vector) VALUES (?, ?)", (k, _pack(v)))
                found[k] = array("f", v)
    return [found[k] for k in keys]


def _examples(db, value, limit=100):
    return [r["title"] or (r["text"] or "")[:200] for r in db.q(
        "SELECT i.title, i.text FROM feedback f JOIN items i ON i.id = f.item WHERE f.value = ? ORDER BY f.time DESC LIMIT ?",
        (value, limit))]


def _words(texts):
    return {w for t in texts for w in re.findall(r"\w{4,}", t.lower())}


def score_new(db, profile, limit=500):
    """Poängsätt nya inlägg. Returnerar antalet."""
    rows = db.q("SELECT id, title, text FROM items WHERE status = 'new' ORDER BY fetched LIMIT ?", (limit,))
    if not rows:
        return 0
    likes = profile["likes"] + _examples(db, 1)
    dislikes = profile["dislikes"] + _examples(db, -1)
    texts = [f"{r['title']}\n{(r['text'] or '')[:500]}" for r in rows]

    try:
        client = _client()
        positives = _cached_vectors(db, client, likes) if likes else []
        negatives = _cached_vectors(db, client, dislikes) if dislikes else []
        vectors = []
        for i in range(0, len(texts), 16):
            vectors += [array("f", v) for v in client.vektorer(texts[i:i + 16])]
        scores = []
        for v in vectors:
            pos = max((_cosine(v, p) for p in positives), default=0.0)
            neg = max((_cosine(v, n) for n in negatives), default=0.0)
            scores.append(pos - NEGATIVE_WEIGHT * neg)
        packed = [_pack(v) for v in vectors]
    except inbaddning.InbaddningFel:
        # Utan den lokala modellen: andel av profilens ord som finns i inlägget
        like_words, dislike_words = _words(likes), _words(dislikes)
        scores, packed = [], [None] * len(texts)
        for t in texts:
            words = _words([t])
            scores.append((len(words & like_words) - NEGATIVE_WEIGHT * len(words & dislike_words)) / (len(words) ** 0.5 or 1))

    with db.db:
        for r, s, v in zip(rows, scores, packed):
            db.db.execute("UPDATE items SET score = ?, vector = ?, status = 'scored' WHERE id = ?", (s, v, r["id"]))
    return len(rows)
