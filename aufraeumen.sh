#!/bin/sh
# Findet Dateien, die es in dieser Version nicht mehr gibt.
#
# Warum es das braucht: Wer die Dateien per Kopie auf den Server bringt (statt
# per git pull), bekommt neue und geaenderte Dateien - aber geloeschte bleiben
# liegen. Der Dashboard-Build bricht dann ab, weil eine alte Seite Funktionen
# importiert, die es nicht mehr gibt.
#
# Aufruf im Projektordner:
#   sh aufraeumen.sh              nur anzeigen
#   sh aufraeumen.sh --loeschen   wirklich entfernen

set -eu

# Dateien und Ordner, die in frueheren Versionen existierten und heute weg sind.
# Beim Entfernen einer Datei im Projekt hier eine Zeile ergaenzen.
#
# Kein Leerzeichen in den Pfaden - die Schleife unten trennt daran.
ALTLASTEN="
dashboard/src/app/guild/[guildId]/regeln
dashboard/src/components/Rules.js
plugins/regeln.js
api/src/routes/rules.js
api/test/rules.test.js
"

if [ ! -f docker-compose.yml ]; then
  echo "Bitte im Projektordner ausfuehren - dort, wo die docker-compose.yml liegt."
  exit 1
fi

loeschen=0
[ "${1:-}" = "--loeschen" ] && loeschen=1

gefunden=0

melde() {
  gefunden=$((gefunden + 1))
  if [ "$loeschen" -eq 1 ]; then
    rm -rf "$1"
    echo "  entfernt:  $1${2:-}"
  else
    echo "  Altlast:   $1${2:-}"
  fi
}

for pfad in $ALTLASTEN; do
  [ -e "$pfad" ] || continue
  melde "$pfad"
done

# Der Build-Zwischenspeicher von Next.js gehoert nie auf den Server: Er ist
# plattformabhaengig, und ein unter Windows erzeugter laesst den Build unter
# Linux mit "Restore failures" abbrechen.
for cache in dashboard/.next dashboard/.next-* dashboard/.turbo; do
  [ -e "$cache" ] || continue
  melde "$cache" "  (Build-Zwischenspeicher)"
done

echo ""
if [ "$gefunden" -eq 0 ]; then
  echo "Nichts aufzuraeumen - alles sauber."
elif [ "$loeschen" -eq 1 ]; then
  echo "$gefunden Eintrag/Eintraege entfernt. Jetzt bauen:"
  echo "  docker compose up -d --build"
else
  echo "$gefunden Eintrag/Eintraege gefunden. Zum Entfernen:"
  echo "  sh aufraeumen.sh --loeschen"
fi
