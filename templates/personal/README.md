# Mitt Gulnux

Mina personliga inställningar för [Gulnux](https://github.com/gustafmaknor/gulnux).
Repot är privat och följer med till varje dator där jag använder Gulnux.

| Fil/mapp | Innehåll | Aktiveras med |
|---|---|---|
| `settings.nix` | Namn, e-post, GitHub-konto, standardagent | `gulnux-home` |
| `home.nix` | Mina program och inställningar (användarnivå) | `gulnux-home` |
| `hosts/<maskin>/` | Mina datorer (systemnivå) | `gulnux-rebuild` |
| `memory/` | Det Gulnux har lärt sig om mig | – |
| `proposals/` | Förslag från Gulnux som jag har godkänt | – |
| `flake.lock` | Vilken version av Gulnux-grunden jag kör | `gul update` |

Gulnux föreslår förbättringar i grenar som heter `proposals/<datum>`. Granska dem med
`gul proposals`.
