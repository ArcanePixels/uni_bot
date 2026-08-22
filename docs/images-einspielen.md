# Fertige Images einspielen

> **Sonderfall.** Der normale Weg ist `docker compose up -d --build` direkt auf
> dem Server (siehe [aktualisieren.md](aktualisieren.md)). Diese Anleitung
> braucht nur, wer auf einem sehr langsamen Rechner betreibt.

Auf einem langsamen Server dauert das Bauen Stunden — vor allem `npm ci`, das
zehntausende kleine Dateien schreibt. Stattdessen werden die Images auf einem
schnellen Rechner gebaut und als Archiv übertragen. Auf dem Server wird dann nur
noch entpackt: Minuten statt Stunden.

---

## Auf dem Server einspielen

Kopier `dist/allrounder-images.tar.gz` nach `/mnt/user/appdata/discord-allrounder/`
(z. B. über die Unraid-Freigabe im Explorer), dann:

```bash
cd /mnt/user/appdata/discord-allrounder && docker load < allrounder-images.tar.gz
```

Erwartete Ausgabe:

```
Loaded image: allrounder-bot:latest
Loaded image: allrounder-api:latest
Loaded image: allrounder-dashboard:latest
```

Dann starten:

```bash
docker compose up -d
```

Compose nimmt die geladenen Images und baut **nicht** neu.

---

## Was auf den Server gehört

Nur zwei Dateien sind zwingend nötig:

- `docker-compose.yml`
- `.env` mit deinen Werten

Der Quellcode muss dort **nicht** liegen. Das Archiv kannst du nach dem
`docker load` löschen.

---

## Nach einer Codeänderung

1. Auf dem schnellen Rechner neu bauen und exportieren:

```bash
cd /pfad/zum/projekt && docker compose build && docker save allrounder-bot:latest allrounder-api:latest allrounder-dashboard:latest | gzip -6 > dist/allrounder-images.tar.gz
```

2. Archiv auf den Server kopieren, dort:

```bash
cd /mnt/user/appdata/discord-allrounder && docker load < allrounder-images.tar.gz && docker compose up -d
```

Compose erkennt die neuen Images und startet die betroffenen Container neu.

---

## Hinweise

**Architektur:** Die Images sind für `linux/amd64` gebaut. Läuft dein Server auf
ARM, brauchst du stattdessen `docker buildx build --platform linux/arm64`.

**Alte Images aufräumen** — nach mehreren Aktualisierungen sammeln sich
namenlose Altbestände an:

```bash
docker image prune -f
```

Das entfernt nur Images, die kein Container mehr nutzt.

**Wenn doch auf dem Server gebaut werden soll:** Der `build:`-Abschnitt steht
weiterhin in der `docker-compose.yml`. Mit `docker compose build` greift er —
dann muss aber der komplette Quellcode dort liegen.

---

## Warum das Bauen so lange dauert

Bei Unraid liegt der Docker-Speicher oft auf dem Cache-Datenträger. Ist das ein
USB-Stick statt einer SSD, brechen viele kleine Schreibvorgänge dramatisch ein —
sequenziell wirkt ein Stick schnell, aber genau dieses Muster ist sein
schlechtester Fall. Im beobachteten Fall brauchte allein `COPY package.json`
über 500 Sekunden.

Ein Wechsel auf eine echte SSD als Cache würde das lösen. Solange das nicht
ansteht, ist der Weg über fertige Images die bessere Lösung.
