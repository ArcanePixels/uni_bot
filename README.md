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
- **Plugin-System** — eigene Erweiterungen bekommen ihre Dashboard-Seite aus
  einer `plugin.json`. Ordner hineinlegen, neu starten, fertig — ohne Neubau
- **Dashboard** — alles davon im Browser einstellen, mit Discord-Login und
  Dropdowns für Kanäle und Rollen statt abgetippter IDs
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
bot/        Der Bot selbst, Plugins unter src/plugins/
api/        REST-API
dashboard/  Weboberfläche (Next.js) mit Discord-Login
docs/       Anleitungen
```

`shared/` existiert, damit das DB-Schema **nur an einer Stelle** definiert ist.
In der Vorgängerversion war es zwischen Bot und API dupliziert und musste bei
jeder Änderung doppelt gepflegt werden.

### Plugin-System

**Erweiterbar ohne Eingriff in den Bot-Code:** Datei nach `plugins/` legen, Bot
neu starten. Ein defektes Plugin wird übersprungen und im Log gemeldet — der Bot
startet trotzdem. Zwei Beispiele zum Abschauen: [`plugins/regeln/`](plugins/regeln) — das
Serverregeln-Plugin mit eigener Dashboard-Seite, beschrieben in
[docs/regeln-plugin.md](docs/regeln-plugin.md) — und
[`plugins/beispiel-geburtstag.js.txt`](plugins/beispiel-geburtstag.js.txt)
(schlicht, nur Bot-Teil).

Ein Plugin ist ein Objekt mit `name` und `setup(ctx)`. `setup` bekommt
`{ client, db, settings, infractions, audit }` und gibt Event-Handler zurück:

```js
export default {
  name: 'mein-plugin',
  setup({ settings }) {
    return {
      async messageCreate(message) { /* … */ },
    };
  },
};
```

Registriert wird es in `bot/src/index.js` im Array `PLUGINS`. Wirft ein Plugin
beim Behandeln eines Events, wird das geloggt und die übrigen laufen weiter —
ein defektes Modul legt den Bot nicht lahm.

Wie ein neues Plugin entsteht — inklusive Dashboard-Oberfläche ohne
Frontend-Arbeit — steht in [docs/plugin-entwickeln.md](docs/plugin-entwickeln.md).

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

Ein neues Plugin trägt dort einen Abschnitt ein und bekommt seine Oberfläche
geschenkt — Formular, Speichern, Ein-/Ausblendlogik inklusive. Am
Dashboard-Code ändert sich dabei nichts.

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

180 Tests grün, 0 npm-Audit-Funde. Alle drei Images gebaut und im Container
geprüft: alle Seiten leiten ohne Login auf `/login` um, alle elf Bot-Plugins
laden, die automatische Sicherung läuft nachweislich (im Test mit
Minuten-Zeitplan beobachtet).

### Discord-Anfragen

Discord drosselt Bots, die zu oft fragen. Die API speichert deshalb zwischen:
Serverdaten 10 Minuten, Kanäle und Rollen 5, Mitgliederlisten 2. Parallele
Aufrufe derselben Daten werden zusammengefasst, statt mehrfach zu fragen, und
bei kurzen Sperren wartet die API selbstständig ab.

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

## Lizenz

MIT — siehe [LICENSE](LICENSE). Nutzen, ändern und weitergeben ist erlaubt,
auch kommerziell. Ohne Gewährleistung: Wer den Bot betreibt, ist für seinen
Server und die dort gespeicherten Daten selbst verantwortlich.
