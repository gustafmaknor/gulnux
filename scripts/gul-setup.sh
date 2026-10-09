# gul setup – kopplar Gulnux till ditt GitHub-konto och ditt personliga repo
#
# Finns repot <ditt-konto>/gulnux-personlig redan hämtas det, så att dina inställningar,
# ditt minne och dina maskiner följer med till den här datorn. Annars skapas det (privat).
#
#   gul setup
#   gul setup --katalog DIR --anvandarnamn NAMN    (används av installationsprogrammet)

katalog="${GULNUX_PERSONLIG:-$HOME/gulnux-personlig}"
anvandarnamn="${USER:-}"
installation=false
namn="" epost="" agent=""
while [ $# -gt 0 ]; do
  case "$1" in
    --katalog) katalog="$2"; shift 2 ;;
    --anvandarnamn) anvandarnamn="$2"; shift 2 ;;
    --installation) installation=true; shift ;;
    *) echo "gul setup: okänt argument '$1'" >&2; exit 1 ;;
  esac
done

# fraga <variabel> <fråga> <förslag>
fraga() {
  local svar
  read -r -p "$2${3:+ [$3]}: " svar
  printf -v "$1" '%s' "${svar:-$3}"
}

# Värden hamnar i installningar.nix och får inte bryta Nix-syntaxen
kontrollera() {
  case "$1" in
    *'"'* | *\\* | *'$'*) echo "Tecknen \" \\ och \$ kan inte användas: $1" >&2; return 1 ;;
  esac
}

if [ -d "$katalog/.git" ]; then
  echo "Ditt personliga repo finns redan i $katalog."
else
  echo "== GitHub"
  if ! gh auth status >/dev/null 2>&1; then
    echo "Logga in på GitHub. Du får en kod att skriva in på github.com/login/device"
    echo "(det går bra att göra det på mobilen)."
    gh auth login --hostname github.com --git-protocol https --web
  fi
  login=$(gh api user -q .login)
  echo "Inloggad som $login."

  if gh repo view "$login/gulnux-personlig" >/dev/null 2>&1; then
    echo "Hämtar ditt personliga repo $login/gulnux-personlig…"
    gh repo clone "$login/gulnux-personlig" "$katalog" -- -q
  else
    echo "Skapar ditt personliga repo $login/gulnux-personlig (privat)…"
    while :; do
      fraga anvandarnamn "Användarnamn på datorn (små bokstäver)" "$anvandarnamn"
      [[ "$anvandarnamn" =~ ^[a-z_][a-z0-9_-]*$ ]] && [ "$anvandarnamn" != root ] && break
      echo "Använd små bokstäver, siffror, - och _."
    done
    namn_forslag=$(gh api user -q '.name // empty')
    while :; do fraga namn "Ditt namn" "$namn_forslag"; kontrollera "$namn" && break; done
    epost_forslag=$(gh api user -q '.email // empty')
    while :; do fraga epost "E-post för git" "${epost_forslag:-$login@users.noreply.github.com}"; kontrollera "$epost" && break; done
    while :; do
      fraga agent "Kodagent (claude, codex eller vibe)" "claude"
      case "$agent" in claude|codex|vibe) break ;; esac
    done

    mkdir -p "$katalog"
    cp -r "$GULNUX_MALL"/. "$katalog"/
    chmod -R u+w "$katalog"
    sed -i \
      -e "s|@ANVANDARNAMN@|$anvandarnamn|" \
      -e "s|@NAMN@|$namn|" \
      -e "s|@EPOST@|$epost|" \
      -e "s|@GITHUB@|$login|" \
      -e "s|@AGENT@|$agent|" \
      "$katalog/installningar.nix"
    git -C "$katalog" init -q -b main
    git -C "$katalog" add -A
    git -C "$katalog" -c user.name="$namn" -c user.email="$epost" commit -q -m "Mitt personliga Gulnux"
    gh repo create gulnux-personlig --private --source "$katalog" --push \
      --description "Mina personliga Gulnux-inställningar"
  fi
fi

git -C "$katalog" config credential.https://github.com.helper '!gh auth git-credential'

if ! $installation; then
  echo "== Aktiverar dina inställningar"
  gulnux-home
  echo "Klart! Starta din agent med: gul"
fi
