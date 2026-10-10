"""Gulnux sök: indexet och hybridsökningen.

Varje dokument delas i överlappande bitar. Bitarna söks både med fulltext (SQLite FTS5)
och med vektorer (sqlite-vec + embeddings från ollama), och resultaten vägs ihop med
reciprocal rank fusion. Utan ollama eller sqlite-vec fungerar fulltextsökningen ensam.
"""

import json
import os
import re
import sqlite3
import time
import unicodedata
from pathlib import Path
from urllib.parse import urlparse

from . import extrahera, inbaddning

HOME = Path.home()
DATA_DIR = Path(os.environ.get("XDG_DATA_HOME", HOME / ".local" / "share")) / "gulsearch"
CONFIG_FIL = Path(os.environ.get("XDG_CONFIG_HOME", HOME / ".config")) / "gulsearch" / "config.json"
SYSTEM_FIL = Path("/etc/gulnux/search.json")

STANDARD = {
    "sources": {"documents": "~/Document", "memory": "~/gulnux-personal/memory"},
    "glome": "manual",  # off, manual eller auto
    "exclude": [],
    "model": "bge-m3",
    "ollama": "http://127.0.0.1:11434",
}

BIT_STORLEK = 1200
BIT_OVERLAPP = 200
MAX_TEXT = 2_000_000
RRF_K = 60

# Bitar som bara hittas via vektorerna (inget av sökorden finns i dem) visas bara när de ligger
# riktigt nära frågan. Avstånd för bge-m3: tydligt besläktat ≈ 0,40–0,50, orelaterat ≈ 0,55 och
# uppåt. Vektorsökningen ger alltid sina 50 närmaste, även när inget av dem handlar om frågan.
VEKTOR_MAX = 0.5
VEKTOR_MARGINAL = 0.06   # och högst så här mycket längre bort än den bästa
VEKTOR_MIN_TEXT = 40     # nästan tomma bitar ("## Sheet") ligger nära allt och säger inget

# Vanliga svenska ändelser som tas bort innan prefixsökningen, så att "cykla" hittar "cykling"
# och "offerten" hittar "offert". Ordet behåller alltid minst fyra tecken.
ANDELSER = ("erna", "arna", "orna", "ens", "ets", "en", "et", "er", "ar", "or", "na", "a", "e")

# Vanliga ord som bara ger brus i fulltextsökningen
STOPPORD = set("""
och i att det som en på är av för med till den har de inte om ett men var jag sig från vi så
kan man när år hon han under också efter eller nu sin där vid mot ska skulle kommer ut får finns
vara hade alla andra mycket än här då sedan över bara in blir upp även vad hur någon min mitt
mina din ditt dina vår våra jag du ni dem the a an of and to in is on for with
""".split())


class SokFel(Exception):
    pass


def installningar():
    """Systemets inställningar (/etc/gulnux/search.json) med användarens ovanpå."""
    varden = dict(STANDARD)
    for fil in (SYSTEM_FIL, CONFIG_FIL):
        try:
            varden.update(json.loads(fil.read_text(encoding="utf-8")))
        except (OSError, ValueError):
            pass
    varden["ollama"] = os.environ.get("GULSEARCH_OLLAMA", varden["ollama"])
    return varden


def dela(text):
    """Dela texten i bitar på ungefär BIT_STORLEK tecken, helst vid stycke- eller meningsslut."""
    text = re.sub(r"[ \t\r\f\v]+", " ", text)
    text = re.sub(r"\n\s*\n+", "\n\n", text).strip()
    bitar, start = [], 0
    while start < len(text):
        slut = min(len(text), start + BIT_STORLEK)
        if slut < len(text):
            minst = start + BIT_STORLEK // 2
            for brytning in ("\n\n", ". ", "\n", " "):
                i = text.rfind(brytning, minst, slut)
                if i != -1:
                    slut = i + len(brytning)
                    break
        bit = text[start:slut].strip()
        if bit:
            bitar.append(bit)
        if slut >= len(text):
            break
        start = max(slut - BIT_OVERLAPP, start + 1)
        # Börja nästa bit vid ett ordslut i stället för mitt i ett ord
        mellanslag = text.find(" ", start, slut)
        if mellanslag != -1:
            start = mellanslag + 1
    return bitar


def vik(text):
    """Gemener utan accenter, tecken för tecken (samma längd), som FTS5:s remove_diacritics."""
    return "".join(unicodedata.normalize("NFD", c)[0] for c in text.lower())


def sokord(fraga):
    """Orden i en fråga, utan stoppord."""
    return [o for o in re.findall(r"\w+", fraga.lower()) if len(o) > 1 and o not in STOPPORD]


def stam(ord_):
    """Ordet utan vanlig böjningsändelse, för prefixsökning."""
    if len(ord_) < 5:
        return ord_
    for andelse in ANDELSER:
        if ord_.endswith(andelse) and len(ord_) - len(andelse) >= 4:
            return ord_[:-len(andelse)]
    return ord_


def stader(text):
    """Text att visa: utan markdown-tecken, länkmål och extra blanksteg."""
    text = re.sub(r"\[([^\]]*)\]\([^)]*\)", r"\1", text)   # [text](länk) -> text
    text = re.sub(r"(?m)^[ \t]*#+[ \t]+(.*?)[ \t]*$", lambda m: m[1] if m[1][-1:] in ".:!?" else m[1] + ":", text)
    text = re.sub(r"(?m)^[ \t]*[-*+][ \t]*$", "", text)             # tomma listpunkter
    text = re.sub(r"(?m)^[ \t]*([-*+]|\d+\.)[ \t]+", "• ", text)  # listpunkter
    text = re.sub(r"[*_`|]{1,3}", "", text)
    return re.sub(r"\s+", " ", text).strip()


def matchningar(text, ord_):
    """Var i texten sökorden (och deras böjda former) står: [(start, slut), …]."""
    if not ord_:
        return []
    monster = re.compile(r"\b(" + "|".join(re.escape(vik(stam(o))) for o in ord_) + r")\w*")
    return [m.span() for m in monster.finditer(vik(text))]


def utdrag(text, ord_, langd=300):
    text = stader(text)
    traffar = matchningar(text, ord_)
    start = max(0, traffar[0][0] - min(80, langd // 3)) if traffar else 0
    if start:
        # Börja vid ett ordslut i stället för mitt i ett ord
        mellanslag = text.find(" ", start)
        start = mellanslag + 1 if 0 <= mellanslag < traffar[0][0] else start
    slut = start + langd
    if slut < len(text):
        mellanslag = text.rfind(" ", start, slut)
        slut = mellanslag if mellanslag > start else slut
    return ("…" if start else "") + text[start:slut] + ("…" if slut < len(text) else "")


class Index:
    def __init__(self, sokvag=None):
        self.sokvag = Path(sokvag or DATA_DIR / "index.sqlite")
        self.sokvag.parent.mkdir(parents=True, exist_ok=True)
        self.db = sqlite3.connect(self.sokvag, timeout=30)
        self.db.row_factory = sqlite3.Row
        self.vec = self._ladda_vec()
        self._schema()

    # ------------------------------------------------------------ databasen

    def _ladda_vec(self):
        try:
            import sqlite_vec
            self.db.enable_load_extension(True)
            sqlite_vec.load(self.db)
            self.db.enable_load_extension(False)
            return sqlite_vec
        except (ImportError, AttributeError, sqlite3.OperationalError):
            return None

    def _schema(self):
        self.db.executescript("""
            PRAGMA journal_mode = WAL;
            CREATE TABLE IF NOT EXISTS dokument (
                id INTEGER PRIMARY KEY,
                kalla TEXT NOT NULL,
                sokvag TEXT NOT NULL UNIQUE,
                titel TEXT,
                text TEXT,
                andrad REAL,
                indexerad REAL
            );
            CREATE TABLE IF NOT EXISTS bitar (
                id INTEGER PRIMARY KEY,
                dokument INTEGER NOT NULL,
                nr INTEGER,
                text TEXT,
                vektor INTEGER NOT NULL DEFAULT 0
            );
            CREATE INDEX IF NOT EXISTS bitar_dokument ON bitar(dokument);
            CREATE INDEX IF NOT EXISTS bitar_vektor ON bitar(vektor);
            CREATE VIRTUAL TABLE IF NOT EXISTS bitar_fts USING fts5(
                text, content='bitar', content_rowid='id',
                tokenize='unicode61 remove_diacritics 2'
            );
            CREATE TRIGGER IF NOT EXISTS bitar_ny AFTER INSERT ON bitar BEGIN
                INSERT INTO bitar_fts(rowid, text) VALUES (new.id, new.text);
            END;
            CREATE TRIGGER IF NOT EXISTS bitar_bort AFTER DELETE ON bitar BEGIN
                INSERT INTO bitar_fts(bitar_fts, rowid, text) VALUES ('delete', old.id, old.text);
            END;
            CREATE TABLE IF NOT EXISTS meta (nyckel TEXT PRIMARY KEY, varde TEXT);
        """)

    def _meta(self, nyckel):
        rad = self.db.execute("SELECT varde FROM meta WHERE nyckel = ?", (nyckel,)).fetchone()
        return rad[0] if rad else None

    def _satt_meta(self, nyckel, varde):
        self.db.execute("INSERT OR REPLACE INTO meta (nyckel, varde) VALUES (?, ?)", (nyckel, str(varde)))

    def _har_vektortabell(self):
        return self.db.execute("SELECT 1 FROM sqlite_master WHERE name = 'bitar_vec'").fetchone() is not None

    def _aterstall_vektorer(self, dim, modell):
        """Ny modell eller dimension: börja om med vektorerna."""
        self.db.execute("DROP TABLE IF EXISTS bitar_vec")
        self.db.execute(f"CREATE VIRTUAL TABLE bitar_vec USING vec0(embedding float[{int(dim)}] distance_metric=cosine)")
        self.db.execute("UPDATE bitar SET vektor = 0")
        self._satt_meta("modell", modell)
        self._satt_meta("dim", dim)

    def _ta_bort_bitar(self, dokument):
        if self.vec and self._har_vektortabell():
            self.db.execute("DELETE FROM bitar_vec WHERE rowid IN (SELECT id FROM bitar WHERE dokument = ?)", (dokument,))
        self.db.execute("DELETE FROM bitar WHERE dokument = ?", (dokument,))

    # ------------------------------------------------------------ indexering

    def lagg_till(self, kalla, sokvag, titel, text, andrad):
        text = text[:MAX_TEXT]
        with self.db:
            gammal = self.db.execute("SELECT id, text, kalla FROM dokument WHERE sokvag = ?", (sokvag,)).fetchone()
            if gammal and gammal["text"] == text and gammal["kalla"] == kalla:
                # Oförändrat innehåll (t.ex. samma sida igen): bara uppdatera tiderna
                self.db.execute("UPDATE dokument SET titel = ?, andrad = ?, indexerad = ? WHERE id = ?",
                                (titel, andrad, time.time(), gammal["id"]))
                return gammal["id"]
            if gammal:
                dokument = gammal["id"]
                self._ta_bort_bitar(dokument)
                self.db.execute(
                    "UPDATE dokument SET kalla = ?, titel = ?, text = ?, andrad = ?, indexerad = ? WHERE id = ?",
                    (kalla, titel, text, andrad, time.time(), dokument))
            else:
                dokument = self.db.execute(
                    "INSERT INTO dokument (kalla, sokvag, titel, text, andrad, indexerad) VALUES (?, ?, ?, ?, ?, ?)",
                    (kalla, sokvag, titel, text, andrad, time.time())).lastrowid
            self.db.executemany("INSERT INTO bitar (dokument, nr, text) VALUES (?, ?, ?)",
                                [(dokument, nr, bit) for nr, bit in enumerate(dela(text))])
        return dokument

    def ta_bort(self, dokument):
        with self.db:
            self._ta_bort_bitar(dokument)
            self.db.execute("DELETE FROM dokument WHERE id = ?", (dokument,))

    def skanna(self, kallor):
        """Indexera nya och ändrade filer i källorna och ta bort de som försvunnit."""
        andrade = 0
        sedda, skannade = set(), set()
        for kalla, katalog in kallor.items():
            bas = Path(katalog).expanduser()
            if not bas.is_dir():
                continue  # t.ex. en extern disk som inte är monterad – rör inte det som finns
            skannade.add(kalla)
            for fil in sorted(bas.rglob("*")):
                if any(del_.startswith((".", "~$")) for del_ in fil.relative_to(bas).parts):
                    continue
                if fil.suffix.lower() not in extrahera.TYPER or not fil.is_file():
                    continue
                sokvag = str(fil)
                sedda.add(sokvag)
                andrad = fil.stat().st_mtime
                rad = self.db.execute("SELECT andrad FROM dokument WHERE sokvag = ?", (sokvag,)).fetchone()
                if rad and rad["andrad"] == andrad:
                    continue
                try:
                    text = extrahera.text(fil)
                except Exception as e:  # trasig fil: indexera namnet så att den inte provas varje varv
                    print(f"Could not read {fil}: {e}", flush=True)
                    text = ""
                self.lagg_till(kalla, sokvag, fil.name, text, andrad)
                andrade += 1
        for rad in self.db.execute("SELECT id, kalla, sokvag FROM dokument WHERE kalla != 'glome'").fetchall():
            borttagen_kalla = rad["kalla"] not in kallor
            forsvunnen = rad["kalla"] in skannade and rad["sokvag"] not in sedda
            if borttagen_kalla or forsvunnen:
                self.ta_bort(rad["id"])
                andrade += 1
        return andrade

    def vektorisera(self, installn, max_bitar=None):
        """Räkna fram vektorer för bitar som saknar dem. Returnerar antalet."""
        if not self.vec:
            return 0
        if self._har_vektortabell() and self._meta("modell") != installn["model"]:
            with self.db:
                self._aterstall_vektorer(self._meta("dim"), installn["model"])
        klient = inbaddning.Klient(installn["ollama"], installn["model"])
        gjort = 0
        while max_bitar is None or gjort < max_bitar:
            rader = self.db.execute("SELECT id, text FROM bitar WHERE vektor = 0 LIMIT 16").fetchall()
            if not rader:
                break
            vektorer = klient.vektorer([r["text"] for r in rader])
            with self.db:
                if not self._har_vektortabell() or self._meta("dim") != str(len(vektorer[0])):
                    self._aterstall_vektorer(len(vektorer[0]), installn["model"])
                for rad, vektor in zip(rader, vektorer):
                    self.db.execute("DELETE FROM bitar_vec WHERE rowid = ?", (rad["id"],))
                    self.db.execute("INSERT INTO bitar_vec (rowid, embedding) VALUES (?, ?)",
                                    (rad["id"], self.vec.serialize_float32(vektor)))
                    self.db.execute("UPDATE bitar SET vektor = 1 WHERE id = ?", (rad["id"],))
            gjort += len(rader)
        return gjort

    # ------------------------------------------------------------ Glome

    def spara_sida(self, url, titel, text, lage, installn):
        """Spara en webbsida från Glome. lage är "manual" (knappen/kommandot) eller "auto"."""
        installning = installn["glome"]
        if installning == "off":
            return {"sparad": False, "orsak": "indexing of Glome pages is turned off"}
        if lage == "auto" and installning != "auto":
            return {"sparad": False, "orsak": "automatic indexing is not turned on"}
        if not url.startswith(("http://", "https://")):
            return {"sparad": False, "orsak": "only web pages can be saved"}
        vard = (urlparse(url).hostname or "").lower()
        if lage == "auto" and any(u.lower() in vard for u in installn["exclude"]):
            return {"sparad": False, "orsak": f"{vard} is excluded"}
        if len(text.strip()) < 50:
            return {"sparad": False, "orsak": "the page has too little text"}
        url = url.split("#")[0]
        dokument = self.lagg_till("glome", url, titel or url, text, time.time())
        return {"sparad": True, "id": dokument, "titel": titel or url}

    # ------------------------------------------------------------ sökning

    def sok(self, fraga, antal=10, kalla=None, installn=None):
        """Sök med fulltext och vektorer. Ett dokument visas om det innehåller något av sökorden
        (även böjt), eller om en bit av det ligger riktigt nära frågan i betydelse."""
        ord_ = sokord(fraga)
        poang = {}
        fulltext = set()
        if ord_:
            # Längre ord matchar även böjda former: "offert" hittar "offerten", "cykla" "cykling"
            fts_fraga = " OR ".join(f'"{stam(o)}"*' if len(o) >= 4 else f'"{o}"' for o in ord_)
            rader = self.db.execute(
                "SELECT rowid FROM bitar_fts WHERE bitar_fts MATCH ? ORDER BY rank LIMIT 50",
                (fts_fraga,)).fetchall()
            for plats, rad in enumerate(rader):
                poang[rad[0]] = poang.get(rad[0], 0) + 1 / (RRF_K + plats)
                fulltext.add(rad[0])

        lage = "fulltext"
        avstand = {}
        if installn and self.vec and self._har_vektortabell():
            try:
                vektor = inbaddning.Klient(installn["ollama"], installn["model"]).vektorer([fraga])[0]
                rader = self.db.execute(
                    "SELECT rowid, distance FROM bitar_vec WHERE embedding MATCH ? AND k = 50 ORDER BY distance",
                    (self.vec.serialize_float32(vektor),)).fetchall()
                for plats, rad in enumerate(rader):
                    poang[rad[0]] = poang.get(rad[0], 0) + 1 / (RRF_K + plats)
                    avstand[rad[0]] = rad[1]
                lage = "hybrid"
            except inbaddning.InbaddningFel:
                pass

        if not poang:
            return {"lage": lage, "traffar": []}
        platshallare = ",".join("?" * len(poang))
        rader = self.db.execute(f"""
            SELECT b.id, b.text, d.id AS dokument, d.titel, d.sokvag, d.kalla, d.andrad
            FROM bitar b JOIN dokument d ON d.id = b.dokument
            WHERE b.id IN ({platshallare})""", list(poang)).fetchall()

        # Bitar som bara hittats via vektorerna måste ligga nära nog för att räknas
        narmast = min(avstand.values(), default=0)
        def relevant(rad):
            if rad["id"] in fulltext or matchningar(rad["titel"], ord_):
                return True
            d = avstand.get(rad["id"])
            return (d is not None and d <= VEKTOR_MAX and d <= narmast + VEKTOR_MARGINAL
                    and len(stader(rad["text"])) >= VEKTOR_MIN_TEXT)

        basta = {}
        for rad in rader:
            if kalla and rad["kalla"] != kalla:
                continue
            if not relevant(rad):
                continue
            p = poang[rad["id"]]
            ordtraff = rad["id"] in fulltext or bool(matchningar(rad["titel"], ord_))
            tidigare = basta.get(rad["dokument"])
            # En bit med sökorden i går före en som bara liknar frågan, sedan högst poäng
            if tidigare and (tidigare["traff"] == "ord", tidigare["poang"]) >= (ordtraff, p):
                continue
            basta[rad["dokument"]] = {
                "id": rad["dokument"],
                "titel": rad["titel"],
                "sokvag": rad["sokvag"],
                "kalla": rad["kalla"],
                "andrad": time.strftime("%Y-%m-%d", time.localtime(rad["andrad"] or 0)),
                "utdrag": utdrag(rad["text"], ord_),
                "poang": round(p, 4),
                "traff": "ord" if ordtraff else "betydelse",
            }
        # Vid lika poäng vinner exakta ordträffar (nya bitar kan sakna vektor en stund)
        traffar = sorted(basta.values(), key=lambda t: (-t["poang"], t["traff"] != "ord"))[:antal]
        return {"lage": lage, "ord": ord_, "traffar": traffar}

    def las(self, nyckel):
        """Hela texten för ett dokument, via id, sökväg eller adress."""
        rad = self.db.execute(
            "SELECT id, kalla, sokvag, titel, text, andrad FROM dokument WHERE id = ? OR sokvag = ?",
            (int(nyckel) if str(nyckel).isdigit() else -1, str(nyckel))).fetchone()
        if not rad:
            raise SokFel(f"Found no document {nyckel} in the index")
        return dict(rad)

    def glom(self, nyckel):
        dokument = self.las(nyckel)
        self.ta_bort(dokument["id"])
        return f"Removed \"{dokument['titel']}\" from the search index"

    def status(self, installn):
        kallor = {r[0]: r[1] for r in self.db.execute("SELECT kalla, count(*) FROM dokument GROUP BY kalla")}
        bitar = self.db.execute("SELECT count(*), coalesce(sum(vektor), 0) FROM bitar").fetchone()
        return {
            "dokument": kallor,
            "bitar": bitar[0],
            "med_vektor": bitar[1],
            "vektorstod": bool(self.vec),
            "ollama": inbaddning.Klient(installn["ollama"], installn["model"]).tillganglig(),
            "model": installn["model"],
            "glome": installn["glome"],
            "sources": installn["sources"],
            "index": str(self.sokvag),
        }
