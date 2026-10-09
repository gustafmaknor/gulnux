# Gulnux – för dig som utvecklar grunden

Det här är **Gulnux-grunden**: en AI-first-distribution byggd på NixOS. Läs `README.md` för
vad den gör och `agent/AGENTS.md` för kontexten agenterna får på en Gulnux-maskin.
Den här filen är för arbetet *på* grunden.

**Ledstjärna: Gulnux ska lära sig att vara det OS som användaren vill ha.**

Grunden byggdes på en Windows-dator utan Nix och installerades sedan för första gången på
en ThinkPad X1 Carbon Gen 10 (värden `x1`, användare `gustaf`). Mycket är därför testat
med låtsasmiljöer men **inte på riktig hårdvara** – se *Öppna uppgifter*.

## Två repon

| Repo | Var på X1:an | Innehåll |
|---|---|---|
| Grunden: `gustafmaknor/gulnux` (publikt) | `~/src/gulnux` | Distributionen. Inget personligt. |
| Personligt: `gustafmaknor/gulnux-personal` (privat) | `~/gulnux-personal` | `settings.nix`, `home.nix`, `hosts/x1/`, `memory/`, `proposals/`, `gt/`, `greed/` |

Det personliga repot hämtar grunden som flake-input `gulnux` med låst version.

### Testa ändringar i grunden på X1:an innan du pushar

```
# systemet
sudo nixos-rebuild switch --flake ~/gulnux-personal#x1 --override-input gulnux path:$HOME/src/gulnux
# användarnivån
home-manager switch -b before-gulnux --flake ~/gulnux-personal#$USER --override-input gulnux path:$HOME/src/gulnux
```

När det fungerar: committa och pusha grunden, och kör `gul update` (uppdaterar låsningen i
det personliga repot, bygger om och pushar).

## Utvecklingsmiljö och tester

```
cd ~/src/gulnux
nix develop                                   # Python-paketen, Node, ShellCheck, ruff, jq, Chromium
shellcheck -s bash scripts/*.sh modules/home/observe.bash
ruff check --select F,E9 apps

# Gloffice
(cd apps/gloffice && GLOFFICE_DIR=$(mktemp -d -p ~) XDG_DATA_HOME=$(mktemp -d) GLOFFICE_PORT=9311 PYTHONPATH=. python tests/test_gloffice.py)
# Sökningen
(cd apps/gulsearch && T=$(mktemp -d -p ~) PYTHONPATH=.:../gloffice python tests/test_gulsearch.py)
# Greed
(cd apps/greed && PYTHONPATH=.:../gulsearch python tests/test_greed.py)
# Good Times (startar en egen Chromium som "Glome")
(cd apps/gt && GT_CHROMIUM=$(command -v chromium) node tests/test-gt.mjs)
```

`writeShellApplication` kör ShellCheck vid bygget och stoppar på *alla* anmärkningar, även
info-nivå – kör ShellCheck innan du pushar skript.

## Konventioner

- **Språk:** användarens kommandon (`gul`, `gt`, `greed`, `gulsearch`) och deras utskrifter
  är på **engelska**. Löptext i README, AGENTS.md, promptar, kommentarer och gränssnitt
  (Gloffice, Greed, startsidan) är på **svenska**. Namn i det personliga repot och i
  inställningarna är engelska (`settings.nix`, `memory/`, `gulnux.learning`, `gulnux.search`).
- **Skriv koden som den omgivande:** samma kommentarstäthet och namngivning. Inga nya
  beroenden utan skäl – apparna är stdlib-tunga (Python stdlib-HTTP, Node utan npm utom
  Playwright i GT:s körmiljö).
- **Allt innehåll från webben sätts som text**, aldrig som HTML (Greed, startsidan).
- **Lokala servrar** lyssnar bara på 127.0.0.1, kontrollerar `Host` och kräver ett eget
  huvud (`X-Gloffice`, `X-Greed`) eller tilläggets `Origin`. Läs hela POST-innehållet innan
  du svarar, även vid 403.
- **Inga hemligheter i repon.** GT:s inloggningar ligger i `~/.local/share/gt/sessions/` (0600).
- **Committa med** `Co-Authored-By: Claude …` som tidigare commits.

### Portar och fasta id

| | |
|---|---|
| 9222 | Glomes DevTools-port (CDP, för `glome-mcp`, `glome-read`, GT) |
| 9300 | Gloffice |
| 9301 | Gulnux sök (tar emot sidor från söktillägget) |
| 9303 | Greed (sidan, startsidan `/start`, tar emot inlägg från Greed-tillägget) |
| `okelhmbnolibhpnjedoejgidbpnnoolh` | Söktillägget (`apps/glome-tillagg`) |
| `ggkddmolbkjjhlicmldkhpflblbleocb` | Good Times-tillägget (`apps/gt-tillagg`), native messaging-värd `se.gulnux.gt` |
| `ccbiciocgndmnhmblociljbphlibegne` | Greed-tillägget (`apps/greed-tillagg`) |

Tilläggens id kommer från `key` i deras `manifest.json`. De privata nycklarna sparades
inte – **ändra inte `key`**, då byter tillägget id och servrarnas kontroller slutar fungera.

## Viktiga beslut

- **NixOS + flakes**: allt deklarativt och med rollback. Personliga inställningar på
  användarnivå via Home Manager, så att flera kan dela en dator och agenten inte behöver sudo.
- **SwayFX** (rundade hörn, skuggor, oskärpa), ljust tema med gul accent (`#F5C518`, text
  i bärnsten `#8A6100`), Lexend + JetBrains Mono. Designskissen finns som privat artefakt:
  https://claude.ai/artifact/SKZjFDHLK3bCNhQBjQhrv8
- **Inloggning: tuigreet** som standard. ReGreet (`gulnux.desktop.greeter = "regreet"`)
  hängde sig på X1:an efter att greetd bett om lösenordet – se Öppna uppgifter.
- **Glome = Chromium** med egen profil, CDP på 9222, tilläggen via `--load-extension`
  (fungerar i Chromium, inte i Googles Chrome sedan v137) och policyer i `glome.nix`.
  Verktygsfältet kan inte göras om som i skissen; därför egen startsida och temafärg.
- **Good Times** delar inloggningen från Glome via CDP till en Playwright-storageState, och
  verktygen är Node-moduler i det personliga repot. Verktyg som ändrar data kräver
  bekräftelse, även schemalagda.
- **Greed** är en tratt: bred insamling → lokal grovsortering (bge-m3 via ollama) → agenten
  väljer ut 07/12/18. Sociala medier läses passivt i Glome; aktiv läsning via GT är ett val
  per källa.

## Öppna uppgifter

Ungefär i prioritetsordning.

1. **`flake.lock` i grunden saknas.** Kör `nix flake lock` här, committa och pusha, och ta
   bort `--no-write-lock-file` ur `README.md` och `scripts/gulnux-install.sh`.
2. **Kontrollera på X1:an** det som bara testats med låtsasmiljöer: SwayFX-inställningarna,
   panelens CSS (waybar), GTK-accenten, agentstatusen i panelen (Claude Code-hooks),
   swaylock-effects, Plymouth, Glomes temafärg och om policyn `toolbar_pin: force_pinned`
   räcker (reserven i `scripts/glome.sh` fäster knapparna annars), native messaging för
   GT-knappen (`/etc/chromium/native-messaging-hosts`).
3. **Riktiga skärmdumpar** (`grim`) i stället för skisserna i `docs/bilder/` (skrivbord,
   inloggning, låsskärm, programstartare). Ta bort texten om skisser i README:n.
4. **ReGreet hänger sig.** Loggen visade: klocka-varning (`Could not parse system locale
   sv-SE`), `Missing TOML file: /var/lib/regreet/state.toml`, och efter klick på Login
   `greetd asks for a secret auth input: Password` – sedan inget mer; musen rörde sig men
   inget svarade. Misstänkta: vår `extraCss` (`config/regreet/style.css`), temat
   (adw-gtk3 i GTK4) eller cage. Prova utan CSS och tema först.
5. **Greed på riktigt:** läsningen från Facebook, Instagram och X (selektorerna i
   `apps/greed-tillagg/innehall.js`) är otestad med riktiga konton; agentens urval och
   vektorerna har bara körts mot låtsasversioner.
6. **Good Times på riktigt:** en riktig lärsession med Claude mot en riktig app.
7. **Gloffice med LibreOffice:** PDF-export, konvertering och omräkning är otestade.
8. **Mistral Vibe:** saknar MCP-registrering och stöd i reflektionen (bara claude och codex).
9. **Saknade körningar:** en schemalagd GT-handling eller ett Greed-urval körs direkt när
   datorn startar om tiden passerades medan den var avstängd (`Persistent=true`) – kanske
   ska tidskritiska handlingar hoppas över.
