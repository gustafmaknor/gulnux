# Gulnux

En AI-first-distribution byggd på NixOS. Startpunkten är en kodagent (Claude Code,
Codex eller Mistral Vibe), och agenten sköter datorn åt dig.

**Ledstjärna: Gulnux ska lära sig att vara det OS som användaren vill ha.**

- **Bas:** NixOS (flake), med rollback av varje ändring
- **Skrivbord:** Sway (tiling, Wayland) + foot + waybar + fuzzel
- **Agent:** `gul` startar vald agent med Gulnux kontext och ditt minne
- **Webbläsare:** Glome, med full MCP-styrning för agenterna
- **Kontorssvit:** Gloffice, med egen MCP-server
- **Sökning:** lokal hybridsökning i dokument, minne och sparade webbsidor
- **Lärande:** minne, lokal observation och veckovis reflektion med förslag du godkänner

## Två repon: grunden och ditt eget

| Repo | Innehåll | Synlighet |
|---|---|---|
| **Gulnux-grunden** (det här repot) | Själva distributionen. Inget personligt. | Publikt |
| **Ditt personliga repo** (`<ditt-konto>/gulnux-personlig`) | Dina inställningar, dina datorer, ditt minne och godkända förslag | Privat |

Ditt personliga repo hämtar grunden som ett beroende med låst version (`gul uppdatera`
hämtar senaste). Installationen kräver ett GitHub-konto och skapar repot åt dig. Finns det
redan, till exempel från en tidigare dator, hämtas det, så att hela din Gulnux följer med.

Flera personer kan använda samma dator. Var och en har ett eget personligt repo, och
personliga inställningar ligger på användarnivå (Home Manager), så de kräver inte sudo.
Maskinens ägare lägger till fler användare i sin maskinkonfiguration, och de kör sedan
`gul setup` när de loggar in första gången.

## Lärande

| Del | Vad det gör | Kommando |
|---|---|---|
| **Minne** | Agenterna sparar det de lär sig om dig som korta filer i `minne/` i ditt repo. Alla agenter delar samma minne. | `gul minne` |
| **Observation** | Loggar lokalt vilka program du öppnar och vilka kommandon du kör (bara namnet och om det lyckades, aldrig argument). Sparas i 30 dagar och lämnar aldrig datorn. | `gul logg` |
| **Reflektion** | En gång i veckan går en agent igenom loggen, ditt minne och vad du bett agenterna om, och föreslår högst tre förbättringar i en git-gren. Inget ändras utan att du godkänner det. | `gul forslag` |

- Godkänn med `gul forslag godkann`, avböj med `gul forslag avboj <namn> "varför"`. Avböjda
  förslag sparas i minnet så att de inte föreslås igen.
- Pausa allt med `gul larande av`. Stäng av permanent i `home.nix`:
  `gulnux.larande.observera = false;` och/eller `gulnux.larande.reflektera = false;`
- Reflektionen använder din agent och dess konto, så den kostar som en vanlig agentsession.

## Installation

Det här gäller alla installationer. Skillnaden är bara vilken disk du installerar på:
datorns inbyggda disk, ett USB-minne eller en virtuell maskin.

1. **Förbered USB:** ladda ner *NixOS minimal ISO* från nixos.org och skriv den till en
   USB-sticka med Rufus eller balenaEtcher.
2. **BIOS:** stäng av *Secure Boot* (ThinkPad: `F1` vid start) och starta från USB
   (ThinkPad: `F12`).
3. **Nätverk** (wifi; med kabel eller i en VM fungerar det direkt):
   ```
   sudo systemctl start wpa_supplicant
   wpa_cli
   > add_network
   > set_network 0 ssid "NÄTVERK"
   > set_network 0 psk "LÖSENORD"
   > enable_network 0
   > quit
   ```
4. **Hitta disken** du ska installera på:
   ```
   lsblk -o NAME,SIZE,MODEL,TRAN
   ```
   Datorns inbyggda disk heter oftast `nvme0n1`, ett USB-minne `sdb` (med `TRAN = usb`) och
   disken i en VM `sda`.
5. **Partitionera** (raderar hela disken du väljer!). Byt `DISK`, och använd `p1`/`p2` för
   nvme-diskar men `1`/`2` för `sdX`:
   ```
   sudo -i
   DISK=/dev/nvme0n1
   parted $DISK -- mklabel gpt
   parted $DISK -- mkpart ESP fat32 1MB 1GB
   parted $DISK -- set 1 esp on
   parted $DISK -- mkpart root ext4 1GB 100%
   mkfs.fat -F 32 -n BOOT ${DISK}p1
   mkfs.ext4 -L gulnux ${DISK}p2
   mount /dev/disk/by-label/gulnux /mnt
   mount --mkdir -o umask=077 /dev/disk/by-label/BOOT /mnt/boot
   ```
6. **Installera Gulnux:**
   ```
   nix --extra-experimental-features 'nix-command flakes' run github:gustafmaknor/gulnux#installera
   ```
   Installationsprogrammet loggar in på GitHub (du får en kod att skriva in på
   github.com/login/device, gärna från mobilen), skapar eller hämtar ditt personliga repo,
   föreslår en maskinprofil (ThinkPad X1 Gen 10, VirtualBox, USB eller generisk), installerar
   och frågar efter ditt lösenord.
7. **Starta om**, ta ur USB-stickan och logga in. Agenten startar på arbetsyta 1.

### Testa utan att röra datorns disk

Installera på ett **externt USB-minne eller en USB-SSD** (minst 32 GB, gärna SSD). Du behöver
då en andra USB-sticka med NixOS-ISO:n. Installationsprogrammet känner igen USB-disken och
väljer profilen `usb`, som inte skriver något i datorns bootmeny. Starta Gulnux via `F12`.

Om datorn kör Windows med BitLocker kan avstängd Secure Boot göra att Windows ber om
återställningsnyckeln. Ha den till hands (account.microsoft.com/devices/recoverykey).

### Testa i VirtualBox (Windows)

```
powershell -ExecutionPolicy Bypass -File scripts\vbox-create.ps1
```
Skriptet laddar ner NixOS-ISO:n och skapar och startar VM:en. Följ sedan stegen ovan med
`DISK=/dev/sda` (partitionerna heter då `sda1`/`sda2`).

## Vardag

```
gul                     starta din agent
gul codex               starta en viss agent
gul sok <fråga>         sök i dokument, minne och sparade sidor
gul sok spara           spara sidan du har framme i Glome
gul minne               vad Gulnux minns om dig
gul forslag             Gulnux förslag på förbättringar
gul logg                vad Gulnux har observerat
gul larande av          pausa lärandet
gul uppdatera           hämta senaste Gulnux-grunden
gulnux-home             aktivera ändringar i home.nix (användarnivå)
gulnux-rebuild          aktivera ändringar i hosts/ (systemnivå, sudo)
sudo nixos-rebuild switch --rollback   ångra senaste systemändringen
```

## Sökning

Gulnux sök hittar saker i dina dokument (`~/Dokument`: Word, Excel, PowerPoint, PDF, text),
ditt minne och webbsidor du sparat från Glome. Den kombinerar fulltext, som hittar namn,
nummer och exakta ord, med vektorer från en lokal flerspråkig modell (bge-m3 via ollama),
som hittar på betydelse. Allt stannar på datorn.

- Be agenten: *"hitta offerten om takbyte från i våras"*
- `gul sok <fråga>` i terminalen, `gul sok status` för att se vad som är indexerat
- Indexet hålls uppdaterat i bakgrunden (`systemctl --user status gulsok`). Fulltexten
  fungerar direkt, och vektorerna räknas fram i takt med att modellen hinner.

**Webbsidor från Glome** har tre lägen, som du ställer in i `home.nix`:

| `gulnux.sok.glome` | Vad som sparas |
|---|---|
| `"av"` | Inga webbsidor |
| `"manuell"` (standard) | Bara när du trycker på sökknappen (förstoringsglaset) i Glome eller kör `gul sok spara` |
| `"auto"` | Varje sida du öppnar, utom undantagna (bank, e-post, vården, myndigheter …). Knappen fungerar även på undantagna sidor. |

```nix
gulnux.sok.glome = "auto";
gulnux.sok.undantag = [ "bank" "mail." "intranat.foretaget.se" ];
gulnux.sok.kallor.projekt = "~/Projekt";
```

Ta bort en sida ur indexet med `gul sok glom <id>`. Byte mellan `av` och de andra lägena
gäller från nästa gång Glome startar.

## Glome – webbläsaren

Glome är Chromium med egen profil (`~/.config/glome`) och fjärrstyrning på `127.0.0.1:9222`.
Agenterna styr den via MCP-servern `glome` (Chrome DevTools MCP), som `gul` registrerar
automatiskt hos Claude Code och Codex.

- Be agenten: *"sök efter NixOS Sway-teman och öppna det bästa i Glome"*
- `/glome` i agenten läser och analyserar sidan du har framme (t.ex. `/glome vilka är för- och nackdelarna?`)
- `glome <url>` öppnar en adress, `glome-read` skriver ut sidans text, `glome-read | claude -p "sammanfatta"`
- `Super+g` öppnar Glome

Fjärrstyrningsporten är bara öppen lokalt, men alla program som körs som din användare kan
styra Glome, inklusive dina inloggade konton.

## Gloffice – kontorssviten

En enkel lokal kontorssvit för `.docx`, `.xlsx` och `.pptx`. Den är webbaserad och öppnas som
ett eget fönster i Glome (`gloffice` eller `Super+o`). Agenterna arbetar i filerna via
MCP-servern `gloffice`, och fönstret uppdateras automatiskt medan de gör det.

- Be agenten: *"skapa en budget för hösten i budget.xlsx och öppna den"*
- Textdokument: skriv direkt i stycken, Enter ger nytt stycke
- Kalkylark: klicka i en cell och skriv i formelfältet, `=SUM(A1:A5)` fungerar
- Presentationer: redigera text på bilderna, lägg till bilder
- Allt sparas direkt i originalfilen. Före varje ändring sparas en kopia i
  `~/.local/share/gloffice/backups`, så **Ångra** fungerar även på det agenten gjort.
- PDF-export, äldre format och omräkning av formler görs med LibreOffice.

Begränsningar: bilder och diagram i kalkylark kan försvinna när Gloffice sparar (det beror på
openpyxl). Textdokument redigeras stycke för stycke, och formatering inom ett stycke
förenklas när du ändrar dess text.

## Kortkommandon

| Tangent | Funktion |
|---|---|
| `Super+a` | Hoppa till agenten |
| `Super+Shift+a` | Öppna agentsessionen igen |
| `Super+Enter` | Terminal |
| `Super+g` | Glome |
| `Super+o` | Gloffice |
| `Super+d` | Programstartare |
| `Super+h/j/k/l` | Flytta fokus |
| `Super+1..9` | Byt arbetsyta |
| `Super+Shift+q` | Stäng fönster |
| `Super+Escape` | Lås skärmen |

## Struktur

```
flake.nix                    moduler, profiler, lib.personlig, mall, ISO och installera
lib/personlig.nix            bygger maskiner och hemkatalog ur ett personligt repo
modules/gulnux/              systemnivå: bas, skrivbord, agenter, Glome, Gloffice, sök
modules/hem/                 användarnivå: git, observation, reflektion, sök
modules/profiler/            maskinprofiler: generisk, thinkpad-x1-gen10, virtualbox, usb
templates/personlig/         mallen för det personliga repot
pkgs/gul.nix                 gul-kommandona
scripts/                     gul, gul-*, gulnux-installera, glome, vbox-create
agent/AGENTS.md              kontexten som alla agenter får
agent/prompts/reflektera.md  instruktionen till veckoreflektionen
apps/gloffice/               kontorssviten
apps/gulsok/                 sökningen (index, bakgrundstjänst, MCP)
apps/glome-tillagg/          sökknappen och auto-läget i Glome
config/sway/config           fönsterhanteraren
hosts/iso/                   installations-ISO
```

## Bygga egen ISO

Kräver Linux med Nix: `nix build .#iso`. ISO:n startar i en terminal med agenterna och
`gulnux-installera` förinstallerade.
