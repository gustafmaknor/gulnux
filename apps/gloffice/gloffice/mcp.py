"""Gloffice MCP-server (stdio): låter agenterna i gul läsa och ändra Office-filer."""

import json
import sys

from . import __version__, core, launcher

INSTRUCTIONS = """Gloffice läser och ändrar Word- (.docx), Excel- (.xlsx) och PowerPoint-filer (.pptx).
Relativa sökvägar utgår från ~/Document. Läs alltid filen med read_document först för att få
rätt index på stycken, blad och bilder. Öppna filen med open_in_gloffice när användaren ska se
den – gränssnittet uppdateras automatiskt när du ändrar filen. Varje ändring kan ångras med undo."""

PATH = {"type": "string", "description": "Sökväg till filen. Relativa sökvägar utgår från ~/Document."}
TOOLS = {}


def tool(name, description, handler, /, required=("path",), **props):
    TOOLS[name] = (handler, {
        "name": name,
        "description": description,
        "inputSchema": {"type": "object", "properties": props, "required": list(required)},
    })


tool("list_documents", "Lista Office-filer i ~/Document eller en annan katalog.",
     lambda directory=None: core.list_documents(directory), required=(),
     directory={"type": "string", "description": "Katalog att lista (standard ~/Document)"})
tool("read_document", "Läs en fil som text med index för stycken, tabeller, blad, bilder och former.",
     core.summary, path=PATH)
tool("create_document", "Skapa en ny tom fil. Typen styrs av filändelsen: .docx, .xlsx eller .pptx.",
     core.create, path=PATH)
tool("open_in_gloffice", "Öppna filen i Gloffice-fönstret i Glome så att användaren ser den.",
     launcher.open_ui, path=PATH)
tool("undo", "Ångra den senaste ändringen i filen (gäller ändringar gjorda via Gloffice).",
     core.undo, path=PATH)

STYLE = {"type": "string", "description": "Formatmall, t.ex. \"Heading 1\", \"Title\", \"List Bullet\" eller \"Normal\""}
tool("docx_insert_paragraph", "Lägg till ett stycke i ett textdokument.",
     core.docx_insert_paragraph, required=("path", "text"), path=PATH,
     text={"type": "string"}, style=STYLE,
     after={"type": "integer", "description": "Index på stycket som det nya ska komma efter. -1 = först. Utelämna = sist."})
tool("docx_replace_paragraph", "Byt texten (och ev. formatmallen) i ett stycke. Teckenformateringen från styckets början behålls.",
     core.docx_replace_paragraph, required=("path", "index", "text"), path=PATH,
     index={"type": "integer"}, text={"type": "string"}, style=STYLE)
tool("docx_delete_paragraph", "Ta bort ett stycke.",
     core.docx_delete_paragraph, required=("path", "index"), path=PATH, index={"type": "integer"})
tool("docx_find_replace", "Sök och ersätt text i hela dokumentet, inklusive tabeller.",
     core.docx_find_replace, required=("path", "find", "replace"), path=PATH,
     find={"type": "string"}, replace={"type": "string"})
tool("docx_add_table", "Lägg till en tabell. Första raden blir rubrikrad.",
     core.docx_add_table, required=("path", "rows"), path=PATH,
     rows={"type": "array", "items": {"type": "array", "items": {"type": ["string", "number", "null"]}}},
     after={"type": "integer", "description": "Index på stycket som tabellen ska komma efter. Utelämna = sist."},
     style={"type": "string", "description": "Tabellformat, standard \"Table Grid\""})

SHEET = {"type": "string", "description": "Bladets namn (standard: aktivt blad)"}
tool("sheet_read", "Läs celler ur ett kalkylark: värden samt formler.",
     lambda path, sheet=None, range=None: core.sheet_read(path, sheet, range), path=PATH, sheet=SHEET,
     range={"type": "string", "description": "Cellområde, t.ex. \"A1:D20\" (standard: hela använda området)"})
tool("sheet_write", "Skriv värden i ett kalkylark med start i en cell. Text som börjar med = blir en formel.",
     core.sheet_write, required=("path", "start", "values"), path=PATH, sheet=SHEET,
     start={"type": "string", "description": "Övre vänstra cellen, t.ex. \"B2\""},
     values={"type": "array", "items": {"type": "array", "items": {"type": ["string", "number", "boolean", "null"]}},
             "description": "Rader med värden, t.ex. [[\"Summa\", \"=SUM(B1:B9)\"]]"})
tool("sheet_add", "Lägg till ett nytt blad.",
     core.sheet_add, required=("path", "name"), path=PATH, name={"type": "string"})
tool("recalculate", "Räkna om alla formler med LibreOffice så att beräknade värden blir rätt.",
     core.recalculate, path=PATH)

tool("slide_add", "Lägg till en bild sist i en presentation.",
     core.slide_add, required=("path", "title"), path=PATH, title={"type": "string"},
     bullets={"type": "array", "items": {"type": "string"}, "description": "Punkter i innehållsrutan"},
     layout={"type": ["integer", "string"], "description": "Layoutens index eller namn (se read_document)"})
tool("slide_set_text", "Byt texten i en form på en bild. Radbrytningar blir nya stycken.",
     core.slide_set_text, required=("path", "slide", "shape", "text"), path=PATH,
     slide={"type": "integer", "description": "Bildnummer, från 1"},
     shape={"type": "integer", "description": "Formens index (se read_document)"}, text={"type": "string"})
tool("slide_delete", "Ta bort en bild.",
     core.slide_delete, required=("path", "slide"), path=PATH,
     slide={"type": "integer", "description": "Bildnummer, från 1"})

tool("convert", "Konvertera med LibreOffice, t.ex. till pdf, docx, xlsx, pptx, odt eller csv. Filen hamnar bredvid originalet.",
     core.convert, required=("path", "format"), path=PATH, format={"type": "string"})


def handle(msg):
    method = msg.get("method")
    params = msg.get("params") or {}
    if method == "initialize":
        return {"result": {
            "protocolVersion": params.get("protocolVersion", "2025-06-18"),
            "capabilities": {"tools": {}},
            "serverInfo": {"name": "gloffice", "version": __version__},
            "instructions": INSTRUCTIONS,
        }}
    if method == "ping":
        return {"result": {}}
    if method == "tools/list":
        return {"result": {"tools": [spec for _, spec in TOOLS.values()]}}
    if method == "tools/call":
        name = params.get("name")
        if name not in TOOLS:
            return {"error": {"code": -32602, "message": f"Okänt verktyg: {name}"}}
        try:
            out = TOOLS[name][0](**(params.get("arguments") or {}))
            text = out if isinstance(out, str) else json.dumps(out, ensure_ascii=False, indent=1)
            return {"result": {"content": [{"type": "text", "text": text}]}}
        except Exception as e:
            return {"result": {"content": [{"type": "text", "text": f"Fel: {e}"}], "isError": True}}
    if "id" in msg:
        return {"error": {"code": -32601, "message": f"Okänd metod: {method}"}}
    return None  # notifieringar besvaras inte


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
