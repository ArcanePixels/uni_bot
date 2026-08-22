# Änderungen

Aufgebaut nach [Keep a Changelog](https://keepachangelog.com/de/1.1.0/),
Versionierung nach [Semantic Versioning](https://semver.org/lang/de/).

Wie man aktualisiert, steht in [docs/aktualisieren.md](docs/aktualisieren.md).

## [Unveröffentlicht]

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
