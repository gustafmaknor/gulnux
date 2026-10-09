# gulnux-install – installs Gulnux on a partitioned and mounted disk
#
# Run as root from a NixOS ISO, after mounting the disk on /mnt (and /mnt/boot):
#   nix run github:gustafmaknor/gulnux#install
#
# Connects to your GitHub account, creates or clones your personal repo, adds this
# machine to it and installs.

if [ "$(id -u)" != 0 ]; then
  echo "Run as root (sudo -i) and try again." >&2
  exit 1
fi
if ! mountpoint -q /mnt; then
  echo "Nothing is mounted on /mnt. Partition and mount the disk first (see the README)." >&2
  exit 1
fi
mountpoint -q /mnt/boot || echo "Warning: /mnt/boot is not mounted – the bootloader may end up in the wrong place."

ask() {
  local answer
  read -r -p "$2${3:+ [$3]}: " answer
  printf -v "$1" '%s' "${answer:-$3}"
}

echo "== 1/5 Your personal repo"
temporary=/mnt/root/gulnux-personal
mkdir -p /mnt/root
rm -rf "$temporary"
gul-setup --dir "$temporary" --username "" --install
username=$(nix --extra-experimental-features nix-command eval --raw --file "$temporary/settings.nix" username)
repo="/mnt/home/$username/gulnux-personal"
if [ -e "$repo" ]; then
  echo "$repo already exists – move or remove it first." >&2
  exit 1
fi
mkdir -p "/mnt/home/$username"
mv "$temporary" "$repo"

echo "== 2/5 This machine"
guess_profile() {
  case "$(systemd-detect-virt 2>/dev/null || true)" in
    oracle) echo virtualbox; return ;;
    none | "") ;;
    *) echo generic; return ;;
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
  echo generic
}
profile=$(guess_profile)
machine=""
echo "Profiles: generic (generic PC), thinkpad-x1-gen10, virtualbox, usb"
while :; do
  ask profile "Profile" "$profile"
  case "$profile" in generic|thinkpad-x1-gen10|virtualbox|usb) break ;; esac
  echo "Choose one of the profiles above."
done
case "$profile" in
  thinkpad-x1-gen10) suggested_machine=x1 ;;
  virtualbox) suggested_machine=gulnux-vm ;;
  usb) suggested_machine=gulnux-usb ;;
  *) suggested_machine=gulnux ;;
esac
while :; do
  ask machine "Machine name" "$suggested_machine"
  [[ "$machine" =~ ^[a-z0-9][a-z0-9-]*$ ]] && break
  echo "Use lowercase letters, digits and -."
done

host_dir="$repo/hosts/$machine"
mkdir -p "$host_dir"
if [ -f "$host_dir/default.nix" ]; then
  echo "The machine $machine already exists in your repo – reusing it with a new hardware configuration."
else
  version=$(nixos-version | grep -oE '^[0-9]+\.[0-9]+')
  cat > "$host_dir/default.nix" <<EOF
{ gulnux, ... }:
{
  imports = [
    ./hardware-configuration.nix
    gulnux.nixosModules.profiles.$profile
  ];

  # More users on this machine (each one runs 'gul setup' with their own repo):
  # gulnux.users.anna = { name = "Anna"; };

  # Set to the NixOS version that was first installed, and never changed afterwards
  system.stateVersion = "$version";
}
EOF
fi
nixos-generate-config --root /mnt --show-hardware-config > "$host_dir/hardware-configuration.nix"
git -C "$repo" add -A
git -C "$repo" -c user.name=Gulnux -c user.email=gulnux@localhost commit -q -m "Machine: $machine" || true

echo "== 3/5 Installing (this takes a while)"
nixos-install --flake "$repo#$machine" --no-root-passwd
git -C "$repo" add -A
git -C "$repo" -c user.name=Gulnux -c user.email=gulnux@localhost commit -q -m "Lock Gulnux version" || true
git -C "$repo" push -q origin main || echo "Could not push to GitHub – push from $repo after the first start."

echo "== 4/5 Password for $username"
until nixos-enter --root /mnt -c "passwd $username"; do echo "Try again."; done

echo "== 5/5 Finishing"
# The GitHub login comes along so that pushing works right after the first start
if [ -d /root/.config/gh ]; then
  mkdir -p "/mnt/home/$username/.config"
  cp -r /root/.config/gh "/mnt/home/$username/.config/"
fi
nixos-enter --root /mnt -c "chown -R $username:users /home/$username"

echo
echo "Gulnux is installed on $machine. Reboot, remove the installation media and log in as $username."
