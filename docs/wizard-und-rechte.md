# Setup-Wizard und Rechteverwaltung

Zwei Reiter im Dashboard, die zusammengehören:

- **Wizard** — Mitglieder klicken ein Symbol an und bekommen die passenden
  Kanäle freigeschaltet
- **Rechte** — Kanalrechte gebündelt setzen, statt jeden Kanal in Discord
  einzeln durchzuklicken

Beide ändern **echte Berechtigungen** auf deinem Server. Deshalb gibt es überall
eine Vorschau vorab und einen Verlauf zum Zurücknehmen.

---

## Voraussetzung: Rollenhierarchie

Der Bot kann nur Rollen vergeben und Rechte setzen, die **unter seiner eigenen
Rolle** liegen. Zieh die Bot-Rolle in den Servereinstellungen unter *Rollen*
weit nach oben.

Steht sie zu tief, meldet das Dashboard beim Anwenden „Nicht geklappt bei …" —
Discord verweigert die Änderung dann kanalweise.

---

## Setup-Wizard

### 1. Rollen in Discord anlegen

Für jedes Thema eine Rolle: `Gamer`, `Fotograf`, was auf deinem Server passt.
Rechte brauchen sie keine — die setzt der Wizard.

### 2. Interessens-Gruppen anlegen

Dashboard → **Wizard** → *Neu*. Je Gruppe:

| Feld | Bedeutung |
|---|---|
| Symbol | Das Emoji, auf das geklickt wird |
| Beschriftung | Was im Panel danebensteht |
| Rolle | Wer klickt, bekommt diese Rolle |
| Zugriff | Lesen, Lesen und schreiben, Sprachkanal, Verbergen |
| Kanäle | Was die Rolle freischaltet |

> **Kategorien sparen Arbeit.** Wählst du eine Kategorie statt einzelner Kanäle,
> erben die enthaltenen Kanäle das Recht automatisch. Oft reicht ein Eintrag.

### 3. Vorschau prüfen

Klick oben auf die Symbole — die Vorschau zeigt, welche Kanäle ein Mitglied
danach sieht. Ist für eine Gruppe kein Kanal hinterlegt, steht dort „Ohne
Wirkung" statt stillschweigend nichts zu tun.

### 4. Live schalten

Kanal für das Panel wählen, Überschrift eintragen, *Rechte setzen und Panel
posten*. Der Bot:

1. setzt die Kanalrechte für alle Gruppen
2. postet die Auswahl-Nachricht
3. hängt die Emojis an
4. legt das Ganze als Reaction-Role-Panel an

Die Klicks verarbeitet danach dasselbe Plugin wie bei normalen Reaction Roles —
das Panel taucht auch unter *Funktionen* auf.

---

## Rechte gebündelt setzen

Dashboard → **Rechte**. Rolle wählen, Rechtepaket wählen, Kanäle ankreuzen.
Über *Alle Textkanäle* / *Alle Sprachkanäle* geht das in einem Klick.

**Immer erst Vorschau.** Sie zeigt kanalweise, was passieren würde:

- *neu setzen* — bisher gab es dort keine Ausnahme für diese Rolle
- *ändern* — es gibt eine, sie wird angepasst
- *schon richtig* — nichts zu tun

Erst danach erscheint *Jetzt anwenden*.

### Die Rechtepakete

| Paket | Wirkung |
|---|---|
| Lesen | Kanal sehen und mitlesen, nicht schreiben |
| Lesen und schreiben | Der übliche Zugang inkl. Reaktionen und Anhängen |
| Sprachkanal betreten | Sehen, beitreten, sprechen |
| Verbergen | Kanal ist für die Rolle unsichtbar |
| Zurücksetzen | Ausnahme entfernen — es gelten wieder die Server-Rechte |

### Zurücknehmen

Jede Änderung landet im Verlauf mit dem Zustand davor. *Zurücknehmen* stellt ihn
wieder her — auch dort, wo vorher gar keine Ausnahme existierte.

---

## Was der Bot dabei technisch tut

Discord speichert je Kanal eine Liste von Ausnahmen, jede mit einem Erlaubt- und
einem Verboten-Feld. Ein Schreibzugriff **ersetzt diesen Eintrag vollständig**.

Der Bot liest deshalb erst den bestehenden Stand, führt ihn mit der Änderung
zusammen und schreibt das Ergebnis zurück. Rechte, die nichts mit der Änderung
zu tun haben, bleiben dadurch erhalten — würde er stumpf überschreiben, gingen
sie verloren.

Dieselbe Änderung zweimal anzuwenden ändert beim zweiten Mal nichts mehr.

---

## Wenn etwas nicht klappt

**„Nicht geklappt bei …" nach dem Anwenden**
→ Rollenhierarchie, oder dem Bot fehlt in genau diesem Kanal der Zugriff. Die
übrigen Kanäle wurden trotzdem gesetzt.

**Klick auf ein Symbol bewirkt nichts**
→ Entweder ist für die Gruppe kein Kanal hinterlegt (das Dashboard warnt davor),
oder die Bot-Rolle steht unter der zu vergebenden Rolle.

**Emoji erscheint nicht unter der Nachricht**
→ Bei eigenen Server-Emojis braucht der Bot Zugriff darauf. Unicode-Emojis
funktionieren immer.

**Ich habe versehentlich alles verborgen**
→ Reiter *Rechte* → Verlauf → *Zurücknehmen*. Notfalls das Paket
*Zurücksetzen* auf die betroffenen Kanäle anwenden, dann gelten wieder die
Server-Rechte.
