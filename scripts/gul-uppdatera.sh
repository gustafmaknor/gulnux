# gul uppdatera – hämta senaste versionen av Gulnux-grunden och bygg om

repo="${GULNUX_PERSONLIG:-$HOME/gulnux-personlig}"
cd "$repo" || exit 1

git pull -q --rebase --autostash || echo "Kunde inte hämta från GitHub – fortsätter med det som finns lokalt."
nix flake update gulnux
if git diff --quiet flake.lock; then
  echo "Du har redan senaste Gulnux."
  exit 0
fi

echo "Ny Gulnux-version hämtad."
if [ -d "hosts/$(hostname)" ]; then
  echo "Bygger om systemet (kräver ditt lösenord)…"
  gulnux-rebuild
fi
gulnux-home
git commit -q -m "Uppdatera Gulnux" flake.lock
git push -q || true
echo "Gulnux är uppdaterat."
