# Änderungen

Aufgebaut nach [Keep a Changelog](https://keepachangelog.com/de/1.1.0/),
Versionierung nach [Semantic Versioning](https://semver.org/lang/de/).

Wie man aktualisiert, steht in [docs/aktualisieren.md](docs/aktualisieren.md).

## [Unveröffentlicht]

### Hinzugefügt

- **Twitch-Livemeldung** als mitgeliefertes Plugin: Der Bot meldet im Discord,
  wenn ein beobachteter Kanal live geht — mit Streamtitel, Spiel, Zuschauerzahl
  und Vorschaubild, wahlweise mit Rollen-Erwähnung.

  Zwei Wege, beide gleichzeitig aktiv: Ohne weitere Einrichtung fragt der Bot
  jede Minute bei Twitch nach. Mit einer Domain und HTTPS meldet Twitch sich
  selbst, und die Nachricht steht **binnen Sekunden** im Discord. Doppelte
  Meldungen sind ausgeschlossen — maßgeblich ist die Stream-ID, die Twitch je
  Sendung vergibt.

  Braucht eine kostenlose Twitch-Anwendung. Alles beschrieben in
  [docs/twitch-plugin.md](docs/twitch-plugin.md).
- Plugins können über `store.allGuilds()` alle Server abfragen, für die sie
  Daten haben — für Plugins, die regelmäßig von sich aus tätig werden.

## [1.1.0] – 2026-08-23

### Hinzugefügt

- **Plugin-System: Erweiterungen ohne Neubau.** Ein Plugin ist ein Ordner unter
  `plugins/` mit einer `plugin.json`, die seine Oberfläche beschreibt — Formulare,
  sortierbare Listen und Aktionsknöpfe. Tabellen, Endpunkte, Prüfung der Eingaben
  und der Reiter im Dashboard entstehen daraus von selbst. Ordner hineinlegen,
  `docker compose restart`, fertig. Beschrieben in
  [docs/plugin-entwickeln.md](docs/plugin-entwickeln.md).
- **Serverregeln** als mitgeliefertes Plugin: im Dashboard zusammenstellen, der
  Bot postet sie als Nachricht und hält sie aktuell. Ohne Überschriften wird
  daraus eine schlichte nummerierte Liste, mit Überschriften bekommt jede Regel
  ihren eigenen Block. Symbole, freie Sortierung, Farbe und Einleitung wählbar.
  Moderatoren zeigen sie mit `!regeln` in jedem Kanal an.
  Siehe [docs/regeln-plugin.md](docs/regeln-plugin.md).
- **Rechteprüfung im Dashboard.** Unter der Kanal-Auswahl steht, ob der Bot dort
  posten darf — und wenn nicht, welches Recht fehlt und wo man es setzt. Plugins
  geben ihren Bedarf über `requiresPermissions` an. Vorher merkte man ein
  fehlendes Recht erst daran, dass nichts passierte.
- **Rückmeldung des Bots.** Was beim letzten Durchlauf herauskam, steht im
  Dashboard: „gepostet (10 Regeln)" oder eben, woran es scheiterte.
- YouTube-Feeds lassen sich auf Knopfdruck sofort prüfen; die Oberfläche nennt
  außerdem, wann automatisch geprüft wird.
- `aufraeumen.sh` findet Dateien, die es in der neuen Version nicht mehr gibt —
  nötig für alle, die per Kopie aktualisieren statt per `git pull`.

### Geändert

- Die Reiter im Dashboard entstehen jetzt teils zur Laufzeit: die des
  Grundsystems fest, die der Plugins aus deren `plugin.json`.
- Der Plugin-Ordner liegt unter `/app/plugins` statt `/plugins`. Node sucht
  `node_modules` nur oberhalb des Modulpfads — aus einem Ordner außerhalb konnte
  ein Plugin `discord.js` nicht importieren.
- Discord-Daten für die Rechteprüfung werden nur 10 Sekunden zwischengespeichert
  statt fünf Minuten. Wer ein Recht in Discord setzt, sieht die Wirkung sofort
  statt minutenlang den alten Stand.

### Wichtig beim Aktualisieren

- Die `docker-compose.yml` hat sich geändert: Der Plugin-Ordner wird jetzt auch
  in den API-Container eingebunden. **Ohne das bleibt der Plugin-Reiter leer.**
  Beim Aktualisieren also mit übertragen.
- Wer die Dateien **von Hand kopiert** statt `git pull` zu nutzen: Kopieren
  überschreibt und ergänzt, löscht aber nichts. Reste älterer Versionen lassen
  den Dashboard-Build scheitern. Vor dem Bauen einmal:

  ```bash
  sh aufraeumen.sh --loeschen
  ```

## [1.0.0] – 2026-08-22

Erste Veröffentlichung.

### Bot

- **Automod** mit Eskalation: Wortfilter, Spam-/Flood-Schutz, Link-Whitelist.
  Verstöße werden gezählt und verfallen nach einstellbarer Frist; die Maßnahme
  steigert sich von Verwarnung über Timeout und Kick bis zum Ban
- **Willkommensnachricht und Autorole** mit Platzhaltern im Text
- **Geplante Posts**, einmalig oder wiederkehrend per Cron
- **YouTube-Upload-Check** per RSS (Discord kann das nativ nicht)
- **Reaction Roles**, wahlweise mehrere Rollen oder genau eine
- **Ticket-System** mit privatem Kanal je Anfrage
- **Umfragen** mit Balkenanzeige, die sich live aktualisiert
- **Anti-Raid-Schutz**: erkennt Massen-Beitritte und setzt die
  Verifizierungsstufe hoch – bewusst ohne automatische Kicks
- **Slash-Commands** `/warn`, `/history`, `/timeout`, `/clear`, `/befehle`
- **Eigene Textbefehle** mit frei wählbarem Präfix
- **Nachrichten-Log** für bearbeitete und gelöschte Nachrichten
  (standardmäßig aus)
- **Plugin-System**: eigene Erweiterungen aus dem Ordner `plugins/`, ohne
  Eingriff in den Bot-Code

### Dashboard

- Discord-OAuth-Login; sichtbar sind nur Server, auf denen man tatsächlich
  Administrator ist – geprüft gegen die echten Discord-Permission-Bits
- Übersicht je Server mit Status, Verstoßstatistik und Warnhinweisen bei
  Einstellungen, die aktiv sind aber nichts bewirken
- Schemagesteuerte Einstellungen: ein neues Plugin bringt seine Oberfläche mit
- Moderation von Hand aus der Mitgliederliste
- Setup-Wizard mit Interessens-Symbolen und Live-Vorschau
- Zentrale Rechteverwaltung mit Vorschau vorab und Zurücknehmen
- Konsistenz-Check für Verknüpfungen, die ins Leere zeigen
- Akzentfarbe je Server, berechnet aus dessen Icon

### Betrieb

- Drei Container per Docker Compose, SQLite als Datenhaltung
- Automatische Sicherung über SQLites eigene Backup-Funktion, mit
  Aufbewahrungsfrist; Zugriff auf `OWNER_IDS` beschränkt
- Cloudflare Tunnel als optionales Compose-Profil vorbereitet

---

## Hinweise für Aktualisierungen

Ab Version 1.0.0 wird hier festgehalten, was sich ändert. Einträge unter
**Geändert** oder **Entfernt** können Handarbeit erfordern – etwa wenn sich die
Plugin-Schnittstelle ändert oder eine Einstellung wegfällt.

Die Datenbank wandert bei einem Update automatisch mit; ein Rückschritt über
eine Schemaänderung hinweg ist nicht vorgesehen.
