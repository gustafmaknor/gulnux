# Gulnux observation: loggar kommandots namn och slutstatus lokalt, aldrig argument.
# Pausas med `gul learning off`, stängs av med gulnux.learning.observe = false i home.nix.
__gulnux_logg="${XDG_STATE_HOME:-$HOME/.local/state}/gulnux"
__gulnux_senaste=$(HISTTIMEFORMAT='' history 1 | awk '{print $1}')

__gulnux_observera() {
  local status=$? nummer kommando tid
  read -r nummer kommando <<< "$(HISTTIMEFORMAT='' history 1)"
  # Samma historiknummer betyder att inget nytt kommando körts (t.ex. bara Enter)
  [ "$nummer" != "$__gulnux_senaste" ] || return 0
  __gulnux_senaste=$nummer
  [ ! -e "$__gulnux_logg/paused" ] || return 0
  # Bara själva programnamnet: utan miljövariabler före (FOO=1 ls), sökväg eller argument
  while [[ "$kommando" =~ ^[A-Za-z_][A-Za-z0-9_]*=[^[:space:]]*[[:space:]]+(.*)$ ]]; do
    kommando=${BASH_REMATCH[1]}
  done
  kommando=${kommando%% *}
  kommando=${kommando##*/}
  kommando=${kommando//[^A-Za-z0-9._+-]/}
  [ -n "$kommando" ] || return 0
  mkdir -p "$__gulnux_logg"
  printf -v tid '%(%Y-%m-%dT%H:%M:%S)T' -1
  printf '{"time":"%s","type":"command","command":"%s","status":%d}\n' \
    "$tid" "$kommando" "$status" >> "$__gulnux_logg/events.jsonl"
}
PROMPT_COMMAND="__gulnux_observera${PROMPT_COMMAND:+;$PROMPT_COMMAND}"
