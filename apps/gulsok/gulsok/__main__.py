"""gulsok – Gulnux sök

  gulsok sok <fråga>       sök i dokument, minne och sparade webbsidor
  gulsok las <id>          visa hela texten för en träff
  gulsok spara-sida        spara en webbsida (JSON med url, titel och text på stdin)
  gulsok glom <id>         ta bort ett dokument ur indexet
  gulsok status            vad som är indexerat
  gulsok indexera          uppdatera indexet nu, i förgrunden
  gulsok bevaka            bakgrundstjänsten (startas av systemd)
  gulsok mcp               MCP-servern för agenterna
"""

import json
import sys

from . import core, inbaddning


def skriv_traffar(resultat):
    traffar = resultat["traffar"]
    if not traffar:
        print("Inga träffar.")
        return
    for nr, t in enumerate(traffar, start=1):
        print(f"{nr}. {t['titel']}  [{t['kalla']}, {t['andrad']}, id {t['id']}]")
        print(f"   {t['sokvag']}")
        print(f"   {t['utdrag']}\n")
    if resultat["lage"] == "fulltext":
        print("(Bara fulltextsökning – vektorsökningen är inte igång än, se 'gul sok status'.)")


def skriv_status(s):
    print(f"Index: {s['index']}")
    for kalla, antal in sorted(s["dokument"].items()):
        print(f"  {kalla}: {antal} dokument")
    print(f"Textbitar: {s['bitar']}, varav {s['med_vektor']} med vektor")
    if not s["vektorstod"]:
        print("Vektorsökning: saknar sqlite-vec – bara fulltext")
    else:
        print(f"Vektorsökning: modell {s['modell']}, ollama {'igång' if s['ollama'] else 'svarar inte'}")
    print(f"Glome-sidor: {s['glome']}")
    print("Källor: " + ", ".join(f"{k} ({v})" for k, v in s["kallor"].items()))


def main():
    args = sys.argv[1:]
    kommando = args[0] if args else "--help"
    installn = core.installningar()
    try:
        if kommando == "sok":
            if len(args) < 2:
                sys.exit("Vad vill du söka efter?")
            skriv_traffar(core.Index().sok(" ".join(args[1:]), installn=installn))
        elif kommando == "las":
            d = core.Index().las(args[1])
            print(f"# {d['titel']}\n{d['sokvag']}\n\n{d['text']}")
        elif kommando == "spara-sida":
            sida = json.load(sys.stdin)
            svar = core.Index().spara_sida(sida["url"], sida.get("titel", ""), sida.get("text", ""),
                                           "manuell", installn)
            print(f"Sparade \"{svar['titel']}\" i sökindexet." if svar["sparad"] else f"Inte sparad: {svar['orsak']}")
        elif kommando == "glom":
            print(core.Index().glom(args[1]))
        elif kommando == "status":
            skriv_status(core.Index().status(installn))
        elif kommando == "indexera":
            index = core.Index()
            print(f"Uppdaterade {index.skanna(installn['kallor'])} dokument.")
            try:
                print(f"Räknade fram vektorer för {index.vektorisera(installn)} textbitar.")
            except inbaddning.InbaddningFel as e:
                print(f"Vektorerna får vänta: {e}")
        elif kommando == "bevaka":
            from . import bevaka
            bevaka.kor()
        elif kommando == "mcp":
            from . import mcp
            mcp.main()
        else:
            print(__doc__)
    except core.SokFel as e:
        sys.exit(f"gulsok: {e}")
    except (IndexError, KeyError, ValueError) as e:
        sys.exit(f"gulsok: fel argument ({e})")


if __name__ == "__main__":
    main()
