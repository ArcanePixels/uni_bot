# Discord Allrounder Bot

Modularer Discord-Bot ohne Abo-Zwang. Deckt die Funktionen ab, die MEE6 und
Carl-bot hinter Premium legen — auf eigener Hardware, mit eigenem Web-Dashboard.

**Du betreibst ihn selbst.** Es gibt keinen zentralen Dienst: eigener Bot-Token,
eigener Server, eigene Daten. Drei Container per Docker Compose, danach läuft es.

## Schnellstart

```bash
git clone <repo-url> discord-allrounder
cd discord-allrounder
cp .env.example .env
# .env ausfüllen - was wo herkommt, steht in docs/setup.md
docker compose up -d
```

Voraussetzungen: Docker mit Compose, ein Discord-Konto und ein Server, auf dem
du Administrator bist. Der Rechner sollte durchlaufen — ein Discord-Bot hält
eine dauerhafte Verbindung.

> **Zum Zugriff von außen:** Im Heimnetz läuft das Dashboard über HTTP. Gibst du
> es per Portweiterleitung ins Internet frei, ist die Verbindung
> **unverschlüsselt** — Login und Sitzungs-Cookies gehen im Klartext durchs Netz.
> Wer sich aus fremden WLANs anmeldet, sollte HTTPS davorsetzen; ein
> Cloudflare Tunnel ist als Compose-Profil vorbereitet, siehe
> [docs/cloudflare-tunnel.md](docs/cloudflare-tunnel.md).

**Anleitungen:** [Einrichtung](docs/setup.md) · [Dashboard](docs/dashboard.md) ·
[Funktionen](docs/funktionen.md) · [Wizard & Rechte](docs/wizard-und-rechte.md) ·
[Befehle & Sicherung](docs/befehle-und-sicherung.md) ·
[Was gespeichert wird](docs/datenschutz.md) ·
[Eigene Plugins](docs/plugin-entwickeln.md) ·
[Serverregeln](docs/regeln-plugin.md) ·
[Twitch](docs/twitch-plugin.md) ·
[Aktualisieren](docs/aktualisieren.md)

## Was er kann

- **Automod mit Eskalation** — Wortfilter, Spam-/Flood-Schutz, Link-Whitelist.
  Verstöße werden gezählt, Maßnahme steigert sich: Verwarnung → Timeout → Kick → Ban
- **Willkommensnachricht + Autorole** — beim Join, mit Platzhaltern im Text
- **Geplante Posts** — einmalig zu einem Zeitpunkt oder wiederkehrend per Cron
- **YouTube-Upload-Check** — neue Videos per RSS erkennen und posten
  (Discord kann das nativ nicht; Twitch dagegen schon — dafür also kein eigenes Modul)
- **Audit-Log** — wer hat wann was ausgelöst
- **Serverregeln** — im Dashboard zusammenstellen, der Bot postet sie als Embed
  und hält sie aktuell (mitgeliefertes Plugin, siehe `plugins/regeln/`)
- **Twitch-Livemeldung** — meldet im Discord, wenn ein Kanal live geht. Per
  Webhook in Sekunden, sonst rund jede Minute (mitgeliefertes Plugin)
- **Plugin-System** — eigene Erweiterungen bekommen ihre Dashboard-Seite aus
  einer `plugin.json`. Ordner hineinlegen, neu starten, fertig — ohne Neubau
- **Dashboard** — alles davon im Browser einstellen, mit Discord-Login und
  Dropdowns für Kanäle und Rollen statt abgetippter IDs. Eine Startseite unter
  `/willkommen` erklärt den Umfang, bevor sich jemand anmeldet
- **Reaction Roles** — Mitglieder vergeben sich Rollen per Emoji-Klick,
  wahlweise mehrere oder genau eine
- **Ticket-System** — privater Kanal je Support-Anfrage, nur für Ersteller
  und Team sichtbar
- **Umfragen** — Abstimmung mit Balkenanzeige, die sich live aktualisiert
- **Anti-Raid-Schutz** — erkennt Massen-Beitritte und setzt die
  Verifizierungsstufe hoch (bewusst ohne automatische Kicks)
- **Moderation von Hand** — verwarnen, stummschalten, kicken, bannen direkt
  aus der Mitgliederliste; zählt in die Automod-Eskalation mit
- **Übersicht je Server** — Status auf einen Blick, plus Warnungen bei
  Einstellungen, die aktiv sind aber nichts bewirken
- **Konsistenz-Check** — meldet Verknüpfungen, die ins Leere zeigen, und
  vertauscht wirkende Zuordnungen
- **Setup-Wizard** — Mitglieder klicken Interessens-Symbole an, der Bot setzt
  Rolle und Kanalrechte; mit Live-Vorschau, bevor etwas passiert
- **Rechte gebündelt setzen** — ein Rechtepaket auf viele Kanäle anwenden,
  statt jeden einzeln in Discord durchzuklicken; mit Vorschau und Zurücknehmen
- **Slash-Commands** — `/warn`, `/history`, `/timeout`, `/clear` für den
  Mod-Alltag, Antworten nur für den Aufrufer sichtbar
- **Eigene Textbefehle** — `!regeln` und dergleichen, im Dashboard gepflegt
- **Nachrichten-Log** — bearbeitete und gelöschte Nachrichten mitschreiben
  (standardmäßig aus, mit Aufbewahrungsfrist und ausnehmbaren Kanälen)
- **Automatische Sicherung** — täglich, mit Aufbewahrung und manuellem Auslöser

## Aufbau

```
shared/     DB-Schema, Settings-Store, Feldbeschreibung der Oberfläche
bot/        Der Bot selbst, mitgelieferte Funktionen unter src/plugins/
api/        REST-API
dashboard/  Weboberfläche (Next.js) mit Discord-Login
plugins/    Eigene Erweiterungen - hier kommen deine Plugins rein
docs/       Anleitungen
```

`shared/` existiert, damit das DB-Schema **nur an einer Stelle** definiert ist.
In der Vorgängerversion war es zwischen Bot und API dupliziert und musste bei
jeder Änderung doppelt gepflegt werden.

### Plugin-System

**Erweiterbar ohne Eingriff in den Bot-Code und ohne Neubau.** Ein Plugin ist ein
Ordner unter `plugins/`:

```
plugins/mein-plugin/
  plugin.json    Pflicht: Name, Reiter, Oberfläche
  bot.js         optional: was der Bot tun soll
  api.js         optional: eigene Endpunkte
```

Hineinlegen, `docker compose restart`, fertig. Ein defektes Plugin wird
übersprungen und im Log gemeldet — der Bot startet trotzdem.

Die `plugin.json` beschreibt die Oberfläche als Daten. Daraus entstehen Tabellen,
Endpunkte, Eingabeprüfung und der Reiter im Dashboard von selbst:

```json
{
  "name": "mein-plugin",
  "label": "Mein Plugin",
  "ui": {
    "sections": [
      {
        "type": "form",
        "fields": [{ "key": "channel_id", "label": "Kanal", "type": "channel" }]
      }
    ]
  }
}
```

Der Umweg über eine Beschreibung statt React-Code ist nötig, weil Next.js seine
Seiten beim Bauen kompiliert — im fertigen Container steckt kein Compiler mehr.
Käme die Oberfläche als Code, müsste jeder Nutzer das Dashboard neu bauen.

Soll das Plugin auch in Discord etwas tun, kommt `bot.js` dazu — ein Objekt mit
`name` und `setup(ctx)`, das Event-Handler zurückgibt:

```js
export default {
  name: 'mein-plugin',
  setup({ client, store, log }) {
    return {
      async messageCreate(message) { /* … */ },
    };
  },
};
```

`ctx` enthält `client`, `store` (der Datenspeicher zu deiner `plugin.json`),
`manifest`, `log` sowie `db`, `settings`, `infractions` und `audit`. Wirft ein
Handler, wird das geloggt und die übrigen Plugins laufen weiter — ein defektes
Modul legt den Bot nicht lahm.

Zwei Beispiele zum Abschauen: [`plugins/regeln/`](plugins/regeln) — das
Serverregeln-Plugin mit eigener Dashboard-Seite, beschrieben in
[docs/regeln-plugin.md](docs/regeln-plugin.md) — und
[`plugins/beispiel-geburtstag.js.txt`](plugins/beispiel-geburtstag.js.txt)
(schlicht, nur Bot-Teil im älteren Einzeldatei-Format).

Alle Bausteine und Feldtypen stehen in
[docs/plugin-entwickeln.md](docs/plugin-entwickeln.md). Fest **mitgelieferte**
Funktionen liegen dagegen unter `bot/src/plugins/` und werden in
`bot/src/index.js` eingetragen — dafür ist ein Neubau nötig.

### Farbe je Server

Das Dashboard berechnet die Akzentfarbe aus dem **Icon des jeweiligen Discord-
Servers** — verwaltest du mehrere, sieht jeder anders aus und du erkennst sofort,
wo du gerade bist. Die Analyse läuft in der API: Icon in 16×16 laden, PNG ohne
Fremdbibliothek dekodieren (inklusive Palettenbilder, die Discord tatsächlich
ausliefert), graue und blasse Punkte verwerfen, den kräftigsten Farbton nehmen
und seine Helligkeit in einen Bereich zwingen, in dem weißer Text lesbar bleibt.

Lässt sich keine sinnvolle Farbe ermitteln — etwa bei einem grauen Icon oder
gar keinem —, bleibt die ArcanePixels-Markenfarbe. Die Farbe kommt als
`<style>`-Element in die Seite, damit sie schon im ersten Aufbau steht und
nichts sichtbar umspringt.

### Schemagesteuerte Oberfläche

`shared/src/settings-schema.js` beschreibt die Einstellungen **als Daten**:
welche Abschnitte es gibt, welche Felder, welchen Typ sie haben, wovon sie
abhängen. Das Dashboard baut seine Formulare daraus, statt für jedes Feld
eigenes JSX zu haben.

Dasselbe Prinzip trägt das Plugin-System: Dort beschreibt die `plugin.json` die
Oberfläche, hier `settings-schema.js`. In beiden Fällen bekommt man Formular,
Speichern und Prüfung geschenkt, ohne Dashboard-Code zu schreiben.

Der Unterschied: `settings-schema.js` gehört zum Grundsystem und wird beim Bauen
einkompiliert — Änderungen daran brauchen einen Neubau. Eine `plugin.json` wird
zur Laufzeit gelesen und braucht keinen.

## Aktualisieren

```bash
git pull && docker compose up -d --build
```

Die Datenbank wandert automatisch mit. Details und was bei Problemen zu tun ist:
[docs/aktualisieren.md](docs/aktualisieren.md). Was sich geändert hat, steht in
der [CHANGELOG.md](CHANGELOG.md).

## Mitmachen

Fehlerberichte und Vorschläge gern als Issue. Eigene Plugins gern als Hinweis —
gute nehme ich in eine Liste hier auf. Bei Änderungen am Code:

```bash
npm install
npm test
```

npm-Workspaces, daher immer aus dem Projektwurzelverzeichnis installieren.
`better-sqlite3` ist ein natives Modul und braucht beim Install ein Build-Script.

## Betrieb

Docker Compose, drei Container auf einem gemeinsamen Volume. Als Basis-Image
`node:22-slim`, **nicht Alpine** — für musl gibt es keine Prebuilds von
`better-sqlite3`, das Image bräuchte sonst eine komplette Build-Toolchain.

Das Dashboard erreicht die API über das Docker-Netz (`http://api:8080`). Die
API bindet nach außen nur auf `127.0.0.1`. Zugriff von außen über einen
Cloudflare Tunnel, nicht über einen offenen Port am Router.

## Sicherheit

- Login über Discord-OAuth. Sichtbar sind nur Server, auf denen der Nutzer
  **tatsächlich** Administrator ist oder „Server verwalten“ darf — geprüft gegen
  die echten Discord-Permission-Bits, nicht gegen ein eigenes Rechtesystem.
- Die Prüfung läuft serverseitig bei **jedem** Seitenaufruf und in **jeder**
  Server-Action erneut. Server-Actions sind öffentliche Endpunkte; ohne eigene
  Prüfung wären sie unabhängig von der angezeigten Seite aufrufbar.
- Das API-Token verlässt nie den Server — der Browser sieht es nicht.
- Refresh-Token-Flow für abgelaufene Discord-Sitzungen; schlägt er fehl, führt
  der Weg zum erneuten Login statt zu einem Serverfehler.
- **Plugins laufen mit den vollen Rechten des Bots.** Wer eine Datei nach
  `plugins/` legt, kann bannen, Kanäle löschen, Nachrichten mitlesen und auf die
  Daten aller Server zugreifen. Es gibt keine technische Schranke dagegen — lade
  nur Plugins aus Quellen, denen du vertraust, und sieh vorher in den Code.

## Stand

**Stufe 1** (Bot + API): läuft auf dem Server, mit echtem Bot-Token verbunden.

**Stufe 2** (Dashboard): läuft auf dem Server, Discord-Login funktioniert.

**Stufe 3** (Gestaltung): Übersichtsseite, ArcanePixels-Erscheinungsbild,
Server-eigene Akzentfarbe aus dem Icon.

**Stufe 4** (Ausbau): Moderation von Hand, Namen statt IDs, Konsistenz-Check,
Reaction Roles, Tickets, Umfragen, Anti-Raid. Cloudflare Tunnel als optionales
Compose-Profil vorbereitet.

**Stufe 5** (Wizard & Rechte): Setup-Wizard mit Interessens-Symbolen und
Live-Vorschau, zentrale Rechteverwaltung mit Vorschau und Zurücknehmen. Damit
sind alle Punkte aus dem ursprünglichen Konzept umgesetzt.

**Stufe 6** (Alltag): Slash-Commands, eigene Textbefehle, Nachrichten-Log,
automatische Sicherung.

**Stufe 7** (Plugins): Erweiterungen bringen ihre eigene Dashboard-Seite mit,
beschrieben in einer `plugin.json` — Ordner hineinlegen, neu starten, fertig.
Serverregeln sind das erste Plugin im neuen Format.

338 Tests grün, 0 npm-Audit-Funde. Alle drei Images gebaut und im Container
geprüft: alle Seiten leiten ohne Login auf `/login` um, alle elf mitgelieferten
Bot-Funktionen laden, ein Plugin-Ordner wird ohne Neubau erkannt und im
Dashboard angezeigt, die automatische Sicherung läuft nachweislich (im Test mit
Minuten-Zeitplan beobachtet).

### Discord-Anfragen

Discord drosselt Bots, die zu oft fragen. Die API speichert deshalb zwischen:
Serverdaten 10 Minuten, Kanäle und Rollen 5, Mitgliederlisten 2. Parallele
Aufrufe derselben Daten werden zusammengefasst, statt mehrfach zu fragen, und
bei kurzen Sperren wartet die API selbstständig ab.

Eine Ausnahme: Die Rechteprüfung für Plugin-Kanäle hält nur 10 Sekunden. Wer in
Discord ein Recht setzt und im Dashboard nachsieht, ob es gewirkt hat, soll nicht
minutenlang den alten Stand sehen. Vertretbar, weil diese Abfrage nur auf einer
Plugin-Seite läuft — nicht im Layout und nicht bei jeder Aktion.

Wirkung: Fünf Seitenaufrufe im Dashboard kosten 3 Discord-Anfragen statt 15.
Moderationsaktionen verwerfen gezielt nur die Mitgliederliste – ein Kick ändert
schließlich nichts an Kanälen und Rollen.

### Rechte-Mechanik

Discord speichert je Kanal Ausnahmen mit Erlaubt- und Verboten-Bitfeldern; ein
Schreibzugriff ersetzt den Eintrag **vollständig**. Der Bot liest deshalb erst
den Bestand, führt ihn mit der Änderung zusammen und schreibt zurück — sonst
gingen nebenbei gesetzte Rechte verloren. Die Bit-Logik hat eigene Tests,
inklusive Bits jenseits von `Number.MAX_SAFE_INTEGER`.

### Später

- Leveling/XP mit Rangkarten
- Cross-Posting (News einmal schreiben, in mehreren Kanälen posten)
- Cloudflare Tunnel einrichten (braucht eine Domain)
- Sicherungen außer Haus (liegen derzeit im selben Volume wie die Datenbank)

## Lizenz

MIT — siehe [LICENSE](LICENSE). Nutzen, ändern und weitergeben ist erlaubt,
auch kommerziell. Ohne Gewährleistung: Wer den Bot betreibt, ist für seinen
Server und die dort gespeicherten Daten selbst verantwortlich.
