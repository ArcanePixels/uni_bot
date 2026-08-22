# Befehle, Nachrichten-Log und Sicherung

---

## Slash-Commands

Der Bot meldet diese Befehle bei Discord an, sobald er startet. Sie erscheinen
beim Tippen von `/` mit Autovervollständigung. Dieselbe Übersicht findest du im
Dashboard unter *Befehle → Eingebaute Befehle*.

| Befehl | Wirkung | Wer darf |
|---|---|---|
| `/warn @mitglied [grund]` | Verwarnt und zählt den Verstoß mit | Mitglieder moderieren |
| `/history @mitglied` | Zeigt die letzten Verstöße | Mitglieder moderieren |
| `/timeout @mitglied minuten [grund]` | Schaltet vorübergehend stumm | Mitglieder moderieren |
| `/clear anzahl [@mitglied]` | Löscht die letzten Nachrichten | Nachrichten verwalten |
| `/befehle` | Zeigt die eigenen Textbefehle | alle |

Alle Antworten sind **nur für den Aufrufer sichtbar** — im Kanal steht nichts.

`/warn` weist zusätzlich darauf hin, welche Maßnahme beim nächsten Verstoß
greifen würde. Ist ein Mod-Log-Kanal eingestellt, geht die Verwarnung auch dorthin.

`/clear` kann nur Nachrichten löschen, die **jünger als 14 Tage** sind — eine
Grenze von Discord, nicht des Bots. Ältere bleiben stehen, das Ergebnis sagt es dazu.

> Die Befehle werden bei jedem Bot-Start neu angemeldet. Nach einem Update kann
> es ein paar Minuten dauern, bis Discord sie überall anzeigt.

---

## Eigene Textbefehle

Kurzbefehle wie `!regeln`, die der Bot mit einem festen Text beantwortet.

**Einschalten:** Einstellungen → *Eigene Befehle*. Dort legst du auch das Präfix
fest (Standard `!`) und die Abklingzeit.

**Anlegen:** Reiter *Befehle* → Name und Antwort eintragen. Optional lässt sich
ein Befehl auf eine Rolle beschränken.

Platzhalter im Antworttext: `{user}`, `{username}`, `{server}`, `{count}`,
`{channel}`.

Erwähnungen im Antworttext werden bewusst **nicht** aufgelöst — sonst ließe sich
über eine Vorlage der halbe Server anpingen.

Die Nutzungszahl je Befehl steht in der Übersicht. Praktisch, um zu sehen, was
tatsächlich gebraucht wird.

**Deine Mitglieder finden sie über `<präfix>befehle`** (auch `hilfe`, `help`,
`commands`) oder den Slash-Command `/befehle`. Nötig, weil eigene Textbefehle
technisch bedingt nicht in Discords Vorschlagsliste auftauchen können — anders
als Slash-Commands.

> **Konflikt mit anderen Bots:** Hört ein anderer Bot auf dasselbe Präfix,
> antworten beide. Stell in dem Fall auf etwas Eigenes um, etwa `!!` oder `?`.

---

## Nachrichten-Log

Schreibt bearbeitete und gelöschte Nachrichten mit. Discord selbst protokolliert
Inhalte nicht — bei Streitigkeiten ist das oft das Einzige, was nachträglich
Klarheit bringt.

**Standardmäßig aus.** Es ist eine Mitschrift von Nachrichteninhalten, das
sollte eine bewusste Entscheidung sein.

**Einschalten:** Einstellungen → *Nachrichten-Log*. Dort einstellbar:

- **Log-Kanal** — wohin die Meldungen gehen. Sollte nur für das Team sichtbar sein.
- **Aufbewahrung** — ältere Einträge werden automatisch gelöscht (Standard 30 Tage)
- **Ausgenommene Kanäle** — dort wird nichts mitgeschrieben. Eine Kategorie
  nimmt alle enthaltenen Kanäle mit aus.
- **Bot-Nachrichten** — standardmäßig aus

Im Reiter *Befehle → Nachrichten-Log* siehst du die Einträge und kannst sie
löschen — auch gezielt für ein einzelnes Mitglied, etwa auf dessen Wunsch.

---

## Sicherung

Die Datenbank enthält alles: Einstellungen, Verstöße, geplante Posts, Panels,
Tickets, Interessens-Gruppen. Geht sie verloren, ist alles davon weg.

### Wer darf ran

Eine Sicherung enthält die Daten **aller** Server, die deine Installation nutzt.
Deshalb ist der Zugriff nicht an die Server-Admin-Rolle gebunden, sondern an
`OWNER_IDS` in der `.env` — deine Discord-User-ID:

```
OWNER_IDS=123456789012345678
```

Die ID bekommst du per Rechtsklick auf dich selbst → *Benutzer-ID kopieren*
(Entwicklermodus muss in den Discord-Einstellungen unter *Erweitert* an sein).
Mehrere durch Komma trennen.

Ist die Liste leer, ist der Bereich für niemanden über das Dashboard erreichbar —
die automatische Sicherung läuft trotzdem.

**Läuft automatisch**, standardmäßig täglich um 4 Uhr. Behalten wird eine
Sicherung je Tag, 14 Tage lang.

Einstellbar in der `.env`:

```
BACKUP_CRON=0 4 * * *
BACKUP_KEEP_DAYS=14
```

`BACKUP_CRON=` (leer) schaltet die automatische Sicherung ab.

**Von Hand:** Reiter *Befehle → Sicherungen* → *Jetzt sichern*.

### Warum nicht einfach die Datei kopieren

Während der Bot schreibt, wäre eine Dateikopie möglicherweise unbrauchbar — halb
geschriebene Seiten, nicht eingearbeitetes Journal. Der Bot nutzt stattdessen
SQLites eigene Funktion, die eine in sich stimmige und bereits aufgeräumte Kopie
erzeugt.

### Wiederherstellen

```bash
docker compose down
docker run --rm -v discord-allrounder_botdata:/data alpine sh -c "cp /data/backups/bot-2026-08-22_0400.sqlite /data/bot.sqlite"
docker compose up -d
```

Dateinamen anpassen. Der Volume-Name kann abweichen — prüfen mit
`docker volume ls`.

### Sicherung außer Haus

Die Sicherungen liegen im selben Docker-Volume wie die Datenbank. Bei einem
Plattenschaden wären beide weg. Für eine echte Sicherung kopier den Ordner
regelmäßig woandershin:

```bash
docker run --rm -v discord-allrounder_botdata:/data -v /pfad/zum/ziel:/backup alpine sh -c "cp -r /data/backups/. /backup/"
```

Als Cron-Job auf dem Server eingerichtet, läuft das von selbst.
