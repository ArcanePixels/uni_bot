/**
 * Beschreibung der Slash-Commands.
 *
 * Liegt in `shared`, damit Bot und Dashboard dieselbe Quelle nutzen: Der Bot
 * meldet daraus die Befehle bei Discord an, das Dashboard zeigt daraus die
 * Übersicht. Ein neuer Befehl taucht so automatisch in beidem auf und die
 * Anzeige kann nicht veralten.
 *
 * `permission` ist die Berechtigung, die Discord voraussetzt – sie steuert,
 * wem der Befehl überhaupt angezeigt wird.
 */

export const SLASH_COMMANDS = [
  {
    name: 'warn',
    usage: '/warn @mitglied [grund]',
    description: 'Verwarnt ein Mitglied und zählt den Verstoß mit.',
    detail:
      'Die Verwarnung fließt in die Automod-Eskalation ein. Der Bot nennt dabei, welche Maßnahme beim nächsten Verstoß greifen würde.',
    permission: 'ModerateMembers',
    permissionLabel: 'Mitglieder moderieren',
  },
  {
    name: 'history',
    usage: '/history @mitglied',
    description: 'Zeigt die letzten Verstöße eines Mitglieds.',
    detail: 'Mit Zeitpunkt, Regel, Maßnahme und Grund – und wie viele davon noch aktiv sind.',
    permission: 'ModerateMembers',
    permissionLabel: 'Mitglieder moderieren',
  },
  {
    name: 'timeout',
    usage: '/timeout @mitglied minuten [grund]',
    description: 'Schaltet ein Mitglied vorübergehend stumm.',
    detail: 'Discord erlaubt höchstens 28 Tage (40320 Minuten).',
    permission: 'ModerateMembers',
    permissionLabel: 'Mitglieder moderieren',
  },
  {
    name: 'clear',
    usage: '/clear anzahl [@mitglied]',
    description: 'Löscht die letzten Nachrichten im aktuellen Kanal.',
    detail:
      'Höchstens 100 auf einmal, und nur Nachrichten unter 14 Tagen – beides Grenzen von Discord. Mit Angabe eines Mitglieds werden nur dessen Nachrichten gelöscht.',
    permission: 'ManageMessages',
    permissionLabel: 'Nachrichten verwalten',
  },
  {
    name: 'befehle',
    usage: '/befehle',
    description: 'Zeigt die eigenen Textbefehle dieses Servers.',
    detail: 'Für alle nutzbar – angezeigt wird nur, was der Aufrufer selbst verwenden darf.',
    permission: null,
    permissionLabel: 'alle',
  },
];
