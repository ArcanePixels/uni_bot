# Twitch-Livemeldung

Der Bot meldet im Discord, wenn ein Twitch-Kanal live geht.

---

## Einrichten

### 1. Twitch-Anwendung anlegen

Auf [dev.twitch.tv/console/apps](https://dev.twitch.tv/console/apps) eine
Anwendung registrieren — kostenlos, dauert zwei Minuten.

| Feld | Wert |
|---|---|
| Name | frei wählbar, z. B. „Mein Discord-Bot" |
| OAuth Redirect URL | `http://localhost` (wird nicht benutzt, muss aber ausgefüllt sein) |
| Kategorie | Chat Bot |
| Client Type | **Confidential** (vertraulich) |

> **Warum vertraulich?** Nur so gibt Twitch ein Client-Secret aus — und ohne das
> kann der Bot sich nicht anmelden. „Öffentlich" ist für Apps gedacht, die beim
> Nutzer laufen (Browser, Handy) und nichts geheim halten können. Dein Bot läuft
> auf deinem Server, das Secret steht in der `.env` und verlässt die Maschine nie.

Danach **Client-ID** notieren und über *New Secret* ein **Client-Secret**
erzeugen. Das Secret wird nur einmal angezeigt.

### 2. In die `.env` eintragen

```
TWITCH_CLIENT_ID=deine_client_id
TWITCH_CLIENT_SECRET=dein_client_secret
```

```bash
docker compose up -d
```

### 3. Im Dashboard einstellen

Reiter **Twitch**:

1. **Kanäle** — Kanalname oder ganze Twitch-Adresse, beides geht
2. **Wohin und wie** — Discord-Kanal, optional eine Rolle zum Anpingen
3. Fertig. Der Bot meldet sich von selbst, sobald jemand live geht

---

## Wie schnell kommt die Meldung?

Es gibt zwei Wege. Beide laufen gleichzeitig, doppelte Meldungen sind
ausgeschlossen.

| Weg | Verzögerung | Voraussetzung |
|---|---|---|
| **Abfrage** | rund eine Minute | keine — läuft immer |
| **Webhook** | Sekunden | Domain mit HTTPS |

Ohne weitere Einrichtung läuft die Abfrage. Für die meisten reicht das.

### Webhook einrichten (schneller)

Beim Webhook meldet Twitch sich von selbst, sobald jemand live geht. Das
erfordert, dass **Twitch deinen Server erreichen kann**:

- eine **Domain oder Subdomain** (`bot.deine-domain.de`), die auf deinen Server
  zeigt
- ein gültiges **HTTPS-Zertifikat** auf Port 443
- ein Reverse Proxy davor, der auf die API weiterleitet

> **Eine IP-Adresse genügt nicht.** Twitch nimmt ausschließlich `https://` an,
> und ein Zertifikat gibt es nur für einen Domainnamen.

> **Wichtig beim Reverse Proxy:** Der Webhook gehört zur **API** (Port 8080),
> nicht zum Dashboard (Port 3000). Wer nur das Dashboard weiterleitet, bekommt
> bei `/twitch/webhook` eine 404 — und Twitch meldet die Anmeldung als
> `webhook_callback_verification_failed`.
>
> Für Caddy sieht das so aus:
>
> ```
> bot.deine-domain.de {
> 	handle /twitch/webhook* {
> 		reverse_proxy localhost:8080
> 	}
> 	handle {
> 		reverse_proxy localhost:3000
> 	}
> }
> ```

Dann in die `.env`:

```
TWITCH_WEBHOOK_URL=https://bot.deine-domain.de/twitch/webhook
TWITCH_WEBHOOK_SECRET=ein_langes_zufaelliges_geheimnis
```

Das Geheimnis frei wählen, mindestens 10 Zeichen. Erzeugen etwa mit:

```bash
openssl rand -hex 32
```

Der Bot meldet die Kanäle danach selbstständig bei Twitch an — beim Start und
jedes Mal, wenn du einen Kanal hinzufügst. Kanäle, die du entfernst, meldet er
wieder ab.

Im Log siehst du, ob es geklappt hat:

```bash
docker compose logs bot | grep -i twitch
```

| Zeile | Bedeutung |
|---|---|
| `Webhook bestätigt: … melden sich in Sekunden` | Alles richtig. |
| `Keine Anmeldung ist aktiv` | Twitch erreicht die Adresse nicht – meist ein Tippfehler in `TWITCH_WEBHOOK_URL` oder eine fehlende Proxy-Regel. |
| `Abfrage jede Minute. Für Meldung in Sekunden fehlt …` | Der Webhook ist nicht eingerichtet. |

> **Prüf die Adresse Zeichen für Zeichen.** Ein Tippfehler wie
> `bot.example.de.de` fällt sonst nirgends auf: Caddy antwortet, der Bot meldet
> „eingerichtet", und nur der Zustand bei Twitch verrät, dass nichts ankommt.

---

## Einstellungen

| Einstellung | Bedeutung |
|---|---|
| **Kanal** | wohin die Meldung kommt |
| **Rolle anpingen** | wird bei jeder Meldung erwähnt; leer lassen für keine Erwähnung |
| **Nachrichtentext** | Platzhalter: `{name}`, `{game}`, `{title}`, `{url}` |
| **Farbe** | Streifen links an der Nachricht |
| **Standbild** | Das große Bild unten in der Meldung. Aus: nur die Textzeile – kompakter bei vielen Kanälen |
| **Sperrzeit** | verhindert eine erneute Meldung, wenn jemand kurz hintereinander mehrfach live geht |

**Zur Sperrzeit:** Bricht die Verbindung eines Streamers kurz ab, ist er
technisch zweimal live gegangen. Ohne Sperre gäbe es zwei Meldungen mit Ping.
Die Voreinstellung von 60 Minuten fängt das ab. `0` schaltet die Sperre ab —
dieselbe Sendung wird trotzdem nie zweimal gemeldet.

Pro Server sind bis zu **25 Kanäle** möglich.

---

## Wie doppelte Meldungen verhindert werden

Twitch vergibt je Sendung eine ID, die über die ganze Sendung gleich bleibt.
Der Bot merkt sich, welche ID er zuletzt gemeldet hat.

Damit ist ausgeschlossen, dass Webhook und Abfrage dieselbe Sendung zweimal
melden — auch wenn beide sie kurz nacheinander sehen.

---

## Wenn etwas nicht klappt

**Der Reiter „Twitch" fehlt**
→ Liegt `plugins/twitch/` mit `plugin.json` und `bot.js` am richtigen Platz?
Danach `docker compose restart`.

**Keine Meldung, obwohl jemand live ist**

```bash
docker compose logs bot | grep -i twitch
```

Steht dort `TWITCH_CLIENT_ID/TWITCH_CLIENT_SECRET fehlen`, sind die Zugangsdaten
nicht angekommen. Steht dort `Twitch weist die Zugangsdaten ab`, stimmt eines
von beiden nicht.

**Der Bot postet nicht in den Kanal**
→ Die Rechteanzeige unter der Kanal-Auswahl sagt, welches Recht fehlt.
Meist „Links einbetten".

**Der Webhook meldet sich nie**
→ Prüf, ob die Adresse von außen erreichbar ist. Der Endpunkt nimmt nur POST an,
deshalb mit POST testen:

```bash
curl -s -o /dev/null -w "%{http_code}\n" -X POST -d '{}' https://bot.deine-domain.de/twitch/webhook
```

| Antwort | Bedeutung |
|---|---|
| `403` | **Alles richtig.** Der Endpunkt läuft und weist die unsignierte Anfrage korrekt ab. |
| `404` | `TWITCH_WEBHOOK_SECRET` fehlt in der `.env` der API — ohne Geheimnis gibt es den Endpunkt nicht. |
| `502`, `503` | Der Proxy erreicht die API nicht. |
| nichts / Zeitüberschreitung | Domain, Zertifikat oder Firewall. |

Ein `GET` auf dieselbe Adresse ergibt immer `404` — das ist normal und sagt
nichts darüber aus, ob der Webhook läuft.

Kommt bis hierher alles richtig, aber Twitch meldet sich trotzdem nicht, prüf
den **Zustand der Anmeldungen bei Twitch**:

```bash
docker compose exec bot node -e "import('@allrounder/shared/twitch').then(async m=>{const c=m.createTwitchClient({clientId:process.env.TWITCH_CLIENT_ID,clientSecret:process.env.TWITCH_CLIENT_SECRET});for(const s of await c.listSubscriptions())console.log(s.type,'|',s.status,'|',s.userId)})"
```

| Status | Bedeutung |
|---|---|
| `enabled` | Alles richtig, Twitch meldet sich beim Livegehen. |
| `webhook_callback_verification_failed` | Twitch hat den Endpunkt nicht erreicht. Meist leitet der Proxy `/twitch/webhook` nicht an die API weiter (siehe oben). |
| `webhook_callback_verification_pending` | Die Prüfung läuft noch – ein paar Sekunden warten. |

Steht dort mehrfach derselbe Kanal mit `..._failed`, ist das kein zweiter
Fehler: Fehlgeschlagene Anmeldungen zählen nicht als vorhanden, deshalb
versucht es der Bot stündlich erneut. Nach dem Beheben räumt er von selbst auf.

Auch das Log hilft:

```bash
docker compose logs bot | grep -i "angemeldet\|Anmeldung"
```

**Meldungen kommen doppelt**
→ Sollte nicht vorkommen. Prüf, ob versehentlich zwei Bot-Instanzen mit
derselben Datenbank laufen.

---

## Für Plugin-Entwickler

Das Plugin zeigt zwei Dinge, die über die
[Grundlagen](plugin-entwickeln.md) hinausgehen:

- **Ein Plugin mit äußerem Dienst**: Zugangsdaten aus der `.env`, Token-Verwaltung
  mit Erneuerung, Umgang mit Drosselung. Siehe `shared/src/twitch.js`.
- **Ein öffentlicher Endpunkt**: Der Webhook liegt außerhalb der Token-Prüfung
  und weist sich stattdessen per Signatur aus. Siehe
  `api/src/routes/twitch-webhook.js` — vor allem, warum dort `raw()` statt
  `express.json()` steht.
