# Dashboard einrichten

Das Dashboard ist die Weboberfläche zum Bot. Statt Einstellungen per `curl` zu
setzen, klickst du sie zusammen — mit Dropdowns für Kanäle und Rollen, damit du
keine IDs mehr abtippen musst.

Voraussetzung: Bot und API laufen bereits (siehe [setup.md](setup.md)).

---

## Schritt 1: OAuth im Developer Portal einrichten

1. Geh auf https://discord.com/developers/applications und öffne **deine bestehende App** —
   dieselbe, aus der du den Bot-Token hast. Leg keine neue an.
2. Links auf **OAuth2**.
3. Bei **Client ID** auf **Copy** — das ist gleich `DISCORD_CLIENT_ID`.
4. Bei **Client Secret** auf **Reset Secret**, bestätigen, dann **Copy** —
   das ist `DISCORD_CLIENT_SECRET`.
5. Runterscrollen zu **Redirects** → **Add Redirect**. Trag dort exakt ein:

   ```
   http://DEINE-SERVER-IP:3000/api/auth/callback/discord
   ```

   Also zum Beispiel `http://192.168.1.50:3000/api/auth/callback/discord`.
   **Save Changes** nicht vergessen.

> **Die häufigste Fehlerquelle.** Die Redirect-URL muss zeichengenau mit dem
> übereinstimmen, was du später als `AUTH_URL` einträgst, plus dem Pfad
> `/api/auth/callback/discord`. Ein `https` statt `http`, ein Schrägstrich am
> Ende zu viel oder `localhost` statt der IP — und der Login scheitert mit
> `invalid redirect_uri`.

## Schritt 2: `.env` ergänzen

Öffne die `.env` neben der `docker-compose.yml` und trag zusätzlich ein:

```
DISCORD_CLIENT_ID=die_client_id_aus_schritt_1
DISCORD_CLIENT_SECRET=das_client_secret_aus_schritt_1
AUTH_SECRET=ein_eigenes_langes_geheimnis
AUTH_URL=http://192.168.1.50:3000
```

`AUTH_SECRET` verschlüsselt die Login-Sitzungen. Nimm einen **eigenen** Wert,
nicht denselben wie `API_TOKEN`:

```bash
openssl rand -hex 32
```

Bei `AUTH_URL` die echte IP deines Servers eintragen — dieselbe wie in der
Redirect-URL aus Schritt 1.

## Schritt 3: Starten

```bash
cd /mnt/user/appdata/discord-allrounder && docker compose up -d --build
```

Das `--build` ist nötig, weil das Dashboard neu dazugekommen ist.

Prüfen:

```bash
docker compose ps
```

Alle drei Container sollten laufen: `allrounder-bot`, `allrounder-api`,
`allrounder-dashboard`.

Dann im Browser `http://DEINE-SERVER-IP:3000` aufrufen.

---

## Was du dort tun kannst

**Übersicht** — die Startseite jedes Servers. Vier Kacheln zeigen, ob Automod
und Willkommen laufen, wie viele Verstöße es in sieben Tagen gab und wann der
nächste Post ansteht. Darunter: Verstöße nach Regel aufgeschlüsselt,
Wiederholungstäter, und ein Hinweiskasten bei Einstellungen, die zwar
eingeschaltet sind aber nichts bewirken — etwa ein Link-Filter mit leerer
Whitelist, der dann jeden Link löscht.

**Einstellungen** — Automod und Willkommensnachricht. Kanäle und Rollen kommen
als Dropdown direkt aus deinem Server. Der Begrüßungstext hat eine Live-Vorschau,
die zeigt, wie die Nachricht mit eingesetzten Platzhaltern aussieht. Die
Eskalationsstufen lassen sich frei umstellen.

**Geplante Posts** — wiederkehrend oder einmalig. Für den Zeitplan gibt es
Vorlagen („Täglich um 9:00“), Cron-Syntax brauchst du nur für Sonderfälle.

**YouTube** — Kanäle beobachten. Du kannst die Kanal-URL einfügen, die ID wird
daraus gezogen.

**Verstöße** — wer wurde wann warum bestraft, filterbar nach User-ID.
Wiederholungstäter sind mit der Anzahl markiert. Löschen entfernt den Verstoß
auch aus der Eskalationszählung.

**Wizard** — Interessens-Symbole anlegen, mit denen sich Mitglieder Kanäle
freischalten. Mit Live-Vorschau. Ausführlich in
[wizard-und-rechte.md](wizard-und-rechte.md).

**Rechte** — Kanalrechte gebündelt setzen statt jeden Kanal einzeln. Vorschau
vorab, Zurücknehmen im Verlauf.

**Funktionen** — Reaction Roles, Umfragen und das Ticket-Panel anlegen.
Ausführlich in [funktionen.md](funktionen.md).

**Mitglieder** — die Mitgliederliste mit Verstoßzahlen, auffällige zuerst.
Verwarnen, Timeout, Kick und Ban direkt von hier; jede Maßnahme zählt in die
Automod-Eskalation mit und landet im Audit-Log mit deiner Discord-ID.

**Befehle** — eigene Textbefehle anlegen, Nachrichten-Log einsehen,
Sicherungen verwalten. Ausführlich in
[befehle-und-sicherung.md](befehle-und-sicherung.md).

**Audit-Log** — die letzten 100 Ereignisse, mit Namen statt IDs.

---

## Farbe

Das Dashboard nimmt die Akzentfarbe aus dem Icon des jeweiligen Servers.
Verwaltest du mehrere, bekommt jeder sein eigenes Farbkleid — praktisch, um
nicht versehentlich im falschen Server zu schrauben. Bei grauem oder fehlendem
Icon bleibt es beim ArcanePixels-Violett.

Einstellen musst du dafür nichts.

## Wer darf was

Der Login läuft über Discord. Du siehst **nur die Server, auf denen du
tatsächlich Administrator bist oder „Server verwalten“ darfst** — geprüft wird
gegen die echten Discord-Berechtigungen, nicht gegen eine eigene Nutzerliste.
Verlierst du die Rolle auf dem Server, verlierst du auch den Zugriff hier, ohne
dass jemand etwas umstellen muss.

Die Prüfung passiert bei **jedem** Seitenaufruf und bei **jeder** Änderung neu,
nicht nur einmal beim Anmelden.

---

## Wenn etwas nicht klappt

**`invalid redirect_uri` beim Login**
→ Die Redirect-URL im Developer Portal stimmt nicht mit `AUTH_URL` überein.
Beide vergleichen, Zeichen für Zeichen. Nach dem Ändern der `.env` ein
`docker compose up -d` ausführen, damit sie neu eingelesen wird.

**„Auf keinem deiner Server hast du Administrator-Rechte“**
→ Du bist auf keinem Server Admin, oder Discord hat die Rechte noch gecacht.
Einmal abmelden und neu anmelden.

**Kanäle/Rollen erscheinen nicht in den Dropdowns**
→ Die API kann sie nicht laden. Prüfen:

```bash
docker compose logs api --tail 20
```

Steht dort `Kein DISCORD_TOKEN gesetzt`, fehlt der Token beim API-Container —
`docker compose up -d` nach dem Ergänzen der `.env`.

**„Bot-API nicht erreichbar“**
→ Der API-Container läuft nicht. `docker compose ps` prüfen.

**Dashboard startet nicht**

```bash
docker compose logs dashboard --tail 30
```

Fehlt eine der Pflichtvariablen, steht das dort als klare Meldung.

---

## Zugriff von außen

Läuft der Zugriff über eine Portweiterleitung, ist die Verbindung
**unverschlüsselt** — Session-Cookies gehen im Klartext durchs Netz. Für
Anmeldungen aus fremden WLANs solltest du einen **Cloudflare Tunnel**
davorsetzen: HTTPS inklusive, kein offener Port am Router.

Der Tunnel ist als optionales Compose-Profil vorbereitet:

```bash
docker compose --profile tunnel up -d
```

Einrichtung Schritt für Schritt in [cloudflare-tunnel.md](cloudflare-tunnel.md).
