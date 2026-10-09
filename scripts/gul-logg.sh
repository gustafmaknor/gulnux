# gul logg – vad Gulnux har observerat. Loggen ligger bara lokalt och lämnar aldrig datorn.
#
#   gul logg [dagar]       sammanfatta senaste veckan (eller antal dagar)
#   gul logg rensa         ta bort händelser äldre än 30 dagar
#   gul logg radera        ta bort hela loggen
#   gul logg sokvag        skriv ut var loggen ligger

logg="${XDG_STATE_HOME:-$HOME/.local/state}/gulnux/handelser.jsonl"

sammanfatta() {
  local dagar="$1" fran
  if [ ! -s "$logg" ]; then
    echo "Gulnux har inte observerat något än."
    return
  fi
  fran=$(date -d "$dagar days ago" +%FT%T)
  # Råa rader läses en och en så att en trasig rad inte stoppar sammanfattningen
  jq -Rrs --arg fran "$fran" --arg dagar "$dagar" '
    split("\n") | map(fromjson? // empty | select(.tid >= $fran)) as $e
    | ($e | map(select(.typ == "program")) | group_by(.program)
          | map({namn: .[0].program, n: length}) | sort_by(-.n)) as $program
    | ($e | map(select(.typ == "kommando")) | group_by(.kommando)
          | map({namn: .[0].kommando, n: length, fel: (map(select(.status != 0)) | length)})
          | sort_by(-.n)) as $kommandon
    | ($e | map(.tid[11:13]) | group_by(.) | map({h: .[0], n: length})) as $timmar
    | "# Gulnux observationer, senaste \($dagar) dagarna (\($e | length) händelser)",
      "",
      "## Program som öppnats",
      ($program[:15][] | "- \(.namn): \(.n)"),
      "",
      "## Kommandon i terminalen",
      ($kommandon[:25][] | "- \(.namn): \(.n) gånger" + (if .fel > 0 then ", \(.fel) misslyckade" else "" end)),
      "",
      "## Aktivitet per timme",
      ($timmar[] | "- kl \(.h): \(.n)")
  ' "$logg"
}

case "${1:-7}" in
  rensa)
    [ -f "$logg" ] || exit 0
    fran=$(date -d '30 days ago' +%FT%T)
    jq -Rc --arg fran "$fran" 'fromjson? // empty | select(.tid >= $fran)' "$logg" > "$logg.tmp"
    mv "$logg.tmp" "$logg"
    ;;
  radera)
    rm -f "$logg"
    echo "Loggen är raderad."
    ;;
  sokvag) echo "$logg" ;;
  sammanfatta) sammanfatta "${2:-7}" ;;
  *[!0-9]*)
    echo "gul logg: okänt kommando '$1'" >&2
    exit 1
    ;;
  *) sammanfatta "${1:-7}" ;;
esac
