# gul reflektera – Gulnux går igenom hur du använt datorn och föreslår förbättringar.
#
# Agenten arbetar i en egen git-gren (forslag/<datum>) i ditt personliga repo och ändrar
# aldrig något direkt. Förslagen granskas med `gul forslag`. Körs automatiskt varje vecka.

repo="${GULNUX_PERSONLIG:-$HOME/gulnux-personlig}"
state="${XDG_STATE_HOME:-$HOME/.local/state}/gulnux"
conf="${XDG_CONFIG_HOME:-$HOME/.config}/gulnux"

if [ -e "$state/av" ] || [ -e "$conf/larande-av" ]; then
  echo "Lärandet är avstängt (gul larande) – ingen reflektion."
  exit 0
fi
if [ ! -d "$repo/.git" ]; then
  echo "Inget personligt repo – kör 'gul setup' först." >&2
  exit 1
fi

if [ -f "$conf/agent" ]; then
  agent="$(cat "$conf/agent")"
else
  agent="${GULNUX_AGENT:-$(cat /etc/gulnux/default-agent)}"
fi

mkdir -p "$state"
gul-logg rensa
gul-logg 7 > "$state/sammanfattning.md"

datum=$(date +%F)
namn="$datum"
n=2
while git -C "$repo" rev-parse -q --verify "refs/heads/forslag/$namn" >/dev/null; do
  namn="$datum-$n"
  n=$((n + 1))
done
gren="forslag/$namn"

# Agenten får en egen arbetskopia av repot, så att det du har öppet inte påverkas
arbete="$state/reflektion"
git -C "$repo" worktree remove --force "$arbete" 2>/dev/null || true
rm -rf "$arbete"
git -C "$repo" worktree prune
git -C "$repo" worktree add -q -b "$gren" "$arbete" main
stada() { git -C "$repo" worktree remove --force "$arbete" 2>/dev/null || true; }
trap stada EXIT

prompt=$(sed \
  -e "s|@SAMMANFATTNING@|$state/sammanfattning.md|g" \
  -e "s|@LOGG@|$state/handelser.jsonl|g" \
  -e "s|@DATUM@|$datum|g" \
  -e "s|@FIL@|forslag/$namn.md|g" \
  "$GULNUX_PROMPTER/reflektera.md")

echo "Gulnux reflekterar med $agent i grenen $gren …"
case "$agent" in
  claude)
    kataloger=()
    for d in "$state" "$HOME/.claude/projects" "$HOME/.codex/sessions"; do
      [ -d "$d" ] && kataloger+=(--add-dir "$d")
    done
    (cd "$arbete" && claude -p "$prompt" --permission-mode acceptEdits "${kataloger[@]}")
    ;;
  codex)
    codex exec --full-auto -C "$arbete" "$prompt"
    ;;
  *)
    echo "Reflektion fungerar med claude eller codex än så länge (vald agent: $agent)." >&2
    git -C "$repo" branch -q -D "$gren"
    exit 1
    ;;
esac

git -C "$arbete" add -A
if git -C "$arbete" diff --cached --quiet; then
  echo "Gulnux hittade inget att föreslå den här gången."
  stada
  git -C "$repo" branch -q -D "$gren"
  exit 0
fi

# Kontrollera att förslaget går att bygga innan användaren ser det (path: tar med
# ändringar som inte är committade än)
kontroll="Bygger utan fel."
if ! nix build "path:$arbete#homeConfigurations.$USER.activationPackage" --no-link >"$state/bygglogg.txt" 2>&1; then
  kontroll="Hemkonfigurationen bygger INTE – se $state/bygglogg.txt."
elif git -C "$arbete" diff --cached --name-only | grep -q '^hosts/' \
  && ! nix build "path:$arbete#nixosConfigurations.$(hostname).config.system.build.toplevel" --no-link >>"$state/bygglogg.txt" 2>&1; then
  kontroll="Systemkonfigurationen bygger INTE – se $state/bygglogg.txt."
fi

beskrivning="$arbete/forslag/$namn.md"
mkdir -p "$(dirname "$beskrivning")"
[ -f "$beskrivning" ] || printf '# Förslag %s\n\n(Agenten skrev ingen beskrivning – se ändringarna med gul forslag visa.)\n' "$datum" > "$beskrivning"
printf '\n---\n\n**Kontroll:** %s\n' "$kontroll" >> "$beskrivning"

git -C "$arbete" add -A
git -C "$arbete" commit -q -m "Förslag från Gulnux $datum"
git -C "$repo" push -q origin "$gren" 2>/dev/null || true

antal=$(grep -c '^## ' "$beskrivning" || true)
echo "Klart: $antal förslag i $gren. Granska med 'gul forslag'."
notify-send -a Gulnux "Gulnux har $antal nya förslag" "Granska dem med: gul forslag" 2>/dev/null || true
