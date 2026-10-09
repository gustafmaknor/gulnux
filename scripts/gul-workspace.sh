# gul-workspace – go to the next or previous workspace, also empty ones
#
#   gul-workspace next|prev
#
# Sway's own "workspace next" only visits workspaces that already have windows. This counts
# 1, 2, 3 … up to 4 (the ones in the panel) or the highest workspace in use, whichever is larger.

current=$(swaymsg -t get_workspaces | jq '.[] | select(.focused) | .num')
last=$(swaymsg -t get_workspaces | jq '[.[].num, 4] | max')

case "${1:-}" in
  next) target=$((current + 1)); [ "$target" -gt "$last" ] && target=$last ;;
  prev) target=$((current - 1)); [ "$target" -lt 1 ] && target=1 ;;
  *) echo "gul-workspace: choose next or prev" >&2; exit 1 ;;
esac

if [ "$target" != "$current" ]; then
  swaymsg -q workspace number "$target"
fi
