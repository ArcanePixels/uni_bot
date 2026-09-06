/**
 * Der Einladungslink fuer den Bot.
 *
 * Ohne ihn steht man vor einem Server, auf dem der Bot gar nicht ist, und die
 * Seiten scheitern mit einer Discord-Fehlermeldung - ohne zu sagen, dass
 * schlicht die Einladung fehlt.
 *
 * Wichtig zum Verstaendnis: Der Link **fuegt nichts hinzu**. Er fuehrt zu
 * Discords eigener Seite, auf der man den Server auswaehlt und bestaetigt.
 * Wer dort keine Adminrechte hat, kann den Bot auch nicht einladen - das
 * entscheidet Discord, nicht wir.
 */

/**
 * Die Rechte, die der Bot braucht.
 *
 * Bewusst knapp gehalten: Jedes zusaetzliche Recht ist eines, das der Nutzer
 * beim Einladen bestaetigen muss - und eine Vollmacht, die er dauerhaft gibt.
 * Administrator waere bequemer, ist aber genau deshalb die falsche Wahl.
 */
export const BOT_RECHTE = {
  VIEW_CHANNEL: 1n << 10n,
  SEND_MESSAGES: 1n << 11n,
  EMBED_LINKS: 1n << 14n,
  ATTACH_FILES: 1n << 15n,
  READ_MESSAGE_HISTORY: 1n << 16n,
  ADD_REACTIONS: 1n << 6n,
  MANAGE_MESSAGES: 1n << 13n, // Automod loescht Nachrichten
  MANAGE_ROLES: 1n << 28n, // Autorole, Reaction Roles
  KICK_MEMBERS: 1n << 1n,
  BAN_MEMBERS: 1n << 2n,
  MODERATE_MEMBERS: 1n << 40n, // Timeout
  MANAGE_CHANNELS: 1n << 4n, // Tickets legen Kanaele an
  CREATE_PUBLIC_THREADS: 1n << 35n,
  SEND_MESSAGES_IN_THREADS: 1n << 38n,
};

/** Klartext fuer die Anzeige - damit klar ist, wofuer jedes Recht gebraucht wird. */
export const RECHTE_ERKLAERT = [
  { name: 'Nachrichten senden und lesen', wofuer: 'Grundlage für alles' },
  { name: 'Nachrichten verwalten', wofuer: 'Automod löscht Verstöße' },
  { name: 'Rollen verwalten', wofuer: 'Autorole, Reaction Roles, Wizard' },
  { name: 'Mitglieder kicken, bannen, stummschalten', wofuer: 'Moderation' },
  { name: 'Kanäle verwalten', wofuer: 'Ticket-System legt Kanäle an' },
];

/** Die Summe aller Rechte als Zahl, so wie Discord sie erwartet. */
export function rechteSumme(rechte = BOT_RECHTE) {
  let summe = 0n;
  for (const bit of Object.values(rechte)) summe |= bit;
  return summe;
}

/**
 * Baut den Einladungslink.
 *
 * `guildId` waehlt den Server in Discords Auswahl vor - der Nutzer kann ihn
 * dort aber aendern und muss in jedem Fall bestaetigen.
 */
export function einladungsLink({ clientId, guildId = null }) {
  if (!clientId) return null;

  const params = new URLSearchParams({
    client_id: String(clientId),
    // "bot" fuer den Bot selbst, "applications.commands" fuer Slash-Befehle.
    scope: 'bot applications.commands',
    permissions: rechteSumme().toString(),
  });

  if (guildId) {
    params.set('guild_id', String(guildId));
    // Die Auswahl trotzdem anzeigen: Wer sich vertut, soll wechseln koennen,
    // statt den Bot auf dem falschen Server zu landen.
    params.set('disable_guild_select', 'false');
  }

  return `https://discord.com/oauth2/authorize?${params.toString()}`;
}
