# gulnux-installera – installerar Gulnux på en partitionerad och monterad disk
#
# Körs som root från en NixOS-ISO, efter att disken monterats på /mnt (och /mnt/boot):
#   nix run github:gustafmaknor/gulnux#installera
#
# Kopplar till ditt GitHub-konto, skapar eller hämtar ditt personliga repo, lägger till
# den här maskinen i det och installerar.

if [ "$(id -u)" != 0 ]; then
  echo "Kör som root (sudo -i) och försök igen." >&2
  exit 1
fi
if ! mountpoint -q /mnt; then
  echo "Inget är monterat på /mnt. Partitionera och montera disken först (se README)." >&2
  exit 1
fi
mountpoint -q /mnt/boot || echo "Varning: /mnt/boot är inte monterad – bootloadern kan hamna fel."

fraga() {
  local svar
  read -r -p "$2${3:+ [$3]}: " svar
  printf -v "$1" '%s' "${svar:-$3}"
}

echo "== 1/5 Ditt personliga repo"
tillfallig=/mnt/root/gulnux-personlig
mkdir -p /mnt/root
rm -rf "$tillfallig"
gul-setup --katalog "$tillfallig" --anvandarnamn "" --installation
anvandarnamn=$(nix --extra-experimental-features nix-command eval --raw --file "$tillfallig/installningar.nix" anvandarnamn)
repo="/mnt/home/$anvandarnamn/gulnux-personlig"
if [ -e "$repo" ]; then
  echo "$repo finns redan – flytta eller ta bort den först." >&2
  exit 1
fi
mkdir -p "/mnt/home/$anvandarnamn"
mv "$tillfallig" "$repo"

echo "== 2/5 Den här maskinen"
gissa_profil() {
  case "$(systemd-detect-virt 2>/dev/null || true)" in
    oracle) echo virtualbox; return ;;
    none | "") ;;
    *) echo generisk; return ;;
  esac
  if grep -qs "X1 Carbon Gen 10" /sys/class/dmi/id/product_version; then
    echo thinkpad-x1-gen10
    return
  fi
  local disk
  disk=$(lsblk -no PKNAME "$(findmnt -no SOURCE /mnt)" 2>/dev/null | head -n 1)
  if [ -n "$disk" ] && [ "$(lsblk -dno TRAN "/dev/$disk" 2>/dev/null)" = usb ]; then
    echo usb
    return
  fi
  echo generisk
}
profil=$(gissa_profil)
maskin=""
echo "Profiler: generisk, thinkpad-x1-gen10, virtualbox, usb"
while :; do
  fraga profil "Profil" "$profil"
  case "$profil" in generisk|thinkpad-x1-gen10|virtualbox|usb) break ;; esac
  echo "Välj en av profilerna ovan."
done
case "$profil" in
  thinkpad-x1-gen10) maskin_forslag=x1 ;;
  virtualbox) maskin_forslag=gulnux-vm ;;
  usb) maskin_forslag=gulnux-usb ;;
  *) maskin_forslag=gulnux ;;
esac
while :; do
  fraga maskin "Maskinens namn" "$maskin_forslag"
  [[ "$maskin" =~ ^[a-z0-9][a-z0-9-]*$ ]] && break
  echo "Använd små bokstäver, siffror och -."
done

mapp="$repo/hosts/$maskin"
mkdir -p "$mapp"
if [ -f "$mapp/default.nix" ]; then
  echo "Maskinen $maskin finns redan i ditt repo – återanvänder den med ny hårdvarukonfiguration."
else
  version=$(nixos-version | grep -oE '^[0-9]+\.[0-9]+')
  cat > "$mapp/default.nix" <<EOF
{ gulnux, ... }:
{
  imports = [
    ./hardware-configuration.nix
    gulnux.nixosModules.profiler.$profil
  ];

  # Fler användare på den här maskinen (var och en kör 'gul setup' med sitt eget repo):
  # gulnux.users.anna = { namn = "Anna"; };

  # Sätts till den NixOS-version som installerades först och ändras sedan aldrig
  system.stateVersion = "$version";
}
EOF
fi
nixos-generate-config --root /mnt --show-hardware-config > "$mapp/hardware-configuration.nix"
git -C "$repo" add -A
git -C "$repo" -c user.name=Gulnux -c user.email=gulnux@localhost commit -q -m "Maskin: $maskin" || true

echo "== 3/5 Installerar (det här tar en stund)"
nixos-install --flake "$repo#$maskin" --no-root-passwd
git -C "$repo" add -A
git -C "$repo" -c user.name=Gulnux -c user.email=gulnux@localhost commit -q -m "Lås Gulnux-version" || true
git -C "$repo" push -q origin main || echo "Kunde inte pusha till GitHub – det görs nästa gång du kör gul."

echo "== 4/5 Lösenord för $anvandarnamn"
until nixos-enter --root /mnt -c "passwd $anvandarnamn"; do echo "Försök igen."; done

echo "== 5/5 Avslutar"
# GitHub-inloggningen följer med så att gul kan pusha direkt efter första starten
if [ -d /root/.config/gh ]; then
  mkdir -p "/mnt/home/$anvandarnamn/.config"
  cp -r /root/.config/gh "/mnt/home/$anvandarnamn/.config/"
fi
nixos-enter --root /mnt -c "chown -R $anvandarnamn:users /home/$anvandarnamn"

echo
echo "Gulnux är installerat på $maskin. Starta om, ta ur installationsmediet och logga in som $anvandarnamn."
