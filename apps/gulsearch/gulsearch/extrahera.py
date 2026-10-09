"""Text ur de filer som indexeras."""

from html.parser import HTMLParser

TEXT = {".txt", ".md", ".markdown", ".csv", ".org", ".rst"}
OFFICE = {".docx", ".xlsx", ".xlsm", ".pptx"}
TYPER = TEXT | OFFICE | {".pdf", ".html", ".htm"}
MAX_STORLEK = 50 * 1024 * 1024


def text(p):
    if p.stat().st_size > MAX_STORLEK:
        return ""
    suffix = p.suffix.lower()
    if suffix in TEXT:
        return p.read_text(encoding="utf-8", errors="replace")
    if suffix == ".pdf":
        return _pdf(p)
    if suffix in (".html", ".htm"):
        return html(p.read_text(encoding="utf-8", errors="replace"))
    if suffix in OFFICE:
        return _office(p)
    return ""


def _pdf(p):
    from pypdf import PdfReader
    return "\n\n".join(sida.extract_text() or "" for sida in PdfReader(p).pages)


def _office(p):
    # Samma läsning som Gloffice använder
    from gloffice import core
    d = core.read(p)
    delar = []
    if d["kind"] == "document":
        for b in d["blocks"]:
            if b["type"] == "paragraph":
                delar.append(b["text"])
            else:
                delar.extend(" | ".join(rad) for rad in b["rows"])
    elif d["kind"] == "spreadsheet":
        for blad in d["sheets"]:
            delar.append(f"## {blad['name']}")
            for rad in blad["rows"]:
                varden = [str(c["v"] if c["v"] is not None else c["f"] or "") for c in rad]
                if any(varden):
                    delar.append(" | ".join(varden))
    else:
        for bild in d["slides"]:
            delar.append(f"## Bild {bild['number']}")
            delar.extend(form["text"] for form in bild["shapes"])
            if bild["notes"]:
                delar.append(bild["notes"])
    return "\n\n".join(delar)


class _Html(HTMLParser):
    HOPPA_OVER = {"script", "style", "noscript", "svg"}

    def __init__(self):
        super().__init__()
        self.delar = []
        self.djup = 0

    def handle_starttag(self, tag, attrs):
        if tag in self.HOPPA_OVER:
            self.djup += 1

    def handle_endtag(self, tag):
        if tag in self.HOPPA_OVER and self.djup:
            self.djup -= 1

    def handle_data(self, data):
        if not self.djup and data.strip():
            self.delar.append(data.strip())


def html(kalla):
    parser = _Html()
    parser.feed(kalla)
    return "\n".join(parser.delar)
