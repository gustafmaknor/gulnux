# Gulnux

En AI-first-distribution byggd på NixOS. Startpunkten är en kodagent (Claude Code,
Codex eller Mistral Vibe), och agenten sköter systemet genom att ändra i det här repot.

- **Bas:** NixOS (flake), med rollback av varje ändring
- **Skrivbord:** Sway (tiling, Wayland) + foot + waybar + fuzzel
- **Agent:** `gul` startar vald agent med gemensam systemkontext (`agent/AGENTS.md`)

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

## Struktur

```
flake.nix                 värdar: x1 (ThinkPad X1 Gen 10) och iso
modules/gulnux/           base.nix, desktop.nix, agents.nix
hosts/x1/                 maskinspecifikt + hardware-configuration.nix
hosts/iso/                live-ISO
config/sway/config        fönsterhanteraren
scripts/gul.sh            agentstartaren
agent/AGENTS.md           systemkontext som alla agenter får
```

## Kortkommandon

| Tangent | Funktion |
|---|---|
| `Super+a` | Hoppa till agenten |
| `Super+Shift+a` | Öppna agentsessionen igen |
| `Super+Enter` | Terminal |
| `Super+g` | Glome |
| `Super+d` | Programstartare |
| `Super+h/j/k/l` | Flytta fokus |
| `Super+1..9` | Byt arbetsyta |
| `Super+Shift+q` | Stäng fönster |
| `Super+Escape` | Lås skärmen |

## Testa på USB utan att röra datorns disk

Gulnux installeras på ett externt USB-minne eller en USB-SSD och startas därifrån.
Datorns inbyggda disk och bootmeny lämnas orörda.

Du behöver **två** USB-enheter:
- **A**: NixOS minimal ISO (skrivs med Rufus), minst 2 GB
- **B**: Gulnux-installationen, minst 32 GB. En USB-SSD blir mycket snabbare än ett vanligt minne.

1. Sätt i A, starta från den (F12 på ThinkPad, Secure Boot avstängt) och anslut till nätverket
   (se steg 3 under X1-installationen nedan).
2. Sätt i B och leta upp den. **Den inbyggda disken heter `nvme0n1` – rör den inte.**
   ```
   lsblk -o NAME,SIZE,MODEL,TRAN
   ```
   B är den med `TRAN = usb` och rätt storlek, oftast `sdb`.
3. Installera (byt `sdX` mot B:s namn):
   ```
   sudo -i
   DISK=/dev/sdX
   parted $DISK -- mklabel gpt
   parted $DISK -- mkpart ESP fat32 1MB 1GB
   parted $DISK -- set 1 esp on
   parted $DISK -- mkpart root ext4 1GB 100%
   mkfs.fat -F 32 -n GULBOOT ${DISK}1
   mkfs.ext4 -L gulnux ${DISK}2
   mount /dev/disk/by-label/gulnux /mnt
   mount --mkdir -o umask=077 /dev/disk/by-label/GULBOOT /mnt/boot

   nix-shell -p git
   git clone https://github.com/gustafmaknor/gulnux /mnt/home/gul/gulnux
   cd /mnt/home/gul/gulnux
   nixos-generate-config --root /mnt --show-hardware-config > hosts/usb/hardware-configuration.nix
   git add hosts/usb/hardware-configuration.nix
   nixos-install --flake .#usb
   ```
4. Stäng av, ta ur A och starta från B via F12. Fortsätt med *Första inloggningen* nedan.

Om datorn kör Windows med BitLocker kan avstängd Secure Boot göra att Windows ber om
återställningsnyckeln nästa gång. Ha den till hands (account.microsoft.com/devices/recoverykey)
eller slå på Secure Boot igen när du testat klart.

## Testa i VirtualBox (Windows)

1. Installera VirtualBox 7 (`winget install Oracle.VirtualBox`).
2. Skapa och starta VM:en (laddar ner NixOS-ISO:n första gången):
   ```
   powershell -ExecutionPolicy Bypass -File scripts\vbox-create.ps1
   ```
3. Dela repot med VM:en från ett annat PowerShell-fönster:
   ```
   powershell -ExecutionPolicy Bypass -File scripts\serve-repo.ps1
   ```
4. I VM:en (nätverket fungerar direkt via NAT):
   ```
   sudo -i
   parted /dev/sda -- mklabel gpt
   parted /dev/sda -- mkpart ESP fat32 1MB 1GB
   parted /dev/sda -- set 1 esp on
   parted /dev/sda -- mkpart root ext4 1GB 100%
   mkfs.fat -F 32 -n boot /dev/sda1
   mkfs.ext4 -L nixos /dev/sda2
   mount /dev/disk/by-label/nixos /mnt
   mount --mkdir -o umask=077 /dev/disk/by-label/boot /mnt/boot

   mkdir -p /mnt/home/gul && cd /mnt/home/gul
   curl -s http://10.0.2.2:8000 | tar xz && cd gulnux
   nixos-generate-config --root /mnt --show-hardware-config > hosts/vm/hardware-configuration.nix
   nix-shell -p git --run "git init -q && git add -A"
   nixos-install --flake .#vm
   reboot
   ```
5. VM:en startar nu från disken. Fortsätt med *Första inloggningen* nedan.

Tips: Windows fångar vissa Win-kombinationer (t.ex. `Win+L`) innan VM:en ser dem.

## Installation på ThinkPad X1 Carbon Gen 10

Repot behöver ligga på GitHub (eller en USB-sticka) för att kunna hämtas under installationen.

1. **Förbered USB:** ladda ner *NixOS minimal ISO* från nixos.org och skriv den till en
   USB-sticka med Rufus eller balenaEtcher.
2. **BIOS:** tryck `F1` vid start och stäng av *Secure Boot*. Starta från USB med `F12`.
3. **Nätverk** (wifi):
   ```
   sudo systemctl start wpa_supplicant
   wpa_cli
   > add_network
   > set_network 0 ssid "NÄTVERK"
   > set_network 0 psk "LÖSENORD"
   > enable_network 0
   > quit
   ```
4. **Partitionera** (raderar hela disken!):
   ```
   sudo -i
   parted /dev/nvme0n1 -- mklabel gpt
   parted /dev/nvme0n1 -- mkpart ESP fat32 1MB 1GB
   parted /dev/nvme0n1 -- set 1 esp on
   parted /dev/nvme0n1 -- mkpart root ext4 1GB 100%
   mkfs.fat -F 32 -n boot /dev/nvme0n1p1
   mkfs.ext4 -L nixos /dev/nvme0n1p2
   mount /dev/disk/by-label/nixos /mnt
   mount --mkdir -o umask=077 /dev/disk/by-label/boot /mnt/boot
   ```
5. **Installera Gulnux:**
   ```
   nix-shell -p git
   git clone https://github.com/gustafmaknor/gulnux /mnt/home/gul/gulnux
   cd /mnt/home/gul/gulnux
   nixos-generate-config --root /mnt --show-hardware-config > hosts/x1/hardware-configuration.nix
   git add hosts/x1/hardware-configuration.nix   # flakes ser bara filer som git känner till
   nixos-install --flake .#x1
   reboot
   ```
6. **Första inloggningen:** användare `gul`, lösenord `gulnux`. Sedan:
   ```
   passwd
   sudo chown -R gul:users ~/gulnux
   ```
   Agenten startar automatiskt på arbetsyta 1. Logga in i den, och fortsätt sedan att bygga
   Gulnux därifrån.

## Vardag

```
gul                 starta standardagenten
gul codex           starta en viss agent
gul use vibe        byt standardagent
gulnux-rebuild      aktivera ändringar i ~/gulnux
gulnux-rebuild build  bygg utan att aktivera
sudo nixos-rebuild switch --rollback   ångra senaste ändringen
```

## Bygga egen ISO

Kräver Linux med Nix: `nix build .#iso`. ISO:n startar i en terminal med agenterna
installerade och Gulnux-källkoden i `/etc/gulnux/src`.
