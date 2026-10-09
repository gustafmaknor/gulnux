# gul-agent-status – the agent's status in the panel (waybar)
#
#   gul-agent-status                        print the status as JSON for waybar
#   gul-agent-status working|idle|attention set by the agents' hooks
#   gul-agent-status tool                   set from a Claude Code PreToolUse hook (JSON on stdin)

state="${XDG_STATE_HOME:-$HOME/.local/state}/gulnux"
conf="${XDG_CONFIG_HOME:-$HOME/.config}/gulnux"
file="$state/agent.json"

agent_name() {
  if [ -f "$conf/agent" ]; then cat "$conf/agent"; else echo "${GULNUX_AGENT:-claude}"; fi
}

save() {
  mkdir -p "$state"
  jq -nc --arg state "$1" --arg text "$2" '{state: $state, text: $text, time: now}' > "$file.tmp"
  mv "$file.tmp" "$file"
}

# What the agent is doing right now, from the tool it is about to use
describe_tool() {
  local input name target
  input=$(cat)
  name=$(jq -r '.tool_name // ""' <<< "$input")
  target=$(jq -r '.tool_input.file_path // .tool_input.path // .tool_input.notebook_path // ""' <<< "$input")
  target=${target##*/}
  case "$name" in
    mcp__gloffice__*) echo "arbetar i Gloffice" ;;
    mcp__glome__*) echo "använder Glome" ;;
    mcp__gulsearch__*) echo "söker i dina dokument" ;;
    Edit|Write|MultiEdit|NotebookEdit) echo "redigerar ${target:-en fil}" ;;
    Read) echo "läser ${target:-en fil}" ;;
    Glob|Grep) echo "letar i filer" ;;
    Bash) echo "kör ett kommando" ;;
    WebSearch|WebFetch) echo "söker på webben" ;;
    Task|Agent) echo "delar upp arbetet" ;;
    *) echo "arbetar" ;;
  esac
}

case "${1:-show}" in
  working) save working "arbetar" ;;
  idle) save idle "väntar på dig" ;;
  attention)
    save attention "behöver dig"
    notify-send -a Gulnux "$(agent_name) behöver dig" "Hoppa till agenten med Super+a" 2>/dev/null || true
    ;;
  tool) save working "$(describe_tool)" ;;
  show)
    name=$(agent_name)
    if ! tmux has-session -t gul 2>/dev/null; then
      jq -nc --arg n "$name" '{text: "\($n) är inte igång", class: "off", tooltip: "Starta med Super+Shift+a"}'
      exit 0
    fi
    if [ ! -s "$file" ]; then
      jq -nc --arg n "$name" '{text: $n, class: "idle", tooltip: "Agenten är redo"}'
      exit 0
    fi
    # A working status that hasn't been updated for 10 minutes was probably interrupted
    jq -c --arg n "$name" '
      (if .state == "working" and (now - .time) > 600 then {state: "idle", text: "väntar på dig"} else . end) as $s
      | {text: "\($n)  \($s.text)", class: $s.state, tooltip: "Klicka för att hoppa till agenten"}
    ' "$file" 2>/dev/null || jq -nc --arg n "$name" '{text: $n, class: "idle"}'
    ;;
  *)
    echo "gul-agent-status: choose working, idle, attention, tool or nothing" >&2
    exit 1
    ;;
esac
