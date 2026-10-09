# gul proposals – review Gulnux's proposed improvements
#
#   gul proposals                         list pending proposals
#   gul proposals show [name]             show the description and the changes
#   gul proposals accept [name]           merge the proposal and activate it
#   gul proposals reject [name] [reason]  reject – Gulnux remembers and won't propose it again
#
# Without a name the latest proposal is used. If you only want part of a proposal:
# ask the agent in gul to bring in just that part.

repo="${GULNUX_PERSONAL:-$HOME/gulnux-personal}"
cd "$repo" || exit 1

pending() {
  git for-each-ref --format='%(refname:short)' 'refs/heads/proposals/' | while read -r branch; do
    git merge-base --is-ancestor "$branch" main || echo "${branch#proposals/}"
  done
}

pick() {
  local name="${1:-}"
  [ -n "$name" ] || name=$(pending | tail -n 1)
  if [ -z "$name" ] || ! git rev-parse -q --verify "refs/heads/proposals/$name" >/dev/null; then
    echo "Found no proposal${1:+ named $1}. List them with: gul proposals" >&2
    exit 1
  fi
  echo "$name"
}

description() { git show "proposals/$1:proposals/$1.md" 2>/dev/null || true; }

case "${1:-list}" in
  list)
    mapfile -t names < <(pending)
    if [ ${#names[@]} -eq 0 ]; then
      echo "No proposals are pending."
      exit 0
    fi
    for name in "${names[@]}"; do
      echo "● $name"
      description "$name" | grep '^## ' | sed 's/^## /    /' || true
    done
    echo
    echo "Show:    gul proposals show <name>"
    echo "Accept:  gul proposals accept <name>"
    echo "Reject:  gul proposals reject <name> \"reason\""
    ;;
  show)
    name=$(pick "${2:-}")
    description "$name"
    echo
    git --no-pager diff --stat "main...proposals/$name" -- . ':!proposals'
    git --no-pager diff "main...proposals/$name" -- . ':!proposals'
    ;;
  accept)
    name=$(pick "${2:-}")
    if [ "$(git branch --show-current)" != main ]; then
      echo "Switch to the main branch in $repo first." >&2
      exit 1
    fi
    git merge -q --no-ff --no-edit -m "Accept proposal $name" "proposals/$name"
    gulnux-home
    if git diff --name-only HEAD^1 HEAD | grep -q '^hosts/'; then
      echo "The proposal changes the system – rebuilding (requires your password):"
      gulnux-rebuild
    fi
    git branch -q -d "proposals/$name"
    git push -q origin main 2>/dev/null || true
    git push -q origin --delete "proposals/$name" 2>/dev/null || true
    echo "Proposal $name is active."
    echo "Undo with: git -C $repo revert -m 1 HEAD && gulnux-home"
    ;;
  reject)
    name=$(pick "${2:-}")
    reason="${3:-no reason given}"
    headings=$(description "$name" | grep '^## ' | sed 's/^## //' | paste -sd ';' - || true)
    file=memory/rejected-proposals.md
    if [ ! -f "$file" ]; then
      printf '# Avböjda förslag\n\nGulnux ska inte föreslå de här sakerna igen.\n\n' > "$file"
      printf -- '- [Avböjda förslag](rejected-proposals.md) — sådant Gulnux inte ska föreslå igen\n' >> memory/MEMORY.md
    fi
    printf -- '- %s: %s – %s\n' "$name" "${headings:-$name}" "$reason" >> "$file"
    git add memory
    git commit -q -m "Reject proposal $name"
    git branch -q -D "proposals/$name"
    git push -q origin main 2>/dev/null || true
    git push -q origin --delete "proposals/$name" 2>/dev/null || true
    echo "Rejected. Gulnux will remember."
    ;;
  *)
    echo "gul proposals: choose list, show, accept or reject" >&2
    exit 1
    ;;
esac
