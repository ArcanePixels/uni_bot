# Setup-Anleitung

Diese Anleitung führt dich Schritt für Schritt durch die Einrichtung. Du brauchst
keine Programmierkenntnisse — nur Docker auf dem Rechner, auf dem der Bot laufen soll.

---

## Schritt 1: Bot bei Discord anlegen

1. Geh auf https://discord.com/developers/applications und melde dich an.
2. Klick oben rechts auf **New Application**, gib einen Namen ein, bestätige.
3. Wechsle links auf **Bot**.
4. Klick bei **Token** auf **Reset Token** und dann auf **Copy**.
   Diesen Token brauchst du gleich — er wird nur einmal angezeigt.
   **Der Token ist wie ein Passwort. Niemals weitergeben oder in ein öffentliches Repo committen.**
5. Scroll auf derselben Seite runter zu **Privileged Gateway Intents** und
   aktiviere beide Schalter:
   - **Server Members Intent** (nötig für Willkommensnachricht und Autorole)
   - **Message Content Intent** (nötig für den Automod — ohne das sieht der Bot keine Nachrichtentexte)

   Ohne diese beiden Schalter startet der Bot zwar, tut aber nichts.

## Schritt 2: Bot auf deinen Server einladen

1. Links auf **OAuth2** → **URL Generator**.
2. Unter **Scopes** ankreuzen: `bot`
3. Unter **Scopes** zusätzlich ankreuzen: `applications.commands`
   (für die Slash-Befehle wie `/warn`)
4. Unter **Bot Permissions** ankreuzen:

   | Berechtigung | Wofür |
   |---|---|
   | Send Messages, Read Message History | überall nötig |
   | Manage Roles | Autorole, Reaction Roles, Setup-Wizard, Rechtevergabe |
   | Kick Members, Ban Members, Moderate Members | Automod-Eskalation und Moderation |
   | Manage Messages | Regelverstöße löschen, `/clear` |
   | Manage Channels | Ticket-System (legt private Kanäle an) |
   | Add Reactions | Reaction Roles und Umfragen |
   | Manage Server | Anti-Raid-Schutz (setzt die Verifizierungsstufe hoch) |

   Brauchst du eine Funktion nicht, kannst du die zugehörige Berechtigung
   weglassen — der Rest läuft trotzdem. **Manage Server** ist die
   weitreichendste; ohne sie meldet der Anti-Raid-Schutz zwar, ändert aber nichts.

5. Ganz unten die generierte URL kopieren, im Browser öffnen, Server auswählen.

> **Wichtig zur Rollenhierarchie:** Discord erlaubt einem Bot nur, mit Rollen
> und Mitgliedern zu arbeiten, die **unter** ihm in der Rollenliste stehen. Zieh
> die Rolle des Bots in den Servereinstellungen unter *Rollen* möglichst weit
> nach oben.
>
> Steht sie zu tief, schlagen Kick und Ban fehl, Reaction Roles vergeben keine
> Rollen und die Rechtevergabe im Dashboard meldet Fehler — jeweils ohne dass
> auf den ersten Blick klar wäre, warum.

## Schritt 3: Dateien ablegen und `.env` ausfüllen

Leg den Projektordner auf dem Server ab (bei Unraid z. B. unter
`/mnt/user/appdata/discord-allrounder/`). Dann im Projektordner:

```bash
cp .env.example .env
```

Öffne die `.env` und trag ein:

- `DISCORD_TOKEN` — der Token aus Schritt 1
- `API_TOKEN` — ein selbst gewähltes langes Geheimnis. Erzeugen z. B. mit:

```bash
openssl rand -hex 32
```

## Schritt 4: Starten

```bash
docker compose up -d
```

Beim ersten Mal dauert das ein paar Minuten, weil die Images gebaut werden.
Prüfen, ob alles läuft:

```bash
docker compose logs -f
```

Erwartete Ausgabe: `Angemeldet als DeinBot#1234 auf 1 Server(n)` und
`[api] Lauscht auf Port 8080`.

Beenden mit `Strg+C` (stoppt nur die Log-Ansicht, nicht die Container).

## Schritt 5: Prüfen, ob die API antwortet

```bash
curl http://localhost:8080/health
```

Antwort sollte `{"ok":true}` sein.

---

## Schritt 6: Dashboard einrichten

Der Bot läuft jetzt, ist aber noch nicht konfiguriert. Alles Weitere machst du
im Browser — dafür braucht es einmalig den Discord-Login:

**→ [dashboard.md](dashboard.md)**

Dort trägst du `DISCORD_CLIENT_ID`, `DISCORD_CLIENT_SECRET`, `AUTH_SECRET` und
`AUTH_URL` in die `.env` nach und startest neu. Danach ist das Dashboard unter
`http://DEINE-SERVER-IP:3000` erreichbar.

---

## Was du danach einrichten solltest

Alles im Dashboard, keine Kommandozeile nötig:

| Wo | Was |
|---|---|
| **Einstellungen → Automod** | Wortfilter, Spam-Schutz, Eskalationsstufen |
| **Einstellungen → Willkommen** | Begrüßungstext und Autorole |
| **Einstellungen → Anti-Raid** | Schutz vor Massen-Beitritten |
| **Posts** | wiederkehrende Ankündigungen |
| **YouTube** | Kanäle, deren Uploads gepostet werden |
| **Funktionen** | Reaction Roles, Umfragen, Ticket-System |
| **Befehle** | eigene Textbefehle wie `!regeln` |

Ausführlich: [funktionen.md](funktionen.md) und
[wizard-und-rechte.md](wizard-und-rechte.md).

**Die Slash-Befehle** (`/warn`, `/history`, `/timeout`, `/clear`, `/befehle`)
meldet der Bot beim Start selbst bei Discord an — dafür musst du nichts tun.
Nach dem ersten Start kann es ein paar Minuten dauern, bis sie überall
erscheinen. Übersicht im Dashboard unter *Befehle → Eingebaute Befehle*.

---

## Die Konfiguration per API

Das Dashboard ist der übliche Weg. Wer skripten will, kann die API auch direkt
ansprechen — sie ist nur auf `127.0.0.1` erreichbar, also vom Server selbst aus.

Ersetze `DEIN_TOKEN` durch den Wert aus der `.env` und `GUILD_ID` durch die ID
deines Discord-Servers (Rechtsklick auf den Server → *Server-ID kopieren*;
dafür muss unter *Erweitert* der Entwicklermodus an sein).

```bash
curl -H "Authorization: Bearer DEIN_TOKEN" http://localhost:8080/api/guilds/GUILD_ID/settings
```

| Methode | Pfad | Zweck |
|---|---|---|
| GET | `/health` | Healthcheck, ohne Token |
| GET/PUT | `/api/guilds/:id/settings` | Einstellungen lesen und ändern |
| GET/DELETE | `/api/guilds/:id/infractions` | Verstöße |
| GET/POST/DELETE | `/api/guilds/:id/scheduled` | Geplante Posts |
| GET/POST/DELETE | `/api/guilds/:id/youtube` | YouTube-Feeds |
| POST | `/api/guilds/:id/youtube/check` | Prüfung anfordern |
| GET | `/api/guilds/:id/audit` | Audit-Log |
| GET | `/api/guilds/:id/members` | Mitglieder |
| POST | `/api/guilds/:id/moderate` | Verwarnen, Timeout, Kick, Ban |
| GET/POST/DELETE | `/api/guilds/:id/commands` | Eigene Textbefehle |
| GET/DELETE | `/api/guilds/:id/messagelog` | Nachrichten-Log |
| GET/POST | `/api/system/backups` | Sicherungen (nur `OWNER_IDS`) |

Ein `PUT` auf `/settings` wird mit den bestehenden Werten zusammengeführt — du
musst also nicht alles mitschicken.

---

## Eigene Erweiterungen

Der Bot lässt sich um eigene Plugins erweitern, ohne den Code anzufassen: Datei
nach `plugins/` legen, Bot neu starten. Ein vollständiges Beispiel und die
Beschreibung aller Schnittstellen stehen in
[plugin-entwickeln.md](plugin-entwickeln.md).

## Wie der Automod eskaliert

Jeder Verstoß wird gezählt. Die Stufe richtet sich nach der Gesamtzahl der
Verstöße innerhalb der letzten `decayDays` (Standard 30 Tage):

| Verstöße | Maßnahme |
|---|---|
| 1–2 | Verwarnung (Nachricht wird gelöscht) |
| 3–4 | Timeout 10 Minuten |
| 5–6 | Kick |
| ab 7 | Ban |

Anpassbar über `automod.escalation`. Mitglieder mit der Berechtigung
*Nachrichten verwalten* sowie Rollen in `automod.exemptRoles` sind ausgenommen.

---

## Wenn etwas nicht klappt

**Bot ist online, reagiert aber nicht auf verbotene Wörter**
→ Message Content Intent nicht aktiviert (Schritt 1.5). Nach dem Aktivieren
`docker compose restart bot`.

**Kick/Ban schlägt fehl, Verstoß wird trotzdem geloggt**
→ Rollenhierarchie: Die Bot-Rolle muss über der Rolle des Mitglieds stehen.
Im Log steht dann `Massnahme "kick" gegen … fehlgeschlagen`.

**Keine Willkommensnachricht**
→ Server Members Intent nicht aktiviert, oder Willkommen ist ausgeschaltet.

**Klick auf ein Reaction-Role-Emoji bewirkt nichts**
→ Rollenhierarchie (siehe oben), oder dem Bot fehlt *Manage Roles*.

**Ticket-Kanal wird nicht angelegt**
→ Dem Bot fehlt *Manage Channels*, oder das Ticket-System ist ausgeschaltet.

**Slash-Befehle erscheinen nicht**
→ Discord verteilt sie mit Verzögerung. Ein Neuladen des Clients (`Strg+R`)
hilft meist. Fehlte beim Einladen der Scope `applications.commands`, musst du
den Bot mit einer neuen Einladungs-URL erneut hinzufügen.

**Eigene Textbefehle antworten nicht**
→ Sie sind standardmäßig aus (Einstellungen → Eigene Befehle). Hört ein anderer
Bot auf dasselbe Präfix, stell auf etwas Eigenes um, etwa `!!`.

**Sicherungen sind im Dashboard nicht abrufbar**
→ Deine Discord-User-ID muss in `OWNER_IDS` stehen. Eine Sicherung enthält die
Daten aller Server — deshalb ist der Zugriff nicht an die Server-Admin-Rolle
gebunden.

**Ein eigenes Plugin lädt nicht**
→ Der Grund steht im Log. Der Bot startet trotzdem und überspringt es.

**`DISCORD_TOKEN fehlt`**
→ Die `.env` liegt nicht im selben Ordner wie die `docker-compose.yml`, oder der
Wert ist leer.

**API antwortet mit 401**
→ Token stimmt nicht mit `API_TOKEN` in der `.env` überein. Nach Änderung der
`.env` ist ein `docker compose up -d` nötig, damit sie neu eingelesen wird.

**Logs ansehen**

```bash
docker compose logs -f bot
```

Für mehr Details `LOG_LEVEL=debug` in die `.env` und neu starten.

---

## Zugriff von außen

Die API ist bewusst nur auf `127.0.0.1` gebunden. Das Dashboard dagegen ist im
Heimnetz erreichbar.

Willst du von unterwegs ran, gibt es zwei Wege:

- **Portweiterleitung am Router** — funktioniert, aber die Verbindung ist
  **unverschlüsselt**. Login und Sitzungs-Cookies gehen im Klartext durchs Netz.
  Aus fremden WLANs ist das riskant.
- **Cloudflare Tunnel** — baut die Verbindung von innen nach außen auf, bringt
  HTTPS mit, kein offener Port nötig. Als Compose-Profil vorbereitet, siehe
  [cloudflare-tunnel.md](cloudflare-tunnel.md).

---

## Datensicherung

**Läuft automatisch** — standardmäßig täglich um 4 Uhr, mit 14 Tagen
Aufbewahrung. Im Dashboard unter *Befehle → Sicherungen* einsehbar und von Hand
auslösbar.

Damit du dort herankommst, muss deine Discord-User-ID in `OWNER_IDS` stehen
(siehe `.env.example`).

Eine Sicherung enthält die Daten **aller** Server, die deine Installation nutzt —
deshalb ist der Zugriff bewusst nicht an die Server-Admin-Rolle gebunden.

> **Die Sicherungen liegen im selben Docker-Volume wie die Datenbank.** Bei
> einem Plattenschaden wären beide weg. Wie du sie außer Haus kopierst und wie
> das Wiederherstellen geht, steht in
> [befehle-und-sicherung.md](befehle-und-sicherung.md).
