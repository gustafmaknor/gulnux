# gul update – fetch the latest version of the Gulnux base and rebuild

repo="${GULNUX_PERSONAL:-$HOME/gulnux-personal}"
cd "$repo" || exit 1

git pull -q --rebase --autostash || echo "Could not fetch from GitHub – continuing with what is available locally."
nix flake update gulnux
if git diff --quiet flake.lock; then
  echo "You already have the latest Gulnux."
  exit 0
fi

echo "Fetched a new Gulnux version."
if [ -d "hosts/$(hostname)" ]; then
  echo "Rebuilding the system (requires your password)…"
  gulnux-rebuild
fi
gulnux-home
git commit -q -m "Update Gulnux" flake.lock
git push -q || true
echo "Gulnux is up to date."
