# gul minne – visa vad Gulnux minns om dig
#
#   gul minne              visa minnesindexet
#   gul minne <sökord>     sök i alla minnen
#   gul minne redigera     öppna minnesmappen i din editor

minne="${GULNUX_PERSONLIG:-$HOME/gulnux-personlig}/minne"
if [ ! -d "$minne" ]; then
  echo "Gulnux har inget minne än – kör 'gul setup' först." >&2
  exit 1
fi

case "${1:-}" in
  "") cat "$minne/MINNE.md" ;;
  redigera) exec "${EDITOR:-vim}" "$minne" ;;
  *) grep -ri --color=auto -- "$*" "$minne" || echo "Gulnux minns inget om \"$*\"." ;;
esac
