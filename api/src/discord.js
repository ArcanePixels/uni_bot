const API = 'https://discord.com/api/v10';

/**
 * Zwischenspeicher fuer Discord-Abfragen.
 *
 * Die Dauern sind nach Aenderungshaeufigkeit gestaffelt: Kanaele und Rollen
 * aendern sich selten, Mitgliederlisten haeufiger. Ein zu kurzer Cache fuehrt
 * dazu, dass Discord die Anfragen drosselt - jeder Seitenaufruf im Dashboard
 * loest sonst mehrere Abfragen aus (Layout und Seite fragen beide), und beim
 * Durchklicken durch die Reiter summiert sich das schnell.
 */
const CACHE_MS = {
  guild: 10 * 60_000, // Name und Icon aendern sich fast nie
  channels: 5 * 60_000,
  roles: 5 * 60_000,
  members: 2 * 60_000, // am teuersten: laedt in 1000er-Bloecken
  // Rechte werden geprueft, waehrend jemand sie gerade in Discord aendert und
  // im Dashboard nachsieht, ob es gewirkt hat. Ein langer Cache zeigt dann
  // minutenlang den alten Stand - und man dreht an Rechten, die laengst passen.
  // 10 Sekunden reichen, damit ein Seitenaufbau nicht mehrfach anfragt.
  perms: 10_000,
};
const DEFAULT_CACHE_MS = 5 * 60_000;

const cache = new Map();

/**
 * Laufende Abfragen, damit parallele Aufrufe nicht mehrfach bei Discord
 * anfragen. Ohne das loesen die drei Promise.all-Aufrufe einer Seite beim
 * ersten Aufbau drei gleichzeitige Abfragen derselben Daten aus.
 */
const inFlight = new Map();

/**
 * Fehler mit HTTP-Status, damit die Routen zwischen "Discord ist weg" und
 * "Bot ist nicht auf dem Server" unterscheiden koennen.
 */
export class DiscordError extends Error {
  constructor(message, status) {
    super(message);
    this.name = 'DiscordError';
    this.status = status;
  }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function call(path, botToken, options = {}, attempt = 0) {
  let res;
  try {
    res = await fetch(API + path, {
      method: options.method ?? 'GET',
      headers: {
        Authorization: `Bot ${botToken}`,
        ...(options.body ? { 'Content-Type': 'application/json' } : {}),
        // Discord zeigt den Grund im Server-Audit-Log an.
        ...(options.reason ? { 'X-Audit-Log-Reason': encodeURIComponent(options.reason) } : {}),
      },
      body: options.body ? JSON.stringify(options.body) : undefined,
      signal: AbortSignal.timeout(10_000),
    });
  } catch (err) {
    // Netzwerkfehler oder Timeout - das ist kein Fehler des Aufrufers.
    throw new DiscordError(`Discord ist nicht erreichbar: ${err.message}`, 503);
  }

  if (res.status === 429) {
    const retry = Number(res.headers.get('retry-after') ?? 1);
    // Discord nennt die Wartezeit selbst. Bei kurzen Sperren einmal abwarten
    // und erneut versuchen, statt den Fehler direkt durchzureichen - das ist
    // der Normalfall und keine Stoerung, die den Nutzer erreichen muesste.
    if (attempt < 2 && Number.isFinite(retry) && retry <= 5) {
      await sleep(retry * 1000 + 250);
      return call(path, botToken, options, attempt + 1);
    }
    throw new DiscordError(
      `Discord drosselt die Anfragen. Bitte in ${Number.isFinite(retry) ? Math.ceil(retry) : 'wenigen'} Sekunden erneut versuchen.`,
      429,
    );
  }
  if (res.status === 403) {
    // Bei Moderationsaktionen ist das fast immer die Rollenhierarchie: Der Bot
    // darf nur gegen Mitglieder vorgehen, die unter ihm in der Rollenliste stehen.
    throw new DiscordError(
      'Discord verweigert das. Meist steht die Bot-Rolle in den Servereinstellungen ' +
        'nicht hoch genug, oder ihm fehlt die noetige Berechtigung.',
      403,
    );
  }
  if (res.status === 404) {
    throw new DiscordError('Nicht gefunden - Mitglied nicht auf dem Server?', 404);
  }
  if (!res.ok) {
    let detail = '';
    try {
      const body = await res.json();
      if (body?.message) detail = `: ${body.message}`;
    } catch {
      // Antwort ohne JSON - dann bleibt es bei der Statusmeldung.
    }
    throw new DiscordError(`Discord antwortete mit HTTP ${res.status}${detail}`, 502);
  }
  // 204 (kein Inhalt) kommt bei Kick, Ban und Timeout-Aenderungen vor.
  if (res.status === 204) return null;
  return res.json();
}

async function cached(key, loader) {
  const hit = cache.get(key);
  if (hit && hit.until > Date.now()) return hit.value;

  // Laeuft die Abfrage schon? Dann darauf warten statt ein zweites Mal fragen.
  const running = inFlight.get(key);
  if (running) return running;

  const kind = key.split(':')[0];
  const ttl = CACHE_MS[kind] ?? DEFAULT_CACHE_MS;

  const promise = loader()
    .then((value) => {
      cache.set(key, { value, until: Date.now() + ttl });
      return value;
    })
    .finally(() => inFlight.delete(key));

  inFlight.set(key, promise);
  return promise;
}

// Nur Kanaltypen, in die ein Bot schreiben kann.
const TEXT_TYPES = new Set([0, 5, 15]); // Text, Ankuendigung, Forum
export const CHANNEL_TYPE = { TEXT: 0, VOICE: 2, CATEGORY: 4, ANNOUNCEMENT: 5, STAGE: 13, FORUM: 15 };

export async function getGuildChannels(guildId, botToken) {
  return cached(`channels:${guildId}`, async () => {
    const all = await call(`/guilds/${guildId}/channels`, botToken);
    return all
      .filter((c) => TEXT_TYPES.has(c.type))
      .map((c) => ({ id: c.id, name: c.name, type: c.type, position: c.position }))
      .sort((a, b) => a.position - b.position);
  });
}

/**
 * Alle Kanaele samt Kategorien und Sprachkanaelen - fuer die Rechtevergabe,
 * bei der auch Kategorien und Voice-Kanaele in Frage kommen.
 */
export async function getAllChannels(guildId, botToken) {
  return cached(`channels:all:${guildId}`, async () => {
    const all = await call(`/guilds/${guildId}/channels`, botToken);
    return all
      .map((c) => ({
        id: c.id,
        name: c.name,
        type: c.type,
        position: c.position,
        parentId: c.parent_id ?? null,
      }))
      .sort((a, b) => a.position - b.position);
  });
}

export async function getGuildRoles(guildId, botToken) {
  return cached(`roles:${guildId}`, async () => {
    const all = await call(`/guilds/${guildId}/roles`, botToken);
    return all
      .filter((r) => !r.managed && r.name !== '@everyone')
      .map((r) => ({ id: r.id, name: r.name, color: r.color, position: r.position }))
      .sort((a, b) => b.position - a.position);
  });
}

export async function getGuild(guildId, botToken) {
  return cached(`guild:${guildId}`, async () => {
    const g = await call(`/guilds/${guildId}`, botToken);
    return { id: g.id, name: g.name, icon: g.icon };
  });
}

/**
 * Verwirft zwischengespeicherte Daten eines Servers.
 *
 * `kinds` schraenkt ein, was betroffen ist. Ohne Angabe wird alles verworfen -
 * das ist bei Moderationsaktionen aber unnoetig grob: Ein Kick aendert nichts
 * an Kanaelen und Rollen, wuerde deren Cache aber trotzdem leeren und damit
 * beim naechsten Seitenaufruf neue Discord-Abfragen ausloesen.
 */
export function invalidateGuild(guildId, kinds = null) {
  for (const key of cache.keys()) {
    if (!key.endsWith(`:${guildId}`)) continue;
    if (kinds && !kinds.includes(key.split(':')[0])) continue;
    cache.delete(key);
  }
}

// ---------------------------------------------------------------------------
// Mitglieder
// ---------------------------------------------------------------------------

/** Vereinheitlicht, was das Dashboard von einem Mitglied braucht. */
function toMember(m) {
  const u = m.user ?? {};
  return {
    id: u.id,
    // Seit der Umstellung auf Handles ist `global_name` der Anzeigename.
    name: m.nick || u.global_name || u.username || 'Unbekannt',
    username: u.username ?? null,
    avatar: u.avatar
      ? `https://cdn.discordapp.com/avatars/${u.id}/${u.avatar}.png?size=64`
      : `https://cdn.discordapp.com/embed/avatars/${(BigInt(u.id ?? '0') >> 22n) % 6n}.png`,
    roles: m.roles ?? [],
    joinedAt: m.joined_at ?? null,
    bot: Boolean(u.bot),
    // Discord liefert einen Zeitpunkt, bis zu dem der Timeout laeuft.
    timeoutUntil: m.communication_disabled_until ?? null,
  };
}

/**
 * Holt Mitglieder in Haeppchen. Discord gibt hoechstens 1000 pro Anfrage;
 * mehr als ein paar Tausend brauchen wir fuers Dashboard nicht.
 */
export async function getGuildMembers(guildId, botToken, limit = 1000) {
  return cached(`members:${guildId}`, async () => {
    const out = [];
    let after = '0';
    while (out.length < limit) {
      const batch = await call(
        `/guilds/${guildId}/members?limit=1000&after=${after}`,
        botToken,
      );
      if (!batch?.length) break;
      out.push(...batch.map(toMember));
      after = batch.at(-1).user.id;
      if (batch.length < 1000) break;
    }
    return out;
  });
}

/**
 * Loest User-IDs in Namen auf. Faellt auf die reine ID zurueck, wenn das
 * Mitglied den Server verlassen hat - dann gibt es keinen Namen mehr.
 */
export async function resolveMembers(guildId, botToken, ids) {
  const unique = [...new Set(ids.filter(Boolean))];
  if (!unique.length) return {};

  let members = [];
  try {
    members = await getGuildMembers(guildId, botToken);
  } catch {
    // Ohne Mitgliederliste zeigen wir eben IDs - kein Grund, die Seite zu kippen.
    return {};
  }

  const byId = new Map(members.map((m) => [m.id, m]));
  const out = {};
  for (const id of unique) {
    const m = byId.get(id);
    if (m) out[id] = { name: m.name, avatar: m.avatar, left: false };
  }
  return out;
}

// ---------------------------------------------------------------------------
// Moderationsaktionen
// ---------------------------------------------------------------------------

export async function timeoutMember(guildId, userId, minutes, botToken, reason) {
  // null hebt einen laufenden Timeout auf.
  const until =
    minutes > 0 ? new Date(Date.now() + minutes * 60_000).toISOString() : null;
  await call(`/guilds/${guildId}/members/${userId}`, botToken, {
    method: 'PATCH',
    body: { communication_disabled_until: until },
    reason,
  });
  // Nur die Mitgliederliste ist betroffen - Kanaele und Rollen bleiben gueltig.
  invalidateGuild(guildId, ['members']);
}

export async function kickMember(guildId, userId, botToken, reason) {
  await call(`/guilds/${guildId}/members/${userId}`, botToken, { method: 'DELETE', reason });
  invalidateGuild(guildId, ['members']);
}

export async function banMember(guildId, userId, botToken, reason, deleteDays = 0) {
  await call(`/guilds/${guildId}/bans/${userId}`, botToken, {
    method: 'PUT',
    body: { delete_message_seconds: Math.min(deleteDays, 7) * 86400 },
    reason,
  });
  invalidateGuild(guildId, ['members']);
}

export async function unbanMember(guildId, userId, botToken, reason) {
  await call(`/guilds/${guildId}/bans/${userId}`, botToken, { method: 'DELETE', reason });
}

export async function getBans(guildId, botToken) {
  const list = await call(`/guilds/${guildId}/bans?limit=1000`, botToken);
  return (list ?? []).map((b) => ({
    id: b.user.id,
    name: b.user.global_name || b.user.username,
    reason: b.reason ?? null,
  }));
}

/** Schickt eine Nachricht in einen Kanal - fuer manuelle Verwarnungen. */
export async function sendMessage(channelId, content, botToken) {
  return call(`/channels/${channelId}/messages`, botToken, {
    method: 'POST',
    body: { content },
  });
}


// Fuer Tests: Einblick in den Zwischenspeicher.
export const __test__ = {
  cache,
  inFlight,
  cached,
  CACHE_MS,
  clear: () => {
    cache.clear();
    inFlight.clear();
  },
};

/**
 * Der Bot selbst als Mitglied dieses Servers - vor allem seine Rollen.
 *
 * Braucht das Dashboard, um anzuzeigen, ob der Bot in einem Kanal posten darf.
 */
export async function getBotMember(guildId, botToken) {
  return cached(`perms:botmember:${guildId}`, async () => {
    // Erst die eigene User-ID. `/guilds/{id}/members/@me` gibt es nur fuer
    // OAuth2-Tokens eines Nutzers - mit einem Bot-Token antwortet Discord mit
    // 400. Deshalb der Umweg ueber /users/@me und die konkrete Mitglieds-ID.
    const self = await call('/users/@me', botToken);
    const m = await call(`/guilds/${guildId}/members/${self.id}`, botToken);
    return { id: self.id, roleIds: m.roles ?? [] };
  });
}

/**
 * Kanaele mit ihren Rechte-Ueberschreibungen.
 *
 * `getGuildChannels` laesst die bewusst weg, weil sie im Dashboard nur Ballast
 * waeren. Fuer die Rechtepruefung braucht es sie aber.
 */
export async function getChannelsWithOverwrites(guildId, botToken) {
  return cached(`perms:channels:${guildId}`, async () => {
    const all = await call(`/guilds/${guildId}/channels`, botToken);
    return all.map((c) => ({
      id: c.id,
      name: c.name,
      type: c.type,
      permission_overwrites: c.permission_overwrites ?? [],
    }));
  });
}

/** Alle Rollen mit ihren Rechte-Bits - inklusive @everyone und Bot-Rollen. */
export async function getRawRoles(guildId, botToken) {
  return cached(`perms:roles:${guildId}`, async () => {
    const all = await call(`/guilds/${guildId}/roles`, botToken);
    return all.map((r) => ({ id: r.id, name: r.name, permissions: r.permissions ?? '0' }));
  });
}
