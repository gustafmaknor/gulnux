# gul save – commit and push the changes in your personal repo
#
#   gul save            commit everything and push; your agent writes the commit message
#   gul save status     print the repo's status as JSON for the panel (waybar)

repo="${GULNUX_PERSONAL:-$HOME/gulnux-personal}"
conf="${XDG_CONFIG_HOME:-$HOME/.config}/gulnux"
state="${XDG_STATE_HOME:-$HOME/.local/state}/gulnux"
lock="$state/save.lock"

# Changed files (porcelain) and commits that have not been pushed yet
changes() { git -C "$repo" status --porcelain --untracked-files=all 2>/dev/null; }
unpushed() { git -C "$repo" rev-list --count '@{upstream}..HEAD' 2>/dev/null || echo 0; }

status() {
  if [ ! -d "$repo/.git" ]; then echo '{"text": ""}'; return; fi
  if [ -e "$lock" ]; then
    jq -nc '{text: " 󰆓 … ", class: "saving", tooltip: "Sparar dina ändringar…"}'
    return
  fi
  local files ahead
  files=$(changes | cut -c4-)
  ahead=$(unpushed)
  if [ -z "$files" ] && [ "$ahead" = 0 ]; then echo '{"text": ""}'; return; fi
  jq -nc --arg files "$files" --argjson ahead "$ahead" '
    ($files | split("\n") | map(select(. != ""))) as $f
    | {text: " 󰆓 \(if ($f | length) > 0 then ($f | length) else $ahead end) ",
       class: (if ($f | length) > 0 then "dirty" else "ahead" end),
       tooltip: ((if ($f | length) > 0 then "Ändringar som inte är sparade i ditt repo:\n" + ($f[:15] | map("  " + .) | join("\n"))
                    + (if ($f | length) > 15 then "\n  … och \(($f | length) - 15) till" else "" end)
                  else "\($ahead) commit som inte är pushad" end)
                 + "\n\nKlicka för att committa och pusha")}'
}

# A short commit message in Swedish from the user's agent, or empty
agent_message() {
  local agent prompt
  if [ -f "$conf/agent" ]; then agent=$(cat "$conf/agent"); else agent="${GULNUX_AGENT:-$(cat /etc/gulnux/default-agent 2>/dev/null || echo claude)}"; fi
  prompt="Skriv ett commit-meddelande på svenska för ändringarna nedan i användarens personliga Gulnux-repo.
En rad, högst 72 tecken, som beskriver vad som ändrats (inte vilka filer). Svara bara med raden.

$(git -C "$repo" diff --cached --stat)

$(git -C "$repo" diff --cached | head -c 20000)"
  local msg
  msg=$(case "$agent" in
    claude) timeout 90 claude -p "$prompt" --model haiku 2>/dev/null ;;
    codex) timeout 90 codex exec "$prompt" 2>/dev/null | tail -n 1 ;;
  esac | head -n 1 | cut -c1-100)
  msg=${msg//\`/}
  msg=${msg#\"}
  echo "${msg%\"}"
}

save() {
  if [ ! -d "$repo/.git" ]; then echo "gul save: no personal repo at $repo – run 'gul setup' first." >&2; return 1; fi
  mkdir -p "$state"
  if [ -e "$lock" ]; then echo "gul save: already saving." >&2; return 1; fi
  touch "$lock"
  trap 'rm -f "$lock"' EXIT

  local n msg
  if [ -n "$(changes)" ]; then
    git -C "$repo" add -A
    n=$(git -C "$repo" diff --cached --name-only | wc -l)
    msg=$(agent_message || true)
    if [ -z "$msg" ]; then
      msg="Spara ändringar i $(git -C "$repo" diff --cached --name-only | head -n 3 | paste -sd ',' | sed 's/,/, /g')"
      [ "$n" -gt 3 ] && msg="$msg och $((n - 3)) till"
    fi
    if ! git -C "$repo" commit -q -m "$msg"; then
      echo "gul save: the commit failed – see the message above." >&2
      notify-send -a Gulnux -u critical "Kunde inte committa ditt repo" "Kör gul save i en terminal för att se felet" 2>/dev/null || true
      return 1
    fi
    echo "Committed: $msg"
  fi
  if [ "$(unpushed)" != 0 ]; then
    if git -C "$repo" push -q 2>/dev/null; then
      echo "Pushed to GitHub."
      notify-send -a Gulnux "Ditt repo är sparat" "${msg:-Opushade ändringar är nu pushade}" 2>/dev/null || true
    else
      echo "gul save: committed, but the push failed – try 'git -C $repo push'." >&2
      notify-send -a Gulnux -u critical "Kunde inte pusha ditt repo" "Ändringarna är committade men inte pushade. Kör: git -C $repo push" 2>/dev/null || true
      return 1
    fi
  else
    echo "Nothing to save."
  fi
}

case "${1:-}" in
  status) status ;;
  "") save ;;
  *) echo "gul save: choose nothing or status" >&2; exit 1 ;;
esac
