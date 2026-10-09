# gul learning – control Gulnux observation and reflection
#
#   gul learning           show status
#   gul learning off       pause: nothing is logged and no reflection runs
#   gul learning on        resume

state="${XDG_STATE_HOME:-$HOME/.local/state}/gulnux"
conf="${XDG_CONFIG_HOME:-$HOME/.config}/gulnux"

case "${1:-status}" in
  off)
    mkdir -p "$state"
    touch "$state/paused"
    echo "Learning is paused. Nothing is logged and no reflection runs."
    ;;
  on)
    rm -f "$state/paused"
    if [ -e "$conf/learning-off" ]; then
      echo "The pause is lifted, but observation is turned off in home.nix (gulnux.learning.observe)."
    else
      echo "Learning is on."
    fi
    ;;
  status)
    if [ -e "$state/paused" ]; then
      echo "Learning: paused (gul learning on)"
    elif [ -e "$conf/learning-off" ]; then
      echo "Learning: observation turned off in home.nix"
    else
      echo "Learning: on"
    fi
    count=0
    [ -f "$state/events.jsonl" ] && count=$(wc -l < "$state/events.jsonl")
    echo "Log: $state/events.jsonl ($count events, kept for 30 days)"
    next=$(systemctl --user show gulnux-reflect.timer -p NextElapseUSecRealtime --value 2>/dev/null || true)
    echo "Next reflection: ${next:-none scheduled}"
    ;;
  *)
    echo "gul learning: choose on, off or status" >&2
    exit 1
    ;;
esac
