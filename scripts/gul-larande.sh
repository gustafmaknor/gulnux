# gul larande – styr Gulnux observation och reflektion
#
#   gul larande            visa status
#   gul larande av         pausa: inget loggas och ingen reflektion körs
#   gul larande pa         slå på igen

state="${XDG_STATE_HOME:-$HOME/.local/state}/gulnux"
conf="${XDG_CONFIG_HOME:-$HOME/.config}/gulnux"

case "${1:-status}" in
  av)
    mkdir -p "$state"
    touch "$state/av"
    echo "Lärandet är pausat. Inget loggas och ingen reflektion körs."
    ;;
  pa)
    rm -f "$state/av"
    if [ -e "$conf/larande-av" ]; then
      echo "Pausen är borttagen, men observation är avstängd i home.nix (gulnux.larande.observera)."
    else
      echo "Lärandet är på."
    fi
    ;;
  status)
    if [ -e "$state/av" ]; then
      echo "Lärande: pausat (gul larande pa)"
    elif [ -e "$conf/larande-av" ]; then
      echo "Lärande: observation avstängd i home.nix"
    else
      echo "Lärande: på"
    fi
    antal=0
    [ -f "$state/handelser.jsonl" ] && antal=$(wc -l < "$state/handelser.jsonl")
    echo "Logg: $state/handelser.jsonl ($antal händelser, sparas i 30 dagar)"
    nasta=$(systemctl --user show gulnux-reflektera.timer -p NextElapseUSecRealtime --value 2>/dev/null || true)
    echo "Nästa reflektion: ${nasta:-ingen schemalagd}"
    ;;
  *)
    echo "gul larande: välj av, pa eller status" >&2
    exit 1
    ;;
esac
