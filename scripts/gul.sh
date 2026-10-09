# gul – Gulnux startpunkt: startar din kodagent med Gulnux kontext och ditt minne

hjalp() {
  cat <<'EOF'
gul [claude|codex|vibe] [args]   starta en agent (standard: din valda)
gul use <agent>                  byt standardagent
gul setup                        koppla Gulnux till ditt GitHub-konto och personliga repo
gul minne [sökord]               visa vad Gulnux minns om dig
gul forslag                      granska Gulnux förslag på förbättringar
gul reflektera                   låt Gulnux reflektera nu i stället för att vänta
gul logg                         sammanfatta vad Gulnux har observerat
gul larande [av|pa]              pausa eller slå på observation och reflektion
gul uppdatera                    hämta senaste Gulnux-grunden och bygg om
EOF
}

conf_dir="${XDG_CONFIG_HOME:-$HOME/.config}/gulnux"
state="${XDG_STATE_HOME:-$HOME/.local/state}/gulnux"
repo="${GULNUX_PERSONLIG:-$HOME/gulnux-personlig}"

case "${1:-}" in
  use)
    mkdir -p "$conf_dir"
    echo "${2:?ange claude, codex eller vibe}" > "$conf_dir/agent"
    echo "Standardagent: $2 (ändra agent i installningar.nix för att det ska gälla på alla dina datorer)"
    exit 0
    ;;
  setup|minne|forslag|reflektera|logg|larande|uppdatera)
    sub="$1"
    shift
    exec "gul-$sub" "$@"
    ;;
  -h|--help|hjalp)
    hjalp
    exit 0
    ;;
esac

# Första starten: koppla till GitHub och aktivera de personliga inställningarna
hm_aktiv() {
  [ -e "${XDG_STATE_HOME:-$HOME/.local/state}/nix/profiles/home-manager" ] || [ -e "/nix/var/nix/profiles/per-user/$USER/home-manager" ]
}
if [ ! -d "$repo" ] && [ -t 0 ]; then
  echo "Gulnux är inte kopplat till ditt GitHub-konto än."
  gul-setup || echo "gul: setup avbröts – kör 'gul setup' när du vill." >&2
elif [ -d "$repo" ] && ! hm_aktiv; then
  echo "Aktiverar dina personliga inställningar för första gången…"
  gulnux-home || echo "gul: kunde inte aktivera inställningarna – kör 'gulnux-home' för att se felet." >&2
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

# Gemensam kontext för alla agenter: Gulnux systemkontext plus användarens minne
mkdir -p "$state"
kontext="$state/AGENTS.md"
{
  cat /etc/gulnux/AGENTS.md
  if [ -f "$repo/minne/MINNE.md" ]; then
    printf "\n---\n\n# Användarens minne\n\nFrån \`%s\`. Läs de enskilda minnesfilerna när de är relevanta.\n\n" "$repo/minne"
    cat "$repo/minne/MINNE.md"
  fi
} > "$kontext"

# Länka en Gulnux-fil till agentens konfiguration, utan att skriva över användarens egna filer
link_file() {
  mkdir -p "$(dirname "$2")"
  if [ ! -e "$2" ] || [ -L "$2" ]; then
    ln -sfn "$1" "$2"
  fi
}
link_file "$kontext" "$HOME/.claude/CLAUDE.md"
link_file "$kontext" "$HOME/.codex/AGENTS.md"

# Registrera en MCP-server hos Claude Code och Codex om den inte redan finns
#   register_mcp <namn> <kommando> [argument...]
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

# Webbläsaren Glome
if command -v glome-mcp >/dev/null; then
  register_mcp glome glome-mcp
  link_file /etc/gulnux/commands/glome.md "$HOME/.claude/commands/glome.md"
  link_file /etc/gulnux/commands/glome.md "$HOME/.codex/prompts/glome.md"
fi

# Kontorssviten Gloffice
if command -v gloffice >/dev/null; then
  register_mcp gloffice gloffice mcp
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
