# Good Times

Appar som Good Times (GT) har lärt sig, en mapp per app:

| Fil | Innehåll |
|---|---|
| `app.json` | Appens namn, adresser, inloggningsdomäner och scheman |
| `SKILL.md` | Hur appen fungerar och vilka verktyg som finns – det agenterna läser |
| `notes/` | GT:s anteckningar om sidor, arbetsflöden och API:er |
| `tools/` | Verktygen, ett per uppgift (`gt run <app> <verktyg>`) |

Inloggningen till apparna ligger aldrig här, utan bara på datorn
(`~/.local/share/gt/sessions/`). Lär GT en ny app med GT-knappen i Glome eller
`gt learn <adress>`.
