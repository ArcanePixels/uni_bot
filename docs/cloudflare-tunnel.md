# Zugriff von außen mit HTTPS

Aktuell läuft der Zugriff über DynDNS und Port 3000 — **unverschlüsselt**. Im
Heimnetz unkritisch, aber wenn du dich aus einem fremden WLAN anmeldest, gehen
Session-Cookies im Klartext durchs Netz. Wer mitliest, kann deine Sitzung
übernehmen und damit deinen Discord-Server verwalten.

Ein Cloudflare Tunnel behebt das: HTTPS inklusive, kein offener Port am Router,
und das DynDNS brauchst du dafür nicht mehr.

---

## Variante A: Mit eigener Domain (empfohlen, wenn du eine hast)

Feste Adresse wie `dashboard.deine-domain.de`, überlebt Neustarts.

### 1. Domain zu Cloudflare bringen

Kostenloses Konto auf https://dash.cloudflare.com anlegen, Domain hinzufügen und
die Nameserver beim Registrar auf die von Cloudflare umstellen. Das dauert bis
zu 24 Stunden.

### 2. Tunnel anlegen

Im Cloudflare-Dashboard: **Zero Trust → Networks → Tunnels → Create a tunnel**,
Typ *Cloudflared*, Namen vergeben. Du bekommst ein Token angezeigt — das
brauchst du gleich.

Unter **Public Hostnames** einen Eintrag anlegen:

| Feld | Wert |
|---|---|
| Subdomain | `dashboard` |
| Domain | deine Domain |
| Service Type | HTTP |
| URL | `dashboard:3000` |

`dashboard:3000` ist der Containername im Docker-Netz — nicht `localhost`.

### 3. In die `.env`

```
CLOUDFLARE_TUNNEL_TOKEN=das_token_aus_schritt_2
AUTH_URL=https://dashboard.deine-domain.de
```

### 4. Redirect-URL im Discord Developer Portal ergänzen

```
https://dashboard.deine-domain.de/api/auth/callback/discord
```

Die alte Adresse kannst du stehen lassen — mehrere Redirects sind erlaubt.
`AUTH_URL` kann aber nur eine sein.

### 5. Starten

```bash
docker compose --profile tunnel up -d
```

---

## Variante B: Ohne Domain (Schnelltest)

Cloudflare vergibt eine Zufallsadresse wie
`https://zufall-woerter-hier.trycloudflare.com`. Sofort nutzbar und
verschlüsselt — **aber die Adresse ändert sich bei jedem Neustart**.

Für den Discord-Login ist das unpraktisch, weil die Redirect-URL jedes Mal neu
eingetragen werden müsste. Zum Ausprobieren reicht es:

```bash
docker run --rm --network discord-allrounder_default cloudflare/cloudflared:latest tunnel --url http://dashboard:3000
```

Die Adresse steht in der Ausgabe. Zum dauerhaften Betrieb nimm Variante A.

---

## Danach

**Port 3000 am Router wieder schließen.** Der Tunnel baut die Verbindung von
innen nach außen auf — eine Freigabe ist nicht mehr nötig und wäre nur ein
offenes Einfallstor.

In der `docker-compose.yml` kannst du dann auch die Port-Veröffentlichung beim
Dashboard entfernen, damit es wirklich nur noch über den Tunnel erreichbar ist.

---

## Was der Tunnel nicht ist

Kein Ersatz für die Zugriffskontrolle. Wer die Adresse kennt, landet auf der
Login-Seite. Ins Innere kommt weiterhin nur, wer sich mit Discord anmeldet und
auf dem Server Admin ist.

Wenn du zusätzlich absichern willst, bietet Cloudflare Zero Trust eine
vorgelagerte Zugangsprüfung (Access) — dann muss man sich erst bei Cloudflare
ausweisen, bevor die Seite überhaupt lädt. Für ein privates Dashboard ist das
sinnvoll, aber nicht zwingend.
