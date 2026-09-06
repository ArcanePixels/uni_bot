/**
 * Was der Bot kann - als Daten, nicht im JSX verstreut.
 *
 * Bewusst hier und nicht in der Seite: So laesst sich pruefen, dass die
 * Startseite nichts verspricht, was es nicht gibt. Nichts ist peinlicher als
 * eine Uebersichtsseite, die eine Funktion nennt, die nie gebaut wurde.
 */

/** Die Punkte, in denen sich der Bot von den bekannten Diensten unterscheidet. */
export const UNTERSCHIEDE = [
  {
    titel: 'Kein Abo, keine Premium-Schranke',
    text:
      'Alles ist enthalten. Es gibt keine Funktion, die hinter einer Zahlung liegt, ' +
      'und keine, die nach einer Testphase verschwindet.',
  },
  {
    titel: 'Deine Daten bleiben bei dir',
    text:
      'Der Bot läuft auf eigener Hardware. Es gibt keinen zentralen Dienst, der ' +
      'mitliest oder Daten sammelt – nur deinen Server und deine Datenbank.',
  },
  {
    titel: 'Quelloffen und prüfbar',
    text:
      'Der gesamte Quelltext ist einsehbar. Du kannst nachlesen, was der Bot tut, ' +
      'statt es glauben zu müssen.',
  },
  {
    titel: 'Erweiterbar ohne Programmieren',
    text:
      'Eigene Funktionen kommen als Plugin dazu – ein Ordner mit einer ' +
      'Beschreibungsdatei genügt, und der Reiter erscheint im Dashboard.',
  },
];

/**
 * Der Funktionsumfang.
 *
 * Jeder Eintrag entspricht einer Funktion, die es wirklich gibt - `pruefbar`
 * nennt die Datei, an der sich das nachweisen laesst.
 */
export const FUNKTIONEN = [
  {
    gruppe: 'Moderation',
    icon: 'shield',
    punkte: [
      { text: 'Automod mit Wortfilter, Spam- und Link-Schutz', pruefbar: 'bot/src/plugins/automod.js' },
      { text: 'Eskalation: Verwarnung → Timeout → Kick → Ban', pruefbar: 'bot/src/plugins/automod.js' },
      { text: 'Verwarnen, stummschalten, kicken, bannen aus dem Dashboard', pruefbar: 'api/src/routes/moderation.js' },
      { text: 'Anti-Raid-Schutz bei Massen-Beitritten', pruefbar: 'bot/src/plugins/antiraid.js' },
      { text: 'Audit-Log: wer hat wann was ausgelöst', pruefbar: 'api/src/routes/audit.js' },
    ],
  },
  {
    gruppe: 'Mitglieder',
    icon: 'users',
    punkte: [
      { text: 'Willkommensnachricht mit Platzhaltern', pruefbar: 'bot/src/plugins/welcome.js' },
      { text: 'Autorole beim Beitritt', pruefbar: 'bot/src/plugins/welcome.js' },
      { text: 'Reaction Roles – Rollen per Emoji-Klick', pruefbar: 'bot/src/plugins/reaction-roles.js' },
      { text: 'Setup-Wizard: Interessen anklicken, Kanäle freischalten', pruefbar: 'api/src/routes/wizard.js' },
      { text: 'Ticket-System mit privatem Kanal je Anfrage', pruefbar: 'bot/src/plugins/tickets.js' },
    ],
  },
  {
    gruppe: 'Inhalte',
    icon: 'clock',
    punkte: [
      { text: 'Geplante Posts, einmalig oder wiederkehrend', pruefbar: 'bot/src/plugins/scheduler.js' },
      { text: 'YouTube-Benachrichtigung bei neuen Videos', pruefbar: 'bot/src/plugins/youtube.js' },
      { text: 'Twitch-Meldung beim Livegehen, per Webhook in Sekunden', pruefbar: 'plugins/twitch/bot.js' },
      { text: 'Serverregeln zusammenstellen und posten', pruefbar: 'plugins/regeln/bot.js' },
      { text: 'Eigene Textbefehle und Umfragen', pruefbar: 'bot/src/plugins/polls.js' },
    ],
  },
  {
    gruppe: 'Verwaltung',
    icon: 'plus',
    punkte: [
      { text: 'Kanalrechte gebündelt setzen statt einzeln durchklicken', pruefbar: 'api/src/permissions.js' },
      { text: 'Slash-Befehle für den Mod-Alltag', pruefbar: 'shared/src/slash-commands.js' },
      { text: 'Nachrichten-Log für Streitfälle (standardmäßig aus)', pruefbar: 'bot/src/plugins/message-log.js' },
      { text: 'Automatische Sicherungen', pruefbar: 'api/src/backup.js' },
      { text: 'Daten eines Servers auf Wunsch komplett löschen', pruefbar: 'api/src/routes/guild-daten.js' },
    ],
  },
];

/** Alle Punkte am Stück - für Tests und Zählungen. */
export function allePunkte() {
  return FUNKTIONEN.flatMap((g) => g.punkte);
}
