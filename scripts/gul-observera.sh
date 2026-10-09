# gul-observera – loggar vilka program som öppnas (startas av Sway). Bara lokalt.

state="${XDG_STATE_HOME:-$HOME/.local/state}/gulnux"
conf="${XDG_CONFIG_HOME:-$HOME/.config}/gulnux"
mkdir -p "$state"

swaymsg -t subscribe -m '["window"]' \
  | jq --unbuffered -c 'select(.change == "new") | {
      tid: (now | strflocaltime("%Y-%m-%dT%H:%M:%S")),
      typ: "program",
      program: (.container.app_id // .container.window_properties.class // "okänt")
    }' \
  | while read -r rad; do
      if [ ! -e "$state/av" ] && [ ! -e "$conf/larande-av" ]; then
        printf '%s\n' "$rad" >> "$state/handelser.jsonl"
      fi
    done
