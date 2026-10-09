# gul search – search your documents, your memory and saved web pages
#
#   gul search <query>     search, preferably with a whole sentence
#   gul search save        save the page you have open in Glome
#   gul search status      what is indexed and whether vector search is running
#   gul search read <id>   show the full text of a hit
#   gul search forget <id> remove a hit from the index (the file is not touched)
#   gul search index       look for new files now instead of waiting

case "${1:-}" in
  "")
    echo "Usage: gul search <query> | save | status | read <id> | forget <id> | index" >&2
    exit 1
    ;;
  save) glome-read --json | gulsok save-page ;;
  status|read|forget|index) exec gulsok "$@" ;;
  *) exec gulsok search "$@" ;;
esac
