# gul setup – connects Gulnux to your GitHub account and your personal repo
#
# If the repo <your-account>/gulnux-personlig already exists it is cloned, so that your
# settings, your memory and your machines follow you to this computer. Otherwise it is
# created (private).
#
#   gul setup
#   gul setup --dir DIR --username NAME --install    (used by the installer)

dir="${GULNUX_PERSONLIG:-$HOME/gulnux-personlig}"
username="${USER:-}"
installing=false
fullname="" email="" agent=""
while [ $# -gt 0 ]; do
  case "$1" in
    --dir) dir="$2"; shift 2 ;;
    --username) username="$2"; shift 2 ;;
    --install) installing=true; shift ;;
    *) echo "gul setup: unknown argument '$1'" >&2; exit 1 ;;
  esac
done

# ask <variable> <question> <suggestion>
ask() {
  local answer
  read -r -p "$2${3:+ [$3]}: " answer
  printf -v "$1" '%s' "${answer:-$3}"
}

# Values end up in installningar.nix and must not break the Nix syntax
check() {
  case "$1" in
    *'"'* | *\\* | *'$'*) echo "The characters \" \\ and \$ can't be used: $1" >&2; return 1 ;;
  esac
}

if [ -d "$dir/.git" ]; then
  echo "Your personal repo already exists in $dir."
else
  echo "== GitHub"
  if ! gh auth status >/dev/null 2>&1; then
    echo "Log in to GitHub. You'll get a code to enter at github.com/login/device"
    echo "(you can do that on your phone)."
    gh auth login --hostname github.com --git-protocol https --web
  fi
  login=$(gh api user -q .login)
  echo "Logged in as $login."

  if gh repo view "$login/gulnux-personlig" >/dev/null 2>&1; then
    echo "Cloning your personal repo $login/gulnux-personlig…"
    gh repo clone "$login/gulnux-personlig" "$dir" -- -q
  else
    echo "Creating your personal repo $login/gulnux-personlig (private)…"
    while :; do
      ask username "Username on this computer (lowercase)" "$username"
      [[ "$username" =~ ^[a-z_][a-z0-9_-]*$ ]] && [ "$username" != root ] && break
      echo "Use lowercase letters, digits, - and _."
    done
    suggested_name=$(gh api user -q '.name // empty')
    while :; do ask fullname "Your name" "$suggested_name"; check "$fullname" && break; done
    suggested_email=$(gh api user -q '.email // empty')
    while :; do ask email "Email for git" "${suggested_email:-$login@users.noreply.github.com}"; check "$email" && break; done
    while :; do
      ask agent "Coding agent (claude, codex or vibe)" "claude"
      case "$agent" in claude|codex|vibe) break ;; esac
    done

    mkdir -p "$dir"
    cp -r "$GULNUX_MALL"/. "$dir"/
    chmod -R u+w "$dir"
    sed -i \
      -e "s|@ANVANDARNAMN@|$username|" \
      -e "s|@NAMN@|$fullname|" \
      -e "s|@EPOST@|$email|" \
      -e "s|@GITHUB@|$login|" \
      -e "s|@AGENT@|$agent|" \
      "$dir/installningar.nix"
    git -C "$dir" init -q -b main
    git -C "$dir" add -A
    git -C "$dir" -c user.name="$fullname" -c user.email="$email" commit -q -m "My personal Gulnux"
    gh repo create gulnux-personlig --private --source "$dir" --push \
      --description "My personal Gulnux settings"
  fi
fi

git -C "$dir" config credential.https://github.com.helper '!gh auth git-credential'

if ! $installing; then
  echo "== Activating your settings"
  gulnux-home
  echo "Done! Start your agent with: gul"
fi
