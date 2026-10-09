# gul – the Gulnux entry point: starts your coding agent with Gulnux context and your memory

usage() {
  cat <<'EOF'
gul [claude|codex|vibe] [args]   start an agent (default: your chosen one)
gul use <agent>                  change the default agent
gul setup                        connect Gulnux to your GitHub account and personal repo
gul search <query>               search documents, memory and saved web pages
gul search save                  save the page you have open in Glome to the search index
gul memory [term]                show what Gulnux remembers about you
gul proposals                    review Gulnux's proposed improvements
gul reflect                      let Gulnux reflect now instead of waiting
gul log                          summarize what Gulnux has observed
gul learning [on|off]            pause or resume observation and reflection
gul update                       fetch the latest Gulnux base and rebuild
gul gt                           Good Times: teach your computer your work in web apps
gul greed                        Greed: your self-curating feed
EOF
}

conf_dir="${XDG_CONFIG_HOME:-$HOME/.config}/gulnux"
state="${XDG_STATE_HOME:-$HOME/.local/state}/gulnux"
repo="${GULNUX_PERSONAL:-$HOME/gulnux-personal}"

case "${1:-}" in
  use)
    mkdir -p "$conf_dir"
    echo "${2:?specify claude, codex or vibe}" > "$conf_dir/agent"
    echo "Default agent: $2 (set agent in settings.nix to make it apply on all your computers)"
    exit 0
    ;;
  gt|greed)
    app="$1"
    shift
    exec "$app" "$@"
    ;;
  setup|search|memory|proposals|reflect|log|learning|update)
    sub="$1"
    shift
    exec "gul-$sub" "$@"
    ;;
  -h|--help|help)
    usage
    exit 0
    ;;
esac

# First start: connect to GitHub and activate the personal settings
hm_active() {
  [ -e "${XDG_STATE_HOME:-$HOME/.local/state}/nix/profiles/home-manager" ] || [ -e "/nix/var/nix/profiles/per-user/$USER/home-manager" ]
}
if [ ! -d "$repo" ] && [ -t 0 ]; then
  echo "Gulnux is not connected to your GitHub account yet."
  gul-setup || echo "gul: setup was cancelled – run 'gul setup' whenever you like." >&2
elif [ -d "$repo" ] && ! hm_active; then
  echo "Activating your personal settings for the first time…"
  if gulnux-home; then
    # The theme lives in ~/.config: let the panel and notifications pick it up
    swaymsg reload >/dev/null 2>&1 || true
    makoctl reload >/dev/null 2>&1 || true
  else
    echo "gul: could not activate your settings – run 'gulnux-home' to see the error." >&2
  fi
fi

agent=""
case "${1:-}" in
  claude|codex|vibe) agent="$1"; shift ;;
esac
if [ -z "$agent" ]; then
  if [ -f "$conf_dir/agent" ]; then
    agent="$(cat "$conf_dir/agent")"
  elif [ -n "${GULNUX_AGENT:-}" ]; then
    agent="$GULNUX_AGENT"
  else
    agent="$(cat /etc/gulnux/default-agent)"
  fi
fi

# Shared context for all agents: the Gulnux system context plus the user's memory
mkdir -p "$state"
context="$state/AGENTS.md"
{
  cat /etc/gulnux/AGENTS.md
  if [ -f "$repo/memory/MEMORY.md" ]; then
    printf "\n---\n\n# Användarens minne\n\nFrån \`%s\`. Läs de enskilda minnesfilerna när de är relevanta.\n\n" "$repo/memory"
    cat "$repo/memory/MEMORY.md"
  fi
  apps=("$repo"/gt/*/SKILL.md)
  if [ -e "${apps[0]}" ]; then
    printf "\n---\n\n# Good Times-appar\n\nAppar som GT har lärt sig. Läs appens SKILL.md när användaren vill göra något i den.\n\n"
    for skill in "${apps[@]}"; do
      dir=$(dirname "$skill")
      printf -- "- %s: %s\n" "$(jq -r '.title' "$dir/app.json" 2>/dev/null || basename "$dir")" "$skill"
    done
  fi
} > "$context"

# Link a Gulnux file into an agent's configuration without overwriting the user's own files
link_file() {
  mkdir -p "$(dirname "$2")"
  if [ ! -e "$2" ] || [ -L "$2" ]; then
    ln -sfn "$1" "$2"
  fi
}
link_file "$context" "$HOME/.claude/CLAUDE.md"
link_file "$context" "$HOME/.codex/AGENTS.md"

# Register an MCP server with Claude Code and Codex unless it is already there
#   register_mcp <name> <command> [arguments...]
register_mcp() {
  local name="$1"
  shift
  if command -v claude >/dev/null && ! jq -e --arg n "$name" '.mcpServers[$n]' "$HOME/.claude.json" >/dev/null 2>&1; then
    claude mcp add --scope user "$name" -- "$@" >/dev/null 2>&1 || true
  fi
  local codex_conf="$HOME/.codex/config.toml" args=""
  if ! grep -qs "^\[mcp_servers\.$name\]" "$codex_conf"; then
    for a in "${@:2}"; do args+="\"$a\", "; done
    printf '\n[mcp_servers.%s]\ncommand = "%s"\nargs = [%s]\n' "$name" "$1" "${args%, }" >> "$codex_conf"
  fi
}

# The Glome browser
if command -v glome-mcp >/dev/null; then
  register_mcp glome glome-mcp
  link_file /etc/gulnux/commands/glome.md "$HOME/.claude/commands/glome.md"
  link_file /etc/gulnux/commands/glome.md "$HOME/.codex/prompts/glome.md"
fi

# The Gloffice office suite
if command -v gloffice >/dev/null; then
  register_mcp gloffice gloffice mcp
fi

# Search
if command -v gulsearch >/dev/null; then
  register_mcp gulsearch gulsearch mcp
fi

# Greed: the self-curating feed
if command -v greed >/dev/null; then
  register_mcp greed greed mcp
fi

# Good Times: the MCP server, each learned app as a Claude Code skill, and the app schedules
if command -v gt >/dev/null; then
  register_mcp gt gt mcp
  for dir in "$repo"/gt/*/; do
    if [ -f "$dir/SKILL.md" ]; then
      link_file "${dir%/}" "$HOME/.claude/skills/gt-$(basename "$dir")"
    fi
  done
  gt sync >/dev/null 2>&1 || true
fi

# The agent's status in the panel: the agents' hooks tell gul-agent-status what they are doing
if command -v gul-agent-status >/dev/null; then
  claude_settings="$HOME/.claude/settings.json"
  if command -v claude >/dev/null && ! grep -qs "gul-agent-status" "$claude_settings"; then
    mkdir -p "$HOME/.claude"
    [ -s "$claude_settings" ] || echo '{}' > "$claude_settings"
    jq '
      def hook(cmd): {hooks: [{type: "command", command: cmd}]};
      .hooks.UserPromptSubmit += [hook("gul-agent-status working")]
      | .hooks.PreToolUse += [{matcher: "*"} + hook("gul-agent-status tool")]
      | .hooks.Stop += [hook("gul-agent-status idle")]
      | .hooks.Notification += [hook("gul-agent-status attention")]
    ' "$claude_settings" > "$claude_settings.tmp"
    mv "$claude_settings.tmp" "$claude_settings"
  fi
  # Codex only reports finished turns; notify must be a top-level key, so it goes first in the file
  codex_conf="$HOME/.codex/config.toml"
  if ! grep -qs '^notify' "$codex_conf"; then
    mkdir -p "$HOME/.codex"
    { echo 'notify = ["gul-agent-status", "idle"]'; cat "$codex_conf" 2>/dev/null || true; } > "$codex_conf.tmp"
    mv "$codex_conf.tmp" "$codex_conf"
  fi
  gul-agent-status idle
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
    echo "gul: unknown agent '$agent' (choose claude, codex or vibe)" >&2
    exit 1
    ;;
esac
