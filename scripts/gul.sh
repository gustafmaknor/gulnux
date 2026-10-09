# gul – startar Gulnux kodagent
#
#   gul                 starta vald agent
#   gul codex [args]    starta en specifik agent (claude, codex, vibe)
#   gul use codex       byt standardagent för din användare

conf_dir="${XDG_CONFIG_HOME:-$HOME/.config}/gulnux"

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

# Länka en Gulnux-fil till agentens konfiguration, utan att skriva över användarens egna filer
link_file() {
  mkdir -p "$(dirname "$2")"
  if [ ! -e "$2" ] || [ -L "$2" ]; then
    ln -sfn "$1" "$2"
  fi
}
link_file /etc/gulnux/AGENTS.md "$HOME/.claude/CLAUDE.md"
link_file /etc/gulnux/AGENTS.md "$HOME/.codex/AGENTS.md"

# Webbläsaren Glome: registrera MCP-servern och /glome-kommandot hos agenterna
if command -v glome-mcp >/dev/null; then
  if command -v claude >/dev/null && ! claude mcp get glome >/dev/null 2>&1; then
    claude mcp add --scope user glome -- glome-mcp >/dev/null 2>&1 || true
  fi
  codex_conf="$HOME/.codex/config.toml"
  if ! grep -qs '^\[mcp_servers\.glome\]' "$codex_conf"; then
    printf '\n[mcp_servers.glome]\ncommand = "glome-mcp"\n' >> "$codex_conf"
  fi

  link_file /etc/gulnux/commands/glome.md "$HOME/.claude/commands/glome.md"
  link_file /etc/gulnux/commands/glome.md "$HOME/.codex/prompts/glome.md"
fi

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
