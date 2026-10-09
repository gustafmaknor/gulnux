# gul-observe – logs which programs are opened (started by Sway). Local only.

state="${XDG_STATE_HOME:-$HOME/.local/state}/gulnux"
conf="${XDG_CONFIG_HOME:-$HOME/.config}/gulnux"
mkdir -p "$state"

swaymsg -t subscribe -m '["window"]' \
  | jq --unbuffered -c 'select(.change == "new") | {
      time: (now | strflocaltime("%Y-%m-%dT%H:%M:%S")),
      type: "program",
      program: (.container.app_id // .container.window_properties.class // "unknown")
    }' \
  | while read -r line; do
      if [ ! -e "$state/paused" ] && [ ! -e "$conf/learning-off" ]; then
        printf '%s\n' "$line" >> "$state/events.jsonl"
      fi
    done
