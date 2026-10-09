# glome – Gulnux webbläsare: Chromium med egen profil och fjärrstyrning för agenterna
#
#   glome            öppna Glome (eller ett nytt fönster om den redan körs)
#   glome <url>      öppna en adress, i den redan öppna Glome om den körs

port="${GLOME_PORT:-9222}"
profile="${XDG_CONFIG_HOME:-$HOME/.config}/glome"

# Tillägget för Gulnux sök (knappen och auto-läget), om Glome-sidor inte är avstängda.
# Läget ställs in med gulnux.search.glome i home.nix.
tillagg=()
lage=$(jq -r '.glome // "manual"' "${XDG_CONFIG_HOME:-$HOME/.config}/gulsearch/config.json" 2>/dev/null || echo manual)
if [ "$lage" != off ] && [ -d /etc/gulnux/glome-tillagg ]; then
  tillagg=(--load-extension=/etc/gulnux/glome-tillagg --disable-features=DisableLoadExtensionCommandLineSwitch)
fi

exec chromium \
  --user-data-dir="$profile" \
  --remote-debugging-port="$port" \
  --class=glome \
  --ozone-platform-hint=auto \
  --no-first-run \
  --no-default-browser-check \
  "${tillagg[@]}" \
  "$@"
