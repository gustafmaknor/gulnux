# gul log – what Gulnux has observed. The log is stored locally only and never leaves the computer.
#
#   gul log [days]         summarize the last week (or number of days)
#   gul log prune          remove events older than 30 days
#   gul log delete         delete the whole log
#   gul log path           print where the log is stored

log="${XDG_STATE_HOME:-$HOME/.local/state}/gulnux/handelser.jsonl"

summarize() {
  local days="$1" since
  if [ ! -s "$log" ]; then
    echo "Gulnux hasn't observed anything yet."
    return
  fi
  since=$(date -d "$days days ago" +%FT%T)
  # Read raw lines one by one so that a broken line doesn't stop the summary
  jq -Rrs --arg since "$since" --arg days "$days" '
    split("\n") | map(fromjson? // empty | select(.tid >= $since)) as $e
    | ($e | map(select(.typ == "program")) | group_by(.program)
          | map({name: .[0].program, n: length}) | sort_by(-.n)) as $programs
    | ($e | map(select(.typ == "kommando")) | group_by(.kommando)
          | map({name: .[0].kommando, n: length, failed: (map(select(.status != 0)) | length)})
          | sort_by(-.n)) as $commands
    | ($e | map(.tid[11:13]) | group_by(.) | map({h: .[0], n: length})) as $hours
    | "# Gulnux observations, last \($days) days (\($e | length) events)",
      "",
      "## Programs opened",
      ($programs[:15][] | "- \(.name): \(.n)"),
      "",
      "## Terminal commands",
      ($commands[:25][] | "- \(.name): \(.n) times" + (if .failed > 0 then ", \(.failed) failed" else "" end)),
      "",
      "## Activity by hour",
      ($hours[] | "- \(.h):00: \(.n)")
  ' "$log"
}

case "${1:-7}" in
  prune)
    [ -f "$log" ] || exit 0
    since=$(date -d '30 days ago' +%FT%T)
    jq -Rc --arg since "$since" 'fromjson? // empty | select(.tid >= $since)' "$log" > "$log.tmp"
    mv "$log.tmp" "$log"
    ;;
  delete)
    rm -f "$log"
    echo "The log has been deleted."
    ;;
  path) echo "$log" ;;
  summary) summarize "${2:-7}" ;;
  *[!0-9]*)
    echo "gul log: unknown command '$1'" >&2
    exit 1
    ;;
  *) summarize "${1:-7}" ;;
esac
