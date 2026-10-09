# gul memory – show what Gulnux remembers about you
#
#   gul memory             show the memory index
#   gul memory <term>      search all memories
#   gul memory edit        open the memory folder in your editor

memory="${GULNUX_PERSONAL:-$HOME/gulnux-personal}/memory"
if [ ! -d "$memory" ]; then
  echo "Gulnux has no memory yet – run 'gul setup' first." >&2
  exit 1
fi

case "${1:-}" in
  "") cat "$memory/MEMORY.md" ;;
  edit) exec "${EDITOR:-vim}" "$memory" ;;
  *) grep -ri --color=auto -- "$*" "$memory" || echo "Gulnux doesn't remember anything about \"$*\"." ;;
esac
