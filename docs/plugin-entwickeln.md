# Ein neues Plugin bauen

So kommt eine neue Funktion in den Bot — inklusive Oberfläche im Dashboard,
ohne dass am Dashboard-Code etwas geändert werden muss.

Beispiel: ein Plugin, das auf bestimmte Wörter mit einer festen Antwort reagiert.

---

## 1. Das Plugin schreiben

`bot/src/plugins/autoreply.js`:

```js
export default {
  name: 'autoreply',

  setup({ settings }) {
    return {
      async messageCreate(message) {
        if (!message.guild || message.author.bot) return;
        const cfg = settings.get(message.guild.id).autoreply;
        if (!cfg?.enabled) return;

        const hit = cfg.rules.find((r) =>
          message.content.toLowerCase().includes(r.trigger.toLowerCase()),
        );
        if (hit) await message.reply(hit.response);
      },
    };
  },
};
```

`setup` bekommt einen Kontext und gibt Event-Handler zurück. Wirft ein Handler,
wird das geloggt und die übrigen Plugins laufen weiter.

### Was im Kontext steckt

| Feld | Wofür |
|---|---|
| `client` | Der discord.js-Client – Kanäle abrufen, Nachrichten senden |
| `db` | Die SQLite-Datenbank (better-sqlite3, synchron) |
| `settings` | `settings.get(guildId)` liefert die Einstellungen eines Servers |
| `infractions` | Verstöße erfassen und abfragen, inklusive Eskalationsstufe |
| `audit` | `audit.record({...})` schreibt ins Audit-Log |

### Verfügbare Events

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
Zeile nach — das geht nur im Bot-Code, nicht aus einem externen Plugin heraus.

### Aufräumen

Braucht dein Plugin einen Timer oder eine offene Verbindung, gib eine
`teardown()`-Funktion mit. Sie läuft beim Herunterfahren:

```js
export default {
  name: 'mein-plugin',
  setup() {
    this._timer = setInterval(() => { /* ... */ }, 60_000);
    this._timer.unref?.();
    return {};
  },
  teardown() {
    clearInterval(this._timer);
  },
};
```

## 2. Einbinden

**Der einfache Weg** – Datei nach `plugins/` legen und neu starten:

```bash
cp autoreply.js plugins/
docker compose restart bot
```

Der Bot lädt beim Start alles aus diesem Ordner. Im Log steht, was geladen
wurde und warum etwas nicht:

```bash
docker compose logs bot --tail 30
```

Ein Plugin mit Fehler wird übersprungen – der Bot startet trotzdem.

Braucht dein Plugin mehrere Dateien, leg einen Ordner an mit einer `index.js`
darin. Hilfsmodule, die nicht als Plugin geladen werden sollen, beginnen mit
einem Unterstrich: `_helfer.js`.

**Der andere Weg** – fest im Bot-Code, für Plugins die mitgeliefert werden
sollen. In `bot/src/index.js`:

```js
import autoreply from './plugins/autoreply.js';

const PLUGINS = [automod, welcome, scheduler, youtube, autoreply];
```

> **Ein Plugin läuft mit den vollen Rechten des Bots.** Es kann bannen, Kanäle
> löschen, Nachrichten mitlesen und auf die Datenbank aller Server zugreifen.
> Es gibt keine technische Schranke dagegen – lade nur Plugins aus Quellen,
> denen du vertraust, und sieh vorher in den Code.

## 3. Standardwerte festlegen

In `shared/src/settings.js` bei `DEFAULT_SETTINGS`:

```js
autoreply: {
  enabled: false,
  rules: [],
},
```

Wichtig, weil bestehende Server diesen Abschnitt noch nicht in der Datenbank
haben — die Defaults werden beim Lesen automatisch untergemischt. Eine
Migration ist nicht nötig.

## 4. Oberfläche beschreiben

In `shared/src/settings-schema.js` einen Abschnitt ergänzen:

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

**Das ist der ganze Dashboard-Teil.** Beim nächsten Aufruf erscheint der neue
Abschnitt mit Formular, Speichern-Knopf und Ein-/Ausblendlogik.

---

## Verfügbare Feldtypen

| Typ | Ergibt | Besonderheit |
|---|---|---|
| `boolean` | Schalter | |
| `text` | einzeilige Eingabe | |
| `textarea` | mehrzeilig | mit `placeholders` inkl. Live-Vorschau |
| `number` | Zahl | `min`, `max` |
| `channel` | Kanal-Dropdown | echte Kanäle des Servers; `optional: true` erlaubt „keiner“ |
| `role` / `roles` | Rollenauswahl | echte Rollen des Servers, mit Farbpunkt wie in Discord |
| `stringlist` | Liste freier Werte | zum Hinzufügen/Entfernen |
| `escalation` | Eskalationsstufen | Sonderfall für den Automod |

Zusätzliche Angaben je Feld:

- `help` — Erklärtext unter dem Feld
- `dependsOn` — blendet das Feld aus, solange das genannte Feld falsch ist
  (Pfadschreibweise, z. B. `spam.enabled`)
- `enabledBy` am Abschnitt — blendet alles außer dem Hauptschalter aus,
  solange dieser aus ist; zeigt außerdem ein Aktiv/Aus-Abzeichen im Kopf
- `icon` am Abschnitt — Symbol im Abschnittskopf. Verfügbar sind `shield`,
  `wave`, `clock` und `play` (siehe `ICON_MAP` in `components/Icons.js`);
  ohne Angabe wird das Schild verwendet

Verschachtelte Schlüssel schreibst du mit Punkt: `spam.maxMessages`.

---

## In der Übersicht auftauchen

Die Startseite eines Servers zeigt Status-Kacheln und warnt vor Einstellungen,
die zwar aktiv sind, aber nichts bewirken. Beides steckt in
`dashboard/src/lib/overview.js`:

- `buildOverview` erzeugt die Kennzahlen — dort ein Feld ergänzen und in
  `components/Overview.js` eine Kachel dafür anlegen
- `collectWarnings` sammelt die Hinweise. Eine neue Prüfung ist eine
  `if`-Abfrage plus ein Satz im Klartext

Beide Funktionen sind rein und ohne Seiteneffekte, also direkt testbar —
siehe `dashboard/test/overview.test.js`.

## Eigene Tabellen

Braucht das Plugin eigene Daten, ergänze `shared/src/schema.js` um ein
`CREATE TABLE IF NOT EXISTS`. Das Schema wird beim Start von Bot und API
angelegt, ist idempotent und liegt bewusst nur an dieser einen Stelle.

Für eigene API-Endpunkte eine Datei unter `api/src/routes/` anlegen und in
`api/src/app.js` mit `guilds.use(...)` einhängen. Der Auth-Schutz gilt dann
automatisch.

---

## Testen

Logik, die ohne laufenden Discord-Server prüfbar ist, gehört in einen Test unter
`bot/test/`. Reine Funktionen exportierst du dafür über `export const __test__`,
so wie es `automod.js` vormacht.

```bash
npm test
```

---

## Vollständiges Beispiel

Unter [`plugins/beispiel-geburtstag.js.txt`](../plugins/beispiel-geburtstag.js.txt)
liegt ein fertiges Plugin zum Abschauen: eigene Tabelle, Reaktion auf
Nachrichten, wiederkehrender Ablauf mit sauberem Aufräumen, Zugriff auf die
Einstellungen.

Zum Ausprobieren die Endung `.txt` entfernen und den Bot neu starten.
