# glome – Gulnux webbläsare: Chromium med egen profil och fjärrstyrning för agenterna
#
#   glome            öppna Glome (eller ett nytt fönster om den redan körs)
#   glome <url>      öppna en adress, i den redan öppna Glome om den körs

port="${GLOME_PORT:-9222}"
profile="${XDG_CONFIG_HOME:-$HOME/.config}/glome"

# Gulnux egna tillägg: sökknappen (om Glome-sidor inte är avstängda, se gulnux.search.glome
# i home.nix) och Good Times-knappen
kataloger=()
lage=$(jq -r '.glome // "manual"' "${XDG_CONFIG_HOME:-$HOME/.config}/gulsearch/config.json" 2>/dev/null || echo manual)
if [ "$lage" != off ] && [ -d /etc/gulnux/glome-tillagg ]; then
  kataloger+=(/etc/gulnux/glome-tillagg)
fi
if [ -d /etc/gulnux/gt-tillagg ]; then
  kataloger+=(/etc/gulnux/gt-tillagg)
fi
if [ -d /etc/gulnux/greed-tillagg ]; then
  kataloger+=(/etc/gulnux/greed-tillagg)
fi
tillagg=()
if [ ${#kataloger[@]} -gt 0 ]; then
  lista=$(IFS=,; echo "${kataloger[*]}")
  tillagg=(--load-extension="$lista" --disable-features=DisableLoadExtensionCommandLineSwitch)
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
