import { auth } from './auth.js';
import { canManageGuild } from './permissions.js';
import { getUserGuildsCached, AccessError } from './guild-cache.js';

// Weiterreichen, damit die Seiten weiterhin nur aus guard.js importieren.
export { AccessError, fetchUserGuilds, invalidateUserGuilds } from './guild-cache.js';

/**
 * Prueft bei JEDEM Aufruf erneut, ob der Nutzer diesen Server verwalten darf -
 * nicht nur einmal beim Betreten der Startseite. Gibt Session und Guild zurueck
 * oder wirft einen AccessError.
 *
 * Die Serverliste kommt dabei aus einem kurzen Zwischenspeicher (siehe
 * guild-cache.js); die Pruefung selbst laeuft weiterhin bei jedem Aufruf.
 */
export async function requireGuildAccess(guildId) {
  const session = await auth();
  if (!session?.user) throw new AccessError('Nicht angemeldet.', 401);
  if (session.error === 'RefreshFailed') {
    throw new AccessError('Sitzung abgelaufen, bitte neu anmelden.', 401);
  }

  const guilds = await getUserGuildsCached(session.user.id, session.accessToken);
  const guild = guilds.find((g) => g.id === guildId);
  if (!guild || !canManageGuild(guild)) {
    // Bewusst dieselbe Meldung fuer "gibt es nicht" und "darfst du nicht" -
    // sonst liesse sich damit die Serverzugehoerigkeit anderer ausspaehen.
    throw new AccessError('Kein Zugriff auf diesen Server.', 403);
  }
  return { session, guild };
}
