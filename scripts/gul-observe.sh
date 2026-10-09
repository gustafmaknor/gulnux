# gul-observe – logs which programs are opened (started by Sway). Local only.

state="${XDG_STATE_HOME:-$HOME/.local/state}/gulnux"
conf="${XDG_CONFIG_HOME:-$HOME/.config}/gulnux"
mkdir -p "$state"

swaymsg -t subscribe -m '["window"]' \
  | jq --unbuffered -c 'select(.change == "new") | {
      tid: (now | strflocaltime("%Y-%m-%dT%H:%M:%S")),
      typ: "program",
      program: (.container.app_id // .container.window_properties.class // "unknown")
    }' \
  | while read -r line; do
      if [ ! -e "$state/av" ] && [ ! -e "$conf/larande-av" ]; then
        printf '%s\n' "$line" >> "$state/handelser.jsonl"
      fi
    done
