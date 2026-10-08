# gul – startar Gulnux kodagent
#
#   gul                 starta vald agent
#   gul codex [args]    starta en specifik agent (claude, codex, vibe)
#   gul use codex       byt standardagent för din användare

conf_dir="${XDG_CONFIG_HOME:-$HOME/.config}/gulnux"
context=/etc/gulnux/AGENTS.md

if [ "${1:-}" = "use" ]; then
  mkdir -p "$conf_dir"
  echo "${2:?ange claude, codex eller vibe}" > "$conf_dir/agent"
  echo "Standardagent: $2"
  exit 0
fi

agent=""
case "${1:-}" in
  claude|codex|vibe) agent="$1"; shift ;;
esac
if [ -z "$agent" ]; then
  if [ -f "$conf_dir/agent" ]; then
    agent="$(cat "$conf_dir/agent")"
  else
    agent="$(cat /etc/gulnux/default-agent)"
  fi
fi

# Ge alla agenter samma systemkontext, utan att skriva över användarens egna filer
link_context() {
  mkdir -p "$(dirname "$1")"
  if [ ! -e "$1" ] || [ -L "$1" ]; then
    ln -sfn "$context" "$1"
  fi
}
link_context "$HOME/.claude/CLAUDE.md"
link_context "$HOME/.codex/AGENTS.md"

case "$agent" in
  claude) exec claude "$@" ;;
  codex) exec codex "$@" ;;
  vibe)
    if command -v vibe >/dev/null; then
      exec vibe "$@"
    fi
    exec uv tool run --from mistral-vibe vibe "$@"
    ;;
  *)
    echo "gul: okänd agent '$agent' (välj claude, codex eller vibe)" >&2
    exit 1
    ;;
esac
