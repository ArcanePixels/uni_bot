/**
 * Beschreibung der Einstellungen als Daten.
 *
 * Das Dashboard baut seine Formulare aus dieser Datei, statt fuer jedes Feld
 * eigenes JSX zu haben. Ein neues Plugin traegt hier einen Abschnitt ein und
 * bekommt seine Oberflaeche geschenkt - ohne dass am Dashboard-Code etwas
 * geaendert werden muss.
 *
 * Feldtypen:
 *   boolean   Schalter
 *   text      einzeilig
 *   textarea  mehrzeilig, unterstuetzt `placeholders`
 *   number    Zahl mit min/max
 *   channel   Auswahl eines Discord-Kanals (IDs kommen aus der Guild)
 *   channels  Mehrfachauswahl von Kanaelen
 *   role      Auswahl einer Discord-Rolle
 *   roles     Mehrfachauswahl von Rollen
 *   stringlist Liste freier Textwerte (Wortfilter, Whitelist)
 *   escalation Sonderfall: die Eskalationsstufen des Automod
 */

export const SETTINGS_SCHEMA = [
  {
    key: 'automod',
    title: 'Automod',
    description:
      'Überwacht Nachrichten auf Regelverstöße. Verstöße werden gezählt, die Maßnahme steigert sich mit jedem weiteren.',
    icon: 'shield',
    // Steht der genannte Schalter auf false, blendet das Dashboard den Rest aus.
    enabledBy: 'enabled',
    fields: [
      {
        key: 'enabled',
        type: 'boolean',
        label: 'Automod aktiv',
        help: 'Schaltet die gesamte Überwachung ein oder aus.',
      },
      {
        key: 'badWords',
        type: 'stringlist',
        label: 'Wortfilter',
        help: 'Nachrichten mit diesen Wörtern werden gelöscht. Groß-/Kleinschreibung egal.',
        placeholder: 'Wort eintippen und Enter',
      },
      {
        key: 'spam.enabled',
        type: 'boolean',
        label: 'Spam-Schutz',
        help: 'Erkennt, wenn jemand in kurzer Zeit zu viele Nachrichten schickt.',
      },
      {
        key: 'spam.maxMessages',
        type: 'number',
        label: 'Erlaubte Nachrichten',
        min: 2,
        max: 50,
        dependsOn: 'spam.enabled',
      },
      {
        key: 'spam.windowSeconds',
        type: 'number',
        label: 'Im Zeitraum (Sekunden)',
        min: 1,
        max: 300,
        dependsOn: 'spam.enabled',
      },
      {
        key: 'links.enabled',
        type: 'boolean',
        label: 'Link-Filter',
        help: 'Löscht Links, die nicht auf der Whitelist stehen.',
      },
      {
        key: 'links.whitelist',
        type: 'stringlist',
        label: 'Erlaubte Domains',
        help: 'Subdomains sind automatisch mit erlaubt. Beispiel: youtube.com',
        placeholder: 'youtube.com',
        dependsOn: 'links.enabled',
      },
      {
        key: 'escalation',
        type: 'escalation',
        label: 'Eskalationsstufen',
        help: 'Ab wie vielen Verstößen welche Maßnahme greift.',
      },
      {
        key: 'decayDays',
        type: 'number',
        label: 'Verstöße verfallen nach (Tagen)',
        help: 'Ältere Verstöße zählen für die Eskalation nicht mehr mit.',
        min: 1,
        max: 365,
      },
      {
        key: 'exemptRoles',
        type: 'roles',
        label: 'Ausgenommene Rollen',
        help: 'Mitglieder mit diesen Rollen werden nicht überwacht. Moderatoren sind ohnehin ausgenommen.',
      },
      {
        key: 'logChannelId',
        type: 'channel',
        label: 'Mod-Log-Kanal',
        help: 'Wohin Automod-Meldungen gehen. Leer = in den Kanal, in dem der Verstoß passierte.',
        optional: true,
      },
    ],
  },

  {
    key: 'welcome',
    title: 'Willkommen & Autorole',
    description: 'Begrüßt neue Mitglieder und vergibt automatisch Rollen.',
    icon: 'wave',
    enabledBy: 'enabled',
    fields: [
      { key: 'enabled', type: 'boolean', label: 'Aktiv' },
      {
        key: 'channelId',
        type: 'channel',
        label: 'Willkommens-Kanal',
        optional: true,
      },
      {
        key: 'message',
        type: 'textarea',
        label: 'Begrüßungstext',
        placeholders: [
          { token: '{user}', description: 'Erwähnung des Mitglieds' },
          { token: '{username}', description: 'Name ohne Erwähnung' },
          { token: '{server}', description: 'Servername' },
          { token: '{count}', description: 'Aktuelle Mitgliederzahl' },
        ],
      },
      {
        key: 'autoroleIds',
        type: 'roles',
        label: 'Rollen beim Beitritt',
        help: 'Werden neuen Mitgliedern automatisch gegeben.',
      },
    ],
  },

  {
    key: 'antiraid',
    title: 'Anti-Raid-Schutz',
    description:
      'Erkennt Massen-Beitritte und setzt die Verifizierungsstufe hoch. Bewusst zurückhaltend – es wird niemand automatisch gekickt oder gebannt.',
    icon: 'shield',
    enabledBy: 'enabled',
    fields: [
      { key: 'enabled', type: 'boolean', label: 'Aktiv' },
      {
        key: 'maxJoins',
        type: 'number',
        label: 'Beitritte bis zum Alarm',
        help: 'Ab wie vielen Beitritten im Zeitfenster ein Raid angenommen wird.',
        min: 3,
        max: 100,
      },
      {
        key: 'windowSeconds',
        type: 'number',
        label: 'Im Zeitraum (Sekunden)',
        min: 10,
        max: 600,
      },
      {
        key: 'lockdownMinutes',
        type: 'number',
        label: 'Lockdown-Dauer (Minuten)',
        help: 'Danach wird die vorherige Verifizierungsstufe wiederhergestellt.',
        min: 5,
        max: 1440,
      },
      {
        key: 'alertChannelId',
        type: 'channel',
        label: 'Alarm-Kanal',
        help: 'Wohin die Meldung geht, wenn der Schutz auslöst.',
        optional: true,
      },
    ],
  },

  {
    key: 'customCommands',
    title: 'Eigene Befehle',
    description:
      'Kurzbefehle wie !regeln, die der Bot mit einem festen Text beantwortet. Angelegt werden sie im Reiter „Befehle".',
    icon: 'clock',
    enabledBy: 'enabled',
    fields: [
      { key: 'enabled', type: 'boolean', label: 'Aktiv' },
      {
        key: 'prefix',
        type: 'text',
        label: 'Präfix',
        help: 'Womit ein Befehl beginnt. Üblich ist !, möglich ist auch ? oder .',
      },
      {
        key: 'cooldownSeconds',
        type: 'number',
        label: 'Abklingzeit (Sekunden)',
        help: 'So lange wird derselbe Befehl im selben Kanal nicht erneut beantwortet.',
        min: 0,
        max: 300,
      },
    ],
  },

  {
    key: 'messageLog',
    title: 'Nachrichten-Log',
    description:
      'Schreibt bearbeitete und gelöschte Nachrichten mit. Bei Streitigkeiten oft das Einzige, was nachträglich Klarheit bringt – aber eben auch eine Mitschrift von Inhalten.',
    icon: 'shield',
    enabledBy: 'enabled',
    fields: [
      { key: 'enabled', type: 'boolean', label: 'Aktiv' },
      {
        key: 'channelId',
        type: 'channel',
        label: 'Log-Kanal',
        help: 'Wohin die Meldungen gehen. Sollte nur für das Team sichtbar sein.',
        optional: true,
      },
      {
        key: 'keepDays',
        type: 'number',
        label: 'Aufbewahrung (Tage)',
        help: 'Ältere Einträge werden automatisch gelöscht.',
        min: 1,
        max: 365,
      },
      {
        key: 'ignoredChannelIds',
        type: 'channels',
        label: 'Ausgenommene Kanäle',
        help: 'Dort wird nichts mitgeschrieben. Eine Kategorie nimmt alle enthaltenen Kanäle aus.',
      },
      {
        key: 'includeBots',
        type: 'boolean',
        label: 'Auch Bot-Nachrichten mitschreiben',
      },
    ],
  },

  {
    key: 'tickets',
    title: 'Ticket-System',
    description:
      'Mitglieder öffnen per Klick einen privaten Kanal für Support-Anfragen. Die Eröffnungsnachricht legst du im Reiter „Funktionen" an.',
    icon: 'wave',
    enabledBy: 'enabled',
    fields: [
      { key: 'enabled', type: 'boolean', label: 'Aktiv' },
      {
        key: 'modRoleIds',
        type: 'roles',
        label: 'Rollen mit Zugriff',
        help: 'Wer die Ticket-Kanäle sehen und schließen darf. Moderatoren dürfen ohnehin.',
      },
      {
        key: 'maxOpenPerUser',
        type: 'number',
        label: 'Offene Tickets je Mitglied',
        help: 'Verhindert, dass jemand beliebig viele Kanäle anlegt.',
        min: 1,
        max: 10,
      },
      {
        key: 'greeting',
        type: 'textarea',
        label: 'Begrüßung im Ticket',
        placeholders: [{ token: '{user}', description: 'Erwähnung des Erstellers' }],
      },
    ],
  },
];

/** Liest einen verschachtelten Wert über "a.b.c". */
export function getPath(obj, path) {
  return path.split('.').reduce((o, k) => (o == null ? undefined : o[k]), obj);
}

/** Setzt einen verschachtelten Wert über "a.b.c" und gibt eine Kopie zurück. */
export function setPath(obj, path, value) {
  const keys = path.split('.');
  const out = Array.isArray(obj) ? [...obj] : { ...obj };
  let cur = out;
  for (let i = 0; i < keys.length - 1; i++) {
    const k = keys[i];
    cur[k] = Array.isArray(cur[k]) ? [...cur[k]] : { ...cur[k] };
    cur = cur[k];
  }
  cur[keys.at(-1)] = value;
  return out;
}

/** Ist das Feld sichtbar, gemessen an seinem `dependsOn`? */
export function isFieldVisible(field, values) {
  if (!field.dependsOn) return true;
  return Boolean(getPath(values, field.dependsOn));
}
