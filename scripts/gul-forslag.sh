# gul forslag – granska Gulnux förslag på förbättringar
#
#   gul forslag                         lista förslag som väntar
#   gul forslag visa [namn]             visa beskrivning och ändringar
#   gul forslag godkann [namn]          ta in förslaget och aktivera det
#   gul forslag avboj [namn] [varför]   avböj – Gulnux kommer ihåg det och föreslår det inte igen
#
# Utan namn gäller det senaste förslaget. Vill du bara ha en del av ett förslag:
# be agenten i gul ta in just den delen.

repo="${GULNUX_PERSONLIG:-$HOME/gulnux-personlig}"
cd "$repo" || exit 1

vantande() {
  git for-each-ref --format='%(refname:short)' 'refs/heads/forslag/' | while read -r gren; do
    git merge-base --is-ancestor "$gren" main || echo "${gren#forslag/}"
  done
}

valj() {
  local namn="${1:-}"
  [ -n "$namn" ] || namn=$(vantande | tail -n 1)
  if [ -z "$namn" ] || ! git rev-parse -q --verify "refs/heads/forslag/$namn" >/dev/null; then
    echo "Hittade inget förslag${1:+ som heter $1}. Lista med: gul forslag" >&2
    exit 1
  fi
  echo "$namn"
}

beskrivning() { git show "forslag/$1:forslag/$1.md" 2>/dev/null || true; }

case "${1:-lista}" in
  lista)
    mapfile -t lista < <(vantande)
    if [ ${#lista[@]} -eq 0 ]; then
      echo "Inga förslag väntar."
      exit 0
    fi
    for namn in "${lista[@]}"; do
      echo "● $namn"
      beskrivning "$namn" | grep '^## ' | sed 's/^## /    /' || true
    done
    echo
    echo "Visa:     gul forslag visa <namn>"
    echo "Godkänn:  gul forslag godkann <namn>"
    echo "Avböj:    gul forslag avboj <namn> \"varför\""
    ;;
  visa)
    namn=$(valj "${2:-}")
    beskrivning "$namn"
    echo
    git --no-pager diff --stat "main...forslag/$namn" -- . ':!forslag'
    git --no-pager diff "main...forslag/$namn" -- . ':!forslag'
    ;;
  godkann)
    namn=$(valj "${2:-}")
    if [ "$(git branch --show-current)" != main ]; then
      echo "Byt till main-grenen i $repo först." >&2
      exit 1
    fi
    git merge -q --no-edit -m "Godkänt förslag $namn" "forslag/$namn"
    gulnux-home
    if git diff --name-only HEAD^1 HEAD | grep -q '^hosts/'; then
      echo "Förslaget ändrar systemet – bygger om (kräver ditt lösenord):"
      gulnux-rebuild
    fi
    git branch -q -d "forslag/$namn"
    git push -q origin main 2>/dev/null || true
    git push -q origin --delete "forslag/$namn" 2>/dev/null || true
    echo "Förslag $namn är aktiverat."
    echo "Ångra med: git -C $repo revert -m 1 HEAD && gulnux-home"
    ;;
  avboj)
    namn=$(valj "${2:-}")
    varfor="${3:-ingen anledning angiven}"
    rubriker=$(beskrivning "$namn" | grep '^## ' | sed 's/^## //' | paste -sd ';' - || true)
    fil=minne/avbojda-forslag.md
    if [ ! -f "$fil" ]; then
      printf '# Avböjda förslag\n\nGulnux ska inte föreslå de här sakerna igen.\n\n' > "$fil"
      printf -- '- [Avböjda förslag](avbojda-forslag.md) — sådant Gulnux inte ska föreslå igen\n' >> minne/MINNE.md
    fi
    printf -- '- %s: %s – %s\n' "$namn" "${rubriker:-$namn}" "$varfor" >> "$fil"
    git add minne
    git commit -q -m "Avböjt förslag $namn"
    git branch -q -D "forslag/$namn"
    git push -q origin main 2>/dev/null || true
    git push -q origin --delete "forslag/$namn" 2>/dev/null || true
    echo "Avböjt. Gulnux kommer ihåg det."
    ;;
  *)
    echo "gul forslag: välj lista, visa, godkann eller avboj" >&2
    exit 1
    ;;
esac
