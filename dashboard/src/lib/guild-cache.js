/**
 * Zwischenspeicher der Discord-Serverliste je Nutzer.
 *
 * Bewusst in einer eigenen Datei ohne Next- oder Auth.js-Abhaengigkeiten -
 * so laesst sich die Logik direkt testen, ohne eine Next-Umgebung hochzufahren.
 *
 * Ohne diesen Zwischenspeicher fragte jeder Seitenaufruf UND jede Aktion bei
 * Discord nach. Beim Speichern kamen so mehrere Anfragen auf einmal zusammen,
 * was zur Drosselung fuehrte.
 */

const DISCORD_API = 'https://discord.com/api/v10';

/**
 * Eine Minute ist bewusst kurz: Verliert jemand seine Admin-Rolle auf dem
 * Server, ist der Zugriff spaetestens danach weg.
 */
export const GUILD_CACHE_MS = 60_000;

const guildCache = new Map();
const inFlight = new Map();

export class AccessError extends Error {
  constructor(message, status) {
    super(message);
    this.status = status;
  }
}

/** Holt die Server des eingeloggten Nutzers von Discord. */
export async function fetchUserGuilds(accessToken) {
  let res;
  try {
    res = await fetch(`${DISCORD_API}/users/@me/guilds`, {
      headers: { Authorization: `Bearer ${accessToken}` },
      signal: AbortSignal.timeout(10_000),
    });
  } catch (err) {
    // Ohne diesen Fang gaebe es bei einem Discord-Ausfall einen nackten 500.
    throw new AccessError(`Discord ist gerade nicht erreichbar (${err.message}).`, 503);
  }
  if (res.status === 401) throw new AccessError('Sitzung abgelaufen, bitte neu anmelden.', 401);
  if (res.status === 429) {
    const retry = Number(res.headers.get('retry-after') ?? 0);
    throw new AccessError(
      retry
        ? `Discord drosselt gerade die Anfragen. In ${Math.ceil(retry)} Sekunden nochmal versuchen.`
        : 'Discord drosselt gerade die Anfragen.',
      429,
    );
  }
  if (!res.ok) throw new AccessError(`Discord antwortete mit HTTP ${res.status}.`, 502);
  return res.json();
}

/**
 * Wie fetchUserGuilds, aber mit Zwischenspeicher je Nutzer. Parallele Aufrufe
 * werden zusammengefasst, statt mehrfach zu fragen.
 *
 * Der Schluessel ist die Discord-User-ID: Der Eintrag eines Nutzers darf
 * niemals fuer einen anderen gelten, sonst wuerde jemand fremde Rechte erben.
 */
export async function getUserGuildsCached(userId, accessToken) {
  const hit = guildCache.get(userId);
  if (hit && hit.until > Date.now()) return hit.value;

  const running = inFlight.get(userId);
  if (running) return running;

  const promise = fetchUserGuilds(accessToken)
    .then((value) => {
      guildCache.set(userId, { value, until: Date.now() + GUILD_CACHE_MS });
      return value;
    })
    .finally(() => inFlight.delete(userId));

  inFlight.set(userId, promise);
  return promise;
}

/** Verwirft die zwischengespeicherte Serverliste - etwa nach dem Abmelden. */
export function invalidateUserGuilds(userId) {
  userId ? guildCache.delete(userId) : guildCache.clear();
}

export const __test__ = {
  guildCache,
  inFlight,
  GUILD_CACHE_MS,
  clear: () => {
    guildCache.clear();
    inFlight.clear();
  },
};
