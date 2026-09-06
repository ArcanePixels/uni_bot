# Eigene Plugins

Hier liegen Erweiterungen für den Bot. Ein Plugin ist ein Ordner:

```
plugins/
  mein-plugin/
    plugin.json    ← Pflicht: Name, Reiter, Oberfläche
    bot.js         ← optional: was der Bot tun soll
    api.js         ← optional: eigene Endpunkte
```

Ordner hineinlegen, neu starten, fertig — **ohne die Images neu zu bauen**:

```bash
docker compose restart
```

Was geladen wurde und warum etwas nicht, steht im Log:

```bash
docker compose logs api --tail 30 | grep -i plugin
```

Ein Plugin mit Fehler wird übersprungen; der Bot startet trotzdem.
Ein `_` vor dem Ordnernamen schaltet ein Plugin vorübergehend ab.

## Was hier liegt

- **`regeln/`** — Serverregeln zusammenstellen und als Nachricht posten.
  Mitgeliefert und zugleich die Vorlage für eigene Plugins.
- **`twitch/`** — meldet im Discord, wenn ein Twitch-Kanal live geht. Zeigt,
  wie ein Plugin einen äußeren Dienst anbindet und einen öffentlichen
  Webhook-Endpunkt bekommt. Siehe [docs/twitch-plugin.md](../docs/twitch-plugin.md).
- **`beispiel-geburtstag.js.txt`** — ein reines Bot-Plugin im älteren
  Einzeldatei-Format. Zum Ausprobieren die Endung `.txt` entfernen.

## Anleitung

[docs/plugin-entwickeln.md](../docs/plugin-entwickeln.md) beschreibt alle
Bausteine, Feldtypen und Schnittstellen.

> **Ein Plugin läuft mit den vollen Rechten des Bots.** Es kann bannen, Kanäle
> löschen, Nachrichten mitlesen und auf die Daten aller Server zugreifen. Es
> gibt keine technische Schranke dagegen — lade nur Plugins aus Quellen, denen
> du vertraust, und sieh vorher in den Code.
