# Serverregeln

Regeln im Dashboard zusammenstellen, der Bot postet sie als Embed und hält sie
aktuell.

Das ist gleichzeitig ein **Beispiel für ein vollständiges Plugin** — es zeigt,
wie ein Plugin eigene Tabellen anlegt, eine Dashboard-Seite bekommt und mit dem
Bot zusammenspielt.

---

## Benutzen

Dashboard → **Regeln**.

1. **Regeln anlegen** — ein Satz je Regel reicht. Die Nummerierung vergibt der
   Bot; mit ↑ und ↓ änderst du die Reihenfolge. Symbol und Überschrift sind
   optional.
2. **Darstellung** — in welchen Kanal, welche Überschrift, welche Farbe.
Der Bot postet **von selbst**, sobald du etwas änderst — anlegen, ändern,
löschen oder sortieren. Du musst nichts drücken.

Jede weitere Änderung **bearbeitet die bestehende Nachricht**, statt eine neue zu
posten. So bleibt der Kanal sauber und Verlinkungen auf die Regeln funktionieren
weiterhin.

Der Knopf **Erneut posten** ist nur für den Fall gedacht, dass jemand die
Nachricht in Discord gelöscht hat.

Wurde die Nachricht in Discord gelöscht, postet der Bot beim nächsten Mal
automatisch eine neue.

### `!regeln`

Moderatoren können die Regeln mit `!regeln` in jedem Kanal anzeigen — praktisch,
wenn jemand danach fragt. Der Befehl ist bewusst auf Mods beschränkt, damit er
nicht als Spam missbraucht wird.

> Der Befehl hört fest auf `!regeln`, unabhängig vom Präfix der eigenen
> Textbefehle. Nutzt du ein anderes Präfix und willst es einheitlich haben, leg
> zusätzlich einen eigenen Textbefehl an.

### Zwei Darstellungen

Der Bot entscheidet selbst, wie er die Regeln setzt:

**Ohne Überschriften** — eine schlichte nummerierte Liste. Das ist der Normalfall:

```
🤝 1. Seien Sie cool, freundlich und respektvoll zueinander.
   2. Halten Sie Ihr Discord-Profil angemessen.
   3. Spam ist nicht erlaubt.
```

**Mit Überschriften** — sobald auch nur eine Regel eine hat, bekommt jede Regel
ihren eigenen Block. Sinnvoll, wenn du Regeln ausführlicher erklären willst:

```
🤝 1. Respekt
   Sei respektvoll zu allen Mitgliedern.
```

Du musst dafür nichts einstellen. Lass die Überschrift leer, und es bleibt bei
der Aufzählung.

### Grenzen

- **Ohne Überschriften**: zusammen höchstens 4096 Zeichen — das reicht für rund
  40 normale Regeln
- **Mit Überschriften**: höchstens 25 Regeln, mehr Felder erlaubt Discord nicht
- Regeltext höchstens 500 Zeichen, Überschrift höchstens 200
- Discord-Formatierung funktioniert: `**fett**`, `*kursiv*`

Wird es zu lang, sagt der Bot das im Log — statt dass Discord den Post
kommentarlos ablehnt.

---

## Wie es aufgebaut ist

Das Plugin besteht aus zwei Dateien:

| Datei | Rolle |
|---|---|
| `plugins/regeln/plugin.json` | Beschreibt die Oberfläche: die Liste der Regeln, das Formular für die Darstellung, den Knopf zum Posten |
| `plugins/regeln/bot.js` | Baut die Discord-Nachricht und postet sie |

**Kein API-Code, keine eigenen Tabellen.** Beides entsteht aus der
`plugin.json`: Das Grundsystem legt `plugin_regeln_config` und
`plugin_regeln_items` an, stellt die Endpunkte bereit und prüft die Eingaben
gegen das, was im Manifest steht.

### Warum die Oberfläche als Beschreibung vorliegt

Next.js kompiliert seine Seiten beim Bauen — im fertigen Container steckt kein
Compiler mehr. Käme die Seite als React-Code aus dem Plugin-Ordner, müsste jeder
Nutzer das Dashboard neu bauen. Deshalb hat das Dashboard die Bausteine fest
eingebaut, und das Plugin sagt nur, welche es haben will.

Der sichtbare Preis: Die frühere Live-Vorschau gibt es nicht mehr, weil sie
Spezialcode war. Der Gewinn: Das Plugin lässt sich weitergeben, ohne dass
jemand etwas bauen muss.

### Wie Bot und Dashboard sich verständigen

Bot und API sind getrennte Prozesse — die API kann das Posten nicht direkt
auslösen. Sie setzt deshalb eine Markierung, und das Plugin sieht alle fünf
Sekunden nach.

Wichtig dabei: Das Plugin **hakt die Markierung immer ab**, auch wenn das Posten
scheitert — etwa weil der Kanal gelöscht wurde. Ohne das würde es endlos
weiterversuchen.

### Was sich das Plugin selbst merkt

Die ID der geposteten Nachricht steht nicht im Formular, sondern auf dem
Merkzettel des Plugins (`store.setState`). Sie geht den Nutzer nichts an, und
umgekehrt soll der Bot die Einstellungen nicht überschreiben.

---

## Als Vorlage nutzen

Willst du etwas Ähnliches bauen, sind das die Stellen zum Abschauen:

1. **`plugins/regeln/plugin.json`** — alle drei Abschnittstypen in Gebrauch
2. **`plugins/regeln/bot.js`** — Timer, Aufräumen, Merkzettel
3. **`bot/test/regeln-plugin.test.js`** — wie man ein Plugin testet, ohne
   Discord zu brauchen

Alle Bausteine und Felder stehen in
[plugin-entwickeln.md](plugin-entwickeln.md).

---

## Wenn etwas nicht klappt

**Der Reiter „Regeln" fehlt**
→ Liegt der Ordner `plugins/regeln/` mit `plugin.json` und `bot.js` am richtigen
Platz? Läuft danach ein `docker compose restart`? Das Log sagt, was gefunden wurde:

```bash
docker compose logs api --tail 20 | grep -i plugin
```

**Die Regeln erscheinen nicht in Discord**
→ Ist ein Kanal gewählt? Steht dort mindestens eine Regel? Und läuft das Plugin?

```bash
docker compose logs bot --tail 30 | grep regeln
```

**„im Kanal #… fehlt: …"**
→ Dem Bot fehlt ein Recht in genau diesem Kanal. Discord → Kanal bearbeiten →
Berechtigungen → Rolle des Bots. Nötig sind drei:

| Recht | Wofür |
|---|---|
| Kanal ansehen | überhaupt hineinkommen |
| Nachrichten senden | posten |
| **Links einbetten** | die Regel-Nachricht darstellen |
| **Nachrichtenverlauf anzeigen** | die eigene alte Nachricht wiederfinden und bearbeiten |

„Links einbetten" wird am häufigsten übersehen — der Name klingt nicht nach
Embeds, ist aber genau dafür nötig. Achte auf kanalspezifische Überschreibungen:
Der Bot kann serverweit alles dürfen und trotzdem hier blockiert sein.

**„Missing Permissions" im Log (ältere Version)**
→ Dasselbe in Grün. Seit dieser Version nennt der Bot das fehlende Recht selbst.

**„Kanal nicht erreichbar"**
→ Der Kanal wurde gelöscht oder der Bot sieht ihn nicht. Wähl einen anderen und
speichere erneut.

**Änderungen kommen nicht an**
→ Der Bot prüft alle fünf Sekunden. Passiert nach einer halben Minute nichts,
läuft das Plugin vermutlich nicht — siehe Log.
