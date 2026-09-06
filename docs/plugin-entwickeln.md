# Eigene Plugins

Ein Plugin erweitert den Bot, ohne dass du seinen Code anfasst. Ordner nach
`plugins/` kopieren, neu starten, fertig — **ohne die Images neu zu bauen.**

```
plugins/
  mein-plugin/
    plugin.json    ← Pflicht: Name, Reiter, Oberfläche
    bot.js         ← optional: was der Bot tun soll
    api.js         ← optional: eigene Endpunkte
```

> **Ein Plugin läuft mit den vollen Rechten des Bots.** Es kann bannen, Kanäle
> löschen, Nachrichten mitlesen und auf die Daten aller Server zugreifen. Es
> gibt keine technische Schranke dagegen — lade nur Plugins aus Quellen, denen
> du vertraust, und sieh vorher in den Code.

---

## Das kleinste Plugin

Eine einzige Datei genügt. Diese `plugin.json` gibt dir einen neuen Reiter mit
einem Formular — ohne eine Zeile Code:

```json
{
  "name": "mein-plugin",
  "label": "Mein Plugin",
  "icon": "plug",
  "ui": {
    "sections": [
      {
        "type": "form",
        "title": "Einstellungen",
        "fields": [
          { "key": "channel_id", "label": "Kanal", "type": "channel" },
          { "key": "text", "label": "Text", "type": "textarea" }
        ]
      }
    ]
  }
}
```

Tabellen, Speichern, Prüfung der Eingaben und die Trennung zwischen Servern
übernimmt das Grundsystem. Du beschreibst nur, was du haben willst.

**Der Ordnername muss dem `name` entsprechen** — er steht in der URL und im
Tabellennamen.

---

## Warum die Oberfläche als Beschreibung und nicht als Code?

Das Dashboard ist eine Next.js-Anwendung. Die kompiliert ihre Seiten beim Bauen;
im fertigen Container steckt kein Compiler mehr. Würde ein Plugin React-Code
mitbringen, müsste **jeder Nutzer das Dashboard neu bauen** — und wer das nicht
kann oder will, könnte dein Plugin nicht benutzen.

Deshalb hat das Dashboard die Bausteine fest eingebaut, und dein Plugin wählt
aus. Der Preis: Du kannst nur, wofür es Bausteine gibt. Der Gewinn: Dein Plugin
läuft überall, wo der Bot läuft.

Brauchst du wirklich etwas Eigenes, ist der Weg eine `api.js` (siehe unten) —
oder ein Beitrag zum Grundsystem, damit alle etwas davon haben.

---

## Die Bausteine

### Abschnitte

| `type` | Wofür |
|---|---|
| `form` | Einstellungen, die einmal je Server gelten |
| `list` | Mehrere Einträge, sortierbar, mit Anlegen/Ändern/Löschen |
| `actions` | Knöpfe, die etwas auslösen |

### Feldtypen

| `type` | Was der Nutzer sieht |
|---|---|
| `text` | einzeiliges Feld |
| `textarea` | mehrzeiliges Feld |
| `number` | Zahlenfeld (`min`, `max`) |
| `boolean` | Schalter |
| `select` | Auswahl (braucht `options`) |
| `channel` | Kanal-Auswahl des Servers |
| `role` | Rollen-Auswahl des Servers |
| `color` | Farbwähler |
| `emoji` | Feld für ein Symbol |

Bei jedem Feld möglich: `required`, `default`, `maxLength`, `placeholder`,
`help` (ein Hinweis unter dem Feld).

**Bei `channel` zusätzlich `requiresPermissions`** — welche Rechte der Bot in
dem Kanal braucht. Das Dashboard prüft sie und zeigt direkt unter dem Feld an,
ob sie gesetzt sind:

```json
{
  "key": "channel_id",
  "label": "Kanal",
  "type": "channel",
  "requiresPermissions": ["VIEW_CHANNEL", "SEND_MESSAGES", "EMBED_LINKS"]
}
```

Erlaubt sind `VIEW_CHANNEL`, `SEND_MESSAGES`, `EMBED_LINKS`, `ATTACH_FILES`,
`READ_MESSAGE_HISTORY`, `ADD_REACTIONS`, `MANAGE_MESSAGES`.

Nimm auf, was dein Plugin wirklich braucht — jedes zusätzliche Recht ist eines,
das der Nutzer setzen muss. Wer ein Embed postet, braucht `EMBED_LINKS`; das
wird am häufigsten übersehen, weil der Name nicht nach Embeds klingt.

Mit `"group"` bestimmst du, in welcher Reitergruppe dein Plugin landet:
`moderation`, `inhalte` oder `server`. Ohne Angabe kommt es zu den Inhalten —
dort passen die meisten hin.

Als `icon` für den Reiter stehen zur Wahl: `shield`, `wave`, `clock`, `play`,
`list`, `users`, `gavel`, `plus`, `hash`, `scroll`, `plug`. Ohne Angabe gibt es
den Stecker.

### Eine Liste

```json
{
  "type": "list",
  "key": "eintraege",
  "title": "Meine Einträge",
  "max": 25,
  "itemLabel": "title",
  "fields": [
    { "key": "icon", "label": "Symbol", "type": "emoji" },
    { "key": "title", "label": "Überschrift", "type": "text", "required": true },
    { "key": "text", "label": "Text", "type": "textarea" }
  ]
}
```

`key` bestimmt die Tabelle, `itemLabel` das Feld, das in der Zeile fett steht.

### Ein Aktionsknopf

```json
{
  "type": "actions",
  "actions": [
    {
      "key": "publish",
      "label": "Jetzt posten",
      "style": "primary",
      "requires": ["channel_id"],
      "requiresList": "eintraege",
      "help": "Der Bot postet oder aktualisiert die Nachricht."
    }
  ]
}
```

`requires` und `requiresList` sorgen für eine klare Fehlermeldung, statt dass
der Bot still nichts tut.

---

## Der Bot-Teil

`bot.js` ist zuständig für alles, was in Discord passieren soll:

```js
export default {
  name: 'mein-plugin',

  async setup(ctx) {
    const { client, store, log } = ctx;

    // `store` kennt die Felder aus deiner plugin.json.
    this._timer = setInterval(() => {
      for (const cfg of store.pendingGuilds()) {
        try {
          // ... etwas tun ...
          log.info(`${cfg.guild_id}: erledigt`);
        } finally {
          // IMMER abhaken - auch im Fehlerfall. Sonst läuft es endlos.
          store.clearDirty(cfg.guild_id);
        }
      }
    }, 5000);
  },

  teardown() {
    clearInterval(this._timer);
  },
};
```

### Was in `ctx` steckt

| Feld | Wofür |
|---|---|
| `client` | Der discord.js-Client – Kanäle abrufen, Nachrichten senden |
| `store` | Dein Datenspeicher, passend zur `plugin.json` (siehe unten) |
| `manifest` | Deine `plugin.json` |
| `log` | Log mit deinem Plugin-Namen davor |
| `db` | Die SQLite-Datenbank (better-sqlite3, synchron) |
| `settings` | `settings.get(guildId)` liefert die Einstellungen eines Servers |
| `infractions` | Verstöße erfassen und abfragen, inklusive Eskalationsstufe |
| `audit` | `audit.record({...})` schreibt ins Audit-Log |

### Was `store` kann

| Aufruf | Bedeutung |
|---|---|
| `getConfig(guildId)` | die Einstellungen eines Servers |
| `saveConfig(guildId, werte)` | Einstellungen ändern |
| `listItems(guildId, key)` | die Einträge einer Liste |
| `addItem` / `updateItem` / `removeItem` / `moveItem` | Listen pflegen |
| `getState(guildId)` / `setState(guildId, werte)` | dein eigener Merkzettel |
| `pendingGuilds()` | Server, bei denen etwas zu tun ist |
| `clearDirty(guildId)` | einen Server abhaken |

**Merkzettel oder Einstellung?** Was der Nutzer im Dashboard sieht, gehört in
die `plugin.json`. Was sich der Bot selbst merkt — etwa eine Nachrichten-ID —
gehört in `setState`. Ein Feld, das es in der `plugin.json` nicht gibt, weist
`saveConfig` bewusst ab, statt den Wert still zu verschlucken.

### Warum das Abhaken so wichtig ist

Bot und Dashboard laufen in getrennten Containern und können sich nicht direkt
ansprechen. Das Dashboard markiert einen Server stattdessen als „hier ist etwas
zu tun", der Bot sieht regelmäßig nach.

Hakst du einen Auftrag nach einem Fehlschlag nicht ab, versucht es der Bot
endlos weiter und flutet das Log. Deshalb steht `clearDirty` im Beispiel oben in
einem `finally`.

### Auf Discord-Ereignisse reagieren

`setup` darf ein Objekt mit Behandlungsfunktionen zurückgeben. Wirft eine davon,
wird das geloggt und die übrigen Plugins laufen weiter.

```js
setup(ctx) {
  return {
    async messageCreate(message) { /* ... */ },
    async guildMemberAdd(member) { /* ... */ },
  };
}
```

| Event | Wann |
|---|---|
| `ready` | Einmal, sobald der Bot verbunden ist |
| `messageCreate` | Neue Nachricht |
| `messageUpdate` | Nachricht bearbeitet |
| `messageDelete` | Nachricht gelöscht |
| `guildMemberAdd` | Jemand tritt bei |
| `messageReactionAdd` | Reaktion hinzugefügt |
| `messageReactionRemove` | Reaktion entfernt |
| `interactionCreate` | Slash-Command oder Knopfdruck |

Brauchst du ein weiteres Discord-Event, trägst du in `bot/src/index.js` eine
Zeile nach — das geht nur im Bot-Code, nicht aus einem Plugin heraus.

### Aufräumen

Braucht dein Plugin einen Timer oder eine offene Verbindung, gib eine
`teardown()`-Funktion mit. Sie läuft beim Herunterfahren.

---

## Eigene Endpunkte

Reicht der Baukasten nicht, liefert `api.js` einen eigenen Express-Router:

```js
import { Router } from 'express';

export default function ({ db, botToken, manifest }) {
  const router = Router();
  router.get('/statistik', (req, res) => res.json({ /* ... */ }));
  return router;
}
```

Erreichbar unter `/api/guilds/:guildId/p/mein-plugin/x/statistik`. Das `/x/`
trennt deine Endpunkte von den eingebauten, damit du sie nicht versehentlich
überschreibst. Der Token-Schutz gilt automatisch.

Eine eigene **Dashboard-Seite** kannst du damit trotzdem nicht ausliefern —
siehe oben. Der Router ist für Daten, nicht für Oberflächen.

---

## Prüfen, ob es lädt

```bash
docker compose logs bot --tail 30 | grep -i plugin
```

```bash
docker compose logs api --tail 30 | grep -i plugin
```

Ein Plugin mit Fehler wird **übersprungen, nicht verschluckt** — der Bot startet
trotzdem, und der Grund steht im Log. Alle Probleme einer `plugin.json` werden
auf einmal gemeldet, damit du sie nicht einzeln abarbeiten musst.

**Ein Plugin vorübergehend abschalten:** ein `_` vor den Ordnernamen. Es wird
dann still übersprungen.

---

## Testen

Ein Plugin lässt sich ohne Discord testen: Attrappe für `client`, Datenbank im
Arbeitsspeicher, `setup` direkt aufrufen. Wie das geht, zeigt
[`bot/test/regeln-plugin.test.js`](../bot/test/regeln-plugin.test.js).

```bash
npm test --workspaces
```

---

## Vollständiges Beispiel

Das mitgelieferte Serverregeln-Plugin nutzt alle drei Abschnittstypen und ist
als Vorlage gedacht:

- [`plugins/regeln/plugin.json`](../plugins/regeln/plugin.json) — die Oberfläche
- [`plugins/regeln/bot.js`](../plugins/regeln/bot.js) — der Bot-Teil
- [`bot/test/regeln-plugin.test.js`](../bot/test/regeln-plugin.test.js) — die Tests

Beschrieben in [regeln-plugin.md](regeln-plugin.md).

Ein reines Bot-Plugin im älteren Einzeldatei-Format zeigt
[`plugins/beispiel-geburtstag.js.txt`](../plugins/beispiel-geburtstag.js.txt) —
zum Ausprobieren die Endung `.txt` entfernen. Einzelne `.js`-Dateien direkt in
`plugins/` werden weiterhin geladen, bekommen aber keine Dashboard-Seite.
Brauchst du dort mehrere Dateien, leg einen Ordner mit `index.js` an;
Hilfsmodule beginnen mit einem Unterstrich (`_helfer.js`).

---

---

# Am Grundsystem mitarbeiten

Alles ab hier betrifft **nicht** das Schreiben von Plugins, sondern Änderungen
am Bot selbst. Dafür musst du die Images neu bauen.

## Eine Funktion fest einbauen

Mitgelieferte Funktionen liegen unter `bot/src/plugins/` und werden in
`bot/src/index.js` in `PLUGINS` eingetragen:

```js
import autoreply from './plugins/autoreply.js';

const PLUGINS = [automod, welcome, scheduler, youtube, autoreply];
```

## Standardwerte festlegen

In `shared/src/settings.js` bei `DEFAULT_SETTINGS`:

```js
autoreply: {
  enabled: false,
  rules: [],
},
```

Wichtig, weil bestehende Server diesen Abschnitt noch nicht in der Datenbank
haben — die Defaults werden beim Lesen untergemischt. Eine Migration ist nicht
nötig.

## Oberfläche beschreiben

In `shared/src/settings-schema.js` einen Abschnitt ergänzen. Daraus baut das
Dashboard den Reiter „Einstellungen" von selbst:

```js
{
  key: 'autoreply',
  title: 'Automatische Antworten',
  description: 'Antwortet selbstständig auf bestimmte Stichwörter.',
  enabledBy: 'enabled',
  fields: [
    { key: 'enabled', type: 'boolean', label: 'Aktiv' },
    {
      key: 'triggerWords',
      type: 'stringlist',
      label: 'Stichwörter',
      help: 'Nachrichten mit diesen Wörtern lösen eine Antwort aus.',
    },
  ],
},
```

### Feldtypen im Einstellungs-Schema

Das Schema des Grundsystems kann mehr als der Plugin-Baukasten:

| Typ | Ergibt | Besonderheit |
|---|---|---|
| `boolean` | Schalter | |
| `text` | einzeilige Eingabe | |
| `textarea` | mehrzeilig | mit `placeholders` inkl. Live-Vorschau |
| `number` | Zahl | `min`, `max` |
| `channel` / `channels` | Kanal-Auswahl | `optional: true` erlaubt „keiner" |
| `role` / `roles` | Rollenauswahl | mit Farbpunkt wie in Discord |
| `stringlist` | Liste freier Werte | zum Hinzufügen/Entfernen |
| `escalation` | Eskalationsstufen | Sonderfall für den Automod |

Zusätzlich je Feld: `help`, `dependsOn` (blendet das Feld aus, solange das
genannte Feld falsch ist — Pfadschreibweise, z. B. `spam.enabled`). Am
Abschnitt: `enabledBy` (blendet alles außer dem Hauptschalter aus) und `icon`.
Verschachtelte Schlüssel schreibst du mit Punkt: `spam.maxMessages`.

## In der Übersicht auftauchen

Die Startseite zeigt Kacheln und warnt vor Einstellungen, die zwar aktiv sind,
aber nichts bewirken. Beides steckt in `dashboard/src/lib/overview.js`:

- `buildOverview` erzeugt die Kennzahlen — dort ein Feld ergänzen und in
  `components/Overview.js` eine Kachel dafür anlegen
- `collectWarnings` sammelt die Hinweise. Eine neue Prüfung ist eine
  `if`-Abfrage plus ein Satz im Klartext

Beide Funktionen sind rein und ohne Seiteneffekte, also direkt testbar — siehe
`dashboard/test/overview.test.js`.

## Eigene Tabellen im Grundsystem

Ergänze `shared/src/schema.js` um ein `CREATE TABLE IF NOT EXISTS`. Das Schema
wird beim Start von Bot und API angelegt und ist idempotent.

Für eigene Endpunkte eine Datei unter `api/src/routes/` anlegen und in
`api/src/app.js` mit `guilds.use(...)` einhängen. Der Auth-Schutz gilt dann
automatisch.

> Für ein Plugin ist das **nicht** nötig — dessen Tabellen entstehen aus der
> `plugin.json`.
