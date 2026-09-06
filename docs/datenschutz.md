# Was der Bot speichert

Diese Übersicht richtet sich an alle, die den Bot **selbst betreiben**. Wer ihn
auf seinem Server einsetzt, ist für die dort gespeicherten Daten verantwortlich —
nicht die Entwickler.

Alles landet in einer einzigen SQLite-Datei auf **deinem** Server. Es gibt keinen
zentralen Dienst, keine Telemetrie, keine Übermittlung an Dritte. Nach außen
spricht der Bot ausschließlich mit Discord und (falls eingerichtet) mit
YouTubes RSS-Feeds.

---

## Was gespeichert wird

| Bereich | Inhalt | Aufbewahrung |
|---|---|---|
| Einstellungen | Konfiguration je Server | bis zur Änderung |
| Verstöße | User-ID, Regel, Maßnahme, Grund, Zeitpunkt | dauerhaft, bis von Hand gelöscht |
| Audit-Log | wer hat wann was ausgelöst | die letzten Einträge, unbegrenzt |
| Geplante Posts | Kanal, Text, Zeitplan | bis zum Löschen |
| YouTube-Feeds | Kanal-ID, zuletzt gesehenes Video | bis zum Löschen |
| Reaction Roles | Nachricht, Emoji, Rolle | bis zum Löschen |
| Tickets | wer, wann, welcher Kanal, Status | dauerhaft |
| Umfragen | Frage, Antworten, **wer wofür gestimmt hat** | dauerhaft |
| Rechteänderungen | vorheriger Zustand je Kanal | bis zum Zurücknehmen |
| **Nachrichten-Log** | **Inhalte bearbeiteter und gelöschter Nachrichten** | einstellbar, Standard 30 Tage |

---

## Die beiden heiklen Punkte

### Nachrichten-Log

Das ist der einzige Bereich, der **Nachrichteninhalte** mitschreibt. Deshalb ist
er standardmäßig **aus** — das Einschalten sollte eine bewusste Entscheidung sein.

Wenn du ihn nutzt:

- Setz eine Aufbewahrungsfrist, die zu deinem Zweck passt (Standard 30 Tage)
- Nimm private oder besonders sensible Kanäle aus
- Sag deinen Mitgliedern, dass mitgeschrieben wird — etwa in den Serverregeln
- Der Log-Kanal sollte nur für das Team sichtbar sein

Einzelne Mitglieder kannst du auf Wunsch gezielt löschen:
Dashboard → Befehle → Nachrichten-Log.

### Abstimmungsverhalten

Umfragen speichern, **wer für welche Option gestimmt hat**. Das ist technisch
nötig, damit sich Stimmen zurücknehmen lassen — es bedeutet aber, dass
Abstimmungen nicht anonym sind. Wer die Datenbank lesen kann, sieht es.

Sag das dazu, wenn du über etwas Heikleres abstimmen lässt.

---

## Auskunft und Löschung

Wer nach seinen Daten fragt oder deren Löschung verlangt:

**Verstöße** — Dashboard → Verstöße, nach der User-ID filtern, einzeln löschen.

**Nachrichten-Log** — Dashboard → Befehle → Nachrichten-Log. Löschen für ein
einzelnes Mitglied ist über die API möglich:

```bash
curl -X DELETE -H "Authorization: Bearer DEIN_API_TOKEN" "http://localhost:8080/api/guilds/GUILD_ID/messagelog?userId=USER_ID"
```

**Alles zu einer Person** — es gibt keinen Ein-Klick-Weg. Die betroffenen
Tabellen sind `infractions`, `message_log`, `poll_votes`, `tickets` und
`audit_log`, jeweils über die Discord-User-ID.

---

## Sicherungen

Die automatische Sicherung legt eine vollständige Kopie der Datenbank an —
**inklusive Nachrichten-Log und Abstimmungsverhalten**.

Zwei Dinge folgen daraus:

- Der Zugriff ist auf `OWNER_IDS` beschränkt, nicht auf Server-Admins. Eine
  Sicherung enthält die Daten *aller* Server, die deine Installation nutzen.
- Löschst du Daten auf Wunsch einer Person, stecken sie noch in den alten
  Sicherungen. Sie verschwinden erst mit deren Aufbewahrungsfrist.

---

## Wenn du den Bot für andere betreibst

Sobald fremde Server deine Installation nutzen, verarbeitest du personenbezogene
Daten für Dritte. In der EU heißt das: Du brauchst eine Datenschutzerklärung,
ein Verzeichnis der Verarbeitungstätigkeiten, und je nach Konstellation einen
Auftragsverarbeitungsvertrag.

**Der einfachere Weg:** Jeder betreibt seine eigene Installation. Dann bleiben
die Daten dort, wo sie entstehen, und niemand haftet für fremde.

---

## Was der Bot NICHT tut

- Keine Telemetrie, keine Nutzungsstatistik nach außen
- Keine Weitergabe an Dritte
- Kein Mitlesen von Direktnachrichten
- Keine dauerhafte Speicherung normaler Nachrichten — nur bearbeitete und
  gelöschte, und das nur bei eingeschaltetem Nachrichten-Log

---

## Wenn mehrere Server denselben Bot nutzen

Ein Bot kann auf beliebig vielen Discord-Servern sein. Wer dort Administrator
ist, verwaltet seinen Server über dasselbe Dashboard. Was dabei geteilt wird und
was nicht:

### Getrennt — jeder sieht nur seinen Server

Alles, was im Dashboard eingestellt wird: Automod, Willkommensnachricht, Regeln,
Twitch-Kanäle, geplante Posts, Verstöße, Tickets, Audit-Log.

Jede Tabelle hat eine `guild_id`, jede Abfrage filtert danach. Wer sich anmeldet,
sieht ausschließlich Server, auf denen er selbst Administrator ist oder „Server
verwalten" darf — das fragt die API bei **jedem** Aufruf bei Discord nach, nicht
nur beim Login.

### Geteilt — technisch nötig, aber unbedenklich

| Eintrag | Warum das in Ordnung ist |
|---|---|
| `DISCORD_TOKEN` | Es ist *ein* Bot auf mehreren Servern — so funktionieren Discord-Bots. |
| `TWITCH_CLIENT_ID` / `_SECRET` | Nur ein Ausweis für „diese Anwendung darf fragen, wer live ist". Gibt **keinen** Zugriff auf dein Twitch-Konto: kein Streamen, kein Ändern, nur öffentliche Daten. Jeder Server trägt seine eigenen Kanäle ein. |

Einzige praktische Grenze: Twitch begrenzt Anfragen pro Anwendung. Bei einer
Handvoll Server ist das weit entfernt von jeder Schwelle.

### Nur für den Betreiber

| Eintrag | Bedeutung |
|---|---|
| `OWNER_IDS` | **Der wichtigste.** Nur wer hier steht, kann Sicherungen abrufen — und die enthalten die Daten *aller* Server. Trag hier ausschließlich deine eigene Discord-ID ein. |
| `AUTH_SECRET`, `API_TOKEN`, `DISCORD_CLIENT_SECRET` | Verlassen den Server nie, der Browser sieht sie nicht. |

> **Bevor du jemanden einlädst:** Prüf, dass in `OWNER_IDS` nur deine eigene
> Discord-ID steht. Ist der Eintrag leer, sind die Sicherungen für niemanden
> abrufbar — auch für dich nicht.

### Was du als Betreiber sehen kannst

Technisch alles, was der Bot sieht: Einstellungen, Verstöße und — falls jemand
den Nachrichten-Log einschaltet — die dort mitgeschriebenen Nachrichten seines
Servers. Die liegen auf **deiner** Platte.

Das ist keine Lücke, sondern die Folge davon, dass du den Bot betreibst. Sag es
den Leuten aber, bevor sie ihn nutzen — deren Mitglieder wissen nichts davon.

---

## Daten eines Servers löschen

Dashboard → **Einstellungen** → ganz unten „Alle Daten dieses Servers löschen".

Dort steht, wie viele Einträge betroffen sind. Zum Bestätigen muss die Server-ID
abgetippt werden — ein Klick allein löscht nichts.

Entfernt wird **alles**, was zu diesem Server gespeichert ist: Einstellungen,
Verstöße, geplante Posts, Regeln, Tickets, Panels, Nachrichten-Log und die Daten
aller Plugins. Andere Server bleiben unberührt.

> Das lässt sich nicht rückgängig machen. Wer nur den Bot loswerden will, kann
> ihn in Discord entfernen — die Daten bleiben dann erhalten, bis man sie
> bewusst löscht.

**Wird der Bot von einem Server entfernt**, löscht er von sich aus nichts. Er
schreibt nur einen Vermerk ins Log. Grund: Discord meldet dieses Ereignis auch
bei einer Störung — Daten dann wegzuwerfen wäre unumkehrbar und im Zweifel
falsch.

