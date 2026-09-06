# Aktualisieren

## Der normale Weg

```bash
cd /pfad/zum/discord-allrounder
git pull
docker compose up -d --build
```

Das war's. Die Datenbank wandert automatisch mit — beim Start legt der Bot
fehlende Tabellen und Spalten selbst an. Deine Einstellungen, Verstöße und
Panels bleiben erhalten.

**Vorher eine Sicherung anlegen** ist trotzdem eine gute Angewohnheit:
Dashboard → Befehle → Sicherungen → *Jetzt sichern*.

---

## Wenn du die Dateien von Hand kopierst

Ohne `git pull` — also per WinSCP, Samba-Freigabe oder USB — gibt es einen
Stolperstein: **Kopieren überschreibt und ergänzt, aber es löscht nichts.**
Dateien, die in der neuen Version entfernt wurden, bleiben liegen. Der Build
bricht dann ab, weil eine alte Seite etwas importiert, das es nicht mehr gibt:

```
Error: Export createRule doesn't exist in target module
```

Deshalb **nach dem Kopieren, vor dem Bauen**:

```bash
sh aufraeumen.sh
```

Das zeigt, was übrig geblieben ist. Zum Entfernen:

```bash
sh aufraeumen.sh --loeschen
```

Danach normal bauen. Das Skript räumt außerdem den Build-Zwischenspeicher
(`dashboard/.next`) weg — der ist plattformabhängig und lässt den Build sonst
mit „Restore failures" abbrechen, wenn er von einem Windows-Rechner mitkam.

> Mit `git pull` brauchst du das nicht: git entfernt gelöschte Dateien selbst.

---

## Was dabei passiert

| | |
|---|---|
| Deine `.env` | bleibt unangetastet (steht in `.gitignore`) |
| Datenbank | bleibt im Docker-Volume, wird bei Bedarf erweitert |
| **Einstellungen aller Server** | **bleiben erhalten – auch die fremder Nutzer** |
| Eigene Plugins | bleiben im Ordner `plugins/` liegen |
| Slash-Commands | werden beim Start neu bei Discord angemeldet |

### Warum Einstellungen ein Update überleben

Die Daten liegen in einem Docker-Volume (`botdata`), nicht im Image. Ein neues
Image ersetzt den Programmcode, nicht die Daten.

Beim Start legt der Bot fehlende Tabellen an — **jede mit `IF NOT EXISTS`**.
Bestehende bleiben unberührt. Im gesamten Schema gibt es kein `DROP`, kein
`DELETE` und kein `TRUNCATE`.

Bringt ein Update ein Plugin mit einem neuen Feld mit, kommt die Spalte dazu;
die vorhandenen Werte bleiben stehen. Das ist durch Tests abgesichert
(`shared/test/update-sicher.test.js`) — sie stellen genau diesen Fall nach.

> Das Volume wird nur bei `docker compose down -v` gelöscht. Das `-v` ist der
> Unterschied: **ohne** bleiben die Daten, **mit** sind sie weg. Zum
> Aktualisieren wird es nie gebraucht.

Neue Einstellungen bekommen ihre Standardwerte, ohne dass du etwas tun musst —
bestehende Werte werden nicht überschrieben.

---

## Wenn etwas schiefgeht

**Zurück auf die vorherige Version:**

```bash
git log --oneline -5          # die letzten Versionen ansehen
git checkout <commit-id>
docker compose up -d --build
```

**Datenbank zurücksetzen** (nur wenn nötig — du verlierst alles seit der
Sicherung):

```bash
docker compose down
docker run --rm -v discord-allrounder_botdata:/data alpine sh -c "cp /data/backups/bot-JJJJ-MM-TT_HHMM.sqlite /data/bot.sqlite"
docker compose up -d
```

Dateinamen anpassen. Den Volume-Namen prüfst du mit `docker volume ls`.

> **Achtung bei einem Rückschritt über eine Schemaänderung hinweg:** Eine neuere
> Datenbank mit einer älteren Programmversion zu betreiben, ist nicht vorgesehen.
> Spiel in dem Fall auch die passende Sicherung zurück.

---

## Was beim Aktualisieren schiefgehen kann

**Der Build bricht mit „Restore failures" ab**
→ Ein Build-Zwischenspeicher aus einer anderen Umgebung liegt im Projektordner:

```bash
rm -rf dashboard/.next && docker compose build --no-cache dashboard
```

**`docker compose up -d` ändert nichts**
→ Ohne `--build` startet Compose nur, was schon da ist. Nach Codeänderungen:

```bash
docker compose up -d --build
```

**Ein eigenes Plugin lädt nicht mehr**
→ Die Schnittstelle kann sich geändert haben. Im Log steht der Grund:

```bash
docker compose logs bot --tail 30
```

Der Bot startet trotzdem — ein defektes Plugin wird übersprungen.

---

## Versionen

Die Versionsnummer steht in der `package.json` und folgt dem üblichen Schema
`HAUPT.NEBEN.KLEIN`:

- **KLEIN** (1.0.**1**) — Fehlerbehebungen, einfach aktualisieren
- **NEBEN** (1.**1**.0) — neue Funktionen, weiterhin abwärtskompatibel
- **HAUPT** (**2**.0.0) — etwas hat sich grundlegend geändert; die
  [CHANGELOG.md](../CHANGELOG.md) sagt, was zu tun ist

Was sich geändert hat, steht in der [CHANGELOG.md](../CHANGELOG.md). Bei einem
Hauptversionssprung lies sie **vor** dem Aktualisieren.
