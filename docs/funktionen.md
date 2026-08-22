# Reaction Roles, Umfragen, Tickets, Anti-Raid

Alles im Dashboard unter **Funktionen** bzw. **Einstellungen**.

---

## Wichtig vorab: Rollenhierarchie

Der Bot kann nur Rollen vergeben, die **unter seiner eigenen** stehen. Zieh die
Bot-Rolle in den Servereinstellungen unter *Rollen* möglichst weit nach oben —
sonst passiert beim Klick auf ein Emoji schlicht nichts, und im Log steht
`Rolle … konnte nicht vergeben werden`.

Dasselbe gilt für Kick und Ban aus der Mitgliederliste.

---

## Reaction Roles

Mitglieder vergeben sich Rollen selbst, indem sie auf ein Emoji klicken.

**Anlegen:** Dashboard → Funktionen → Reaction Roles. Kanal wählen, Überschrift
eintragen, dann Emoji-Rolle-Paare hinzufügen. Der Bot postet die Nachricht und
hängt die Emojis selbst an.

**Zwei Modi:**

- *Beliebig viele Rollen* — jeder nimmt sich, was er will
- *Nur eine Rolle* — wählt jemand eine andere, wird die vorherige entfernt.
  Praktisch für Dinge wie Zeitzone oder Plattform

**Eigene Server-Emojis** funktionieren, solange der Bot Zugriff darauf hat.
Schlägt das Setzen fehl, meldet das Dashboard es beim Anlegen.

**Löschen** entfernt nur die Verknüpfung in der Datenbank — die Nachricht bleibt
in Discord stehen. Lösch sie dort von Hand, sonst klicken Mitglieder ins Leere.

---

## Umfragen

Abstimmung mit Balkenanzeige, die sich bei jeder Stimme aktualisiert.

**Anlegen:** Funktionen → Umfragen. Zwei bis zehn Antworten, wahlweise
Mehrfachauswahl und ein automatisches Ende.

Bei Einfachauswahl nimmt der Bot eine vorherige Stimme automatisch zurück —
auch die Reaktion, damit die Anzeige nicht in die Irre führt.

Ein automatisches Ende wird alle 30 Sekunden geprüft; die Nachricht bekommt dann
den Vermerk „beendet" und zeigt das Endergebnis.

---

## Ticket-System

Mitglieder öffnen per Klick einen privaten Kanal für Support-Anfragen.

**Einrichten in zwei Schritten:**

1. **Einstellungen → Ticket-System** einschalten. Dort legst du fest, welche
   Rollen Zugriff bekommen und wie viele Tickets jemand gleichzeitig offen
   haben darf.
2. **Funktionen → Tickets** → Kanal wählen → Nachricht posten. Die ID der
   Nachricht wird automatisch in den Einstellungen hinterlegt.

**Was passiert beim Klick:** Der Bot legt einen Kanal an, der nur für den
Ersteller, die eingetragenen Rollen und den Bot sichtbar ist. Zum Schließen
klickt man auf 🔒 — das darf der Ersteller selbst oder ein Moderator. Der Kanal
wird nach 30 Sekunden entfernt, damit noch jemand mitlesen kann.

> Legst du eine neue Eröffnungsnachricht an, gilt nur noch die neueste. Die alte
> reagiert dann nicht mehr — lösch sie in Discord.

**Der Bot braucht die Berechtigung „Kanäle verwalten"**, sonst kann er keine
Ticket-Kanäle anlegen.

---

## Anti-Raid-Schutz

Erkennt Massen-Beitritte und setzt die Verifizierungsstufe des Servers hoch.

**Einstellungen → Anti-Raid-Schutz.** Standard: Ab 10 Beitritten in 60 Sekunden
für 30 Minuten.

**Bewusst zurückhaltend:** Es wird niemand automatisch gekickt oder gebannt. Ein
Fehlalarm würde sonst echte Mitglieder treffen — etwa wenn der Server gerade
irgendwo verlinkt wurde. Stattdessen wird die Verifizierung hochgesetzt und das
Team benachrichtigt.

Nach Ablauf stellt der Bot die vorherige Stufe wieder her.

**Der Bot braucht „Server verwalten"**, um die Verifizierungsstufe zu ändern.
Fehlt die Berechtigung, kommt trotzdem die Meldung im Alarm-Kanal.

---

## Moderation von Hand

Dashboard → **Mitglieder**. Auffällige stehen oben, sortiert nach Verstößen.

Verwarnen, Timeout, Kick und Ban sind direkt möglich. Jede Maßnahme:

- wird als Verstoß gezählt und **fließt in die Automod-Eskalation ein**
- landet im Audit-Log mit deiner echten Discord-User-ID
- taucht im Discord-eigenen Audit-Log mit dem angegebenen Grund auf
- kann optional öffentlich in einem Kanal gemeldet werden

Verwarnungen wirken nur über den Log-Eintrag und die optionale Meldung — Discord
kennt keine echte Verwarnfunktion.

---

## Wenn etwas nicht klappt

**Klick auf ein Emoji bewirkt nichts**
→ Rollenhierarchie (siehe oben), oder das Panel wurde im Dashboard gelöscht.
Prüfen: `docker compose logs bot --tail 30`

**Ticket-Kanal wird nicht angelegt**
→ Dem Bot fehlt „Kanäle verwalten", oder das Ticket-System ist ausgeschaltet.

**Umfrage aktualisiert sich nicht**
→ Der Bot braucht das Reaktions-Intent. Das ist eingebaut, aber wenn du eine
alte Bot-Version laufen hast, fehlt es. Neu bauen und starten.

**Anti-Raid meldet, ändert aber nichts**
→ Dem Bot fehlt „Server verwalten".
