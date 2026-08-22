# Eigene Plugins

Lege hier `.js`-Dateien ab und starte den Bot neu:

```bash
docker compose restart bot
```

Der Bot meldet im Log, was er geladen hat — und warum etwas nicht geklappt hat:

```bash
docker compose logs bot --tail 30
```

**Wie man ein Plugin schreibt:** [docs/plugin-entwickeln.md](../docs/plugin-entwickeln.md)

---

## Sicherheitshinweis

Ein Plugin läuft mit **den vollen Rechten des Bots**. Es kann Mitglieder
bannen, Kanäle löschen, Nachrichten mitlesen und auf die Datenbank zugreifen —
inklusive der Daten aller Server.

Lade deshalb nur Plugins aus Quellen, denen du vertraust, und sieh in den Code,
bevor du ihn ablegst. Es gibt keine technische Schranke, die ein bösartiges
Plugin aufhalten würde.
