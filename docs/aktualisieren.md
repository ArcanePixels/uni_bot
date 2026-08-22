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

## Was dabei passiert

| | |
|---|---|
| Deine `.env` | bleibt unangetastet (steht in `.gitignore`) |
| Datenbank | bleibt im Docker-Volume, wird bei Bedarf erweitert |
| Eigene Plugins | bleiben im Ordner `plugins/` liegen |
| Slash-Commands | werden beim Start neu bei Discord angemeldet |

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
