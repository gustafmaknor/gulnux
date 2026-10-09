# gul reflect – Gulnux reviews how you have used the computer and proposes improvements.
#
# The agent works in its own git branch (proposals/<date>) in your personal repo and never
# changes anything directly. Review the proposals with `gul proposals`. Runs every week.

repo="${GULNUX_PERSONAL:-$HOME/gulnux-personal}"
state="${XDG_STATE_HOME:-$HOME/.local/state}/gulnux"
conf="${XDG_CONFIG_HOME:-$HOME/.config}/gulnux"

if [ -e "$state/paused" ] || [ -e "$conf/learning-off" ]; then
  echo "Learning is turned off (gul learning) – no reflection."
  exit 0
fi
if [ ! -d "$repo/.git" ]; then
  echo "No personal repo – run 'gul setup' first." >&2
  exit 1
fi

if [ -f "$conf/agent" ]; then
  agent="$(cat "$conf/agent")"
else
  agent="${GULNUX_AGENT:-$(cat /etc/gulnux/default-agent)}"
fi

mkdir -p "$state"
gul-log prune
gul-log 7 > "$state/summary.md"

date=$(date +%F)
name="$date"
n=2
while git -C "$repo" rev-parse -q --verify "refs/heads/proposals/$name" >/dev/null; do
  name="$date-$n"
  n=$((n + 1))
done
branch="proposals/$name"

# The agent gets its own working copy of the repo so that whatever you have open is not affected
work="$state/reflection"
git -C "$repo" worktree remove --force "$work" 2>/dev/null || true
rm -rf "$work"
git -C "$repo" worktree prune
git -C "$repo" worktree add -q -b "$branch" "$work" main
cleanup() { git -C "$repo" worktree remove --force "$work" 2>/dev/null || true; }
trap cleanup EXIT

prompt=$(sed \
  -e "s|@SAMMANFATTNING@|$state/summary.md|g" \
  -e "s|@LOGG@|$state/events.jsonl|g" \
  -e "s|@DATUM@|$date|g" \
  -e "s|@FIL@|proposals/$name.md|g" \
  "$GULNUX_PROMPTER/reflect.md")

echo "Gulnux is reflecting with $agent in the branch $branch …"
case "$agent" in
  claude)
    dirs=()
    for d in "$state" "$HOME/.claude/projects" "$HOME/.codex/sessions"; do
      [ -d "$d" ] && dirs+=(--add-dir "$d")
    done
    (cd "$work" && claude -p "$prompt" --permission-mode acceptEdits "${dirs[@]}")
    ;;
  codex)
    codex exec --full-auto -C "$work" "$prompt"
    ;;
  *)
    echo "Reflection only works with claude or codex so far (chosen agent: $agent)." >&2
    git -C "$repo" branch -q -D "$branch"
    exit 1
    ;;
esac

git -C "$work" add -A
if git -C "$work" diff --cached --quiet; then
  echo "Gulnux found nothing to propose this time."
  cleanup
  git -C "$repo" branch -q -D "$branch"
  exit 0
fi

# Check that the proposal builds before the user sees it (path: includes changes that
# are not committed yet)
check="Bygger utan fel."
if ! nix build "path:$work#homeConfigurations.$USER.activationPackage" --no-link >"$state/build-log.txt" 2>&1; then
  check="Hemkonfigurationen bygger INTE – se $state/build-log.txt."
elif git -C "$work" diff --cached --name-only | grep -q '^hosts/' \
  && ! nix build "path:$work#nixosConfigurations.$(hostname).config.system.build.toplevel" --no-link >>"$state/build-log.txt" 2>&1; then
  check="Systemkonfigurationen bygger INTE – se $state/build-log.txt."
fi

description="$work/proposals/$name.md"
mkdir -p "$(dirname "$description")"
[ -f "$description" ] || printf '# Förslag %s\n\n(Agenten skrev ingen beskrivning – se ändringarna med gul proposals show.)\n' "$date" > "$description"
printf '\n---\n\n**Kontroll:** %s\n' "$check" >> "$description"

git -C "$work" add -A
git -C "$work" commit -q -m "Proposals from Gulnux $date"
git -C "$repo" push -q origin "$branch" 2>/dev/null || true

count=$(grep -c '^## ' "$description" || true)
echo "Done: $count proposals in $branch. Review them with 'gul proposals'."
notify-send -a Gulnux "Gulnux has $count new proposals" "Review them with: gul proposals" 2>/dev/null || true
