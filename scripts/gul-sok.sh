# gul sok – sök i dina dokument, ditt minne och sparade webbsidor
#
#   gul sok <fråga>       sök, gärna med en hel mening
#   gul sok spara         spara sidan du har framme i Glome
#   gul sok status        vad som är indexerat och om vektorsökningen är igång
#   gul sok las <id>      visa hela texten för en träff
#   gul sok glom <id>     ta bort en träff ur indexet (filen påverkas inte)
#   gul sok indexera      leta efter nya filer nu i stället för att vänta

case "${1:-}" in
  "")
    echo "Användning: gul sok <fråga> | spara | status | las <id> | glom <id> | indexera" >&2
    exit 1
    ;;
  spara) glome-read --json | gulsok spara-sida ;;
  status|las|glom|indexera) exec gulsok "$@" ;;
  *) exec gulsok sok "$@" ;;
esac
