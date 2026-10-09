# glome – Gulnux webbläsare: Chromium med egen profil och fjärrstyrning för agenterna
#
#   glome            öppna Glome (eller ett nytt fönster om den redan körs)
#   glome <url>      öppna en adress, i den redan öppna Glome om den körs

port="${GLOME_PORT:-9222}"
profile="${XDG_CONFIG_HOME:-$HOME/.config}/glome"

exec chromium \
  --user-data-dir="$profile" \
  --remote-debugging-port="$port" \
  --class=glome \
  --ozone-platform-hint=auto \
  --no-first-run \
  --no-default-browser-check \
  "$@"
