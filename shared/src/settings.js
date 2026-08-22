import { now } from './db.js';

// Bewusst ohne Logger-Abhaengigkeit, damit shared von Bot und API gleichermassen
// nutzbar bleibt; Fehler werden an den Aufrufer gemeldet.
const log = { error: (m, e) => console.error(`[settings] ${m}`, e ?? '') };

export const DEFAULT_SETTINGS = {
  automod: {
    enabled: true,
    badWords: [],
    // Mehr als `maxMessages` Nachrichten in `windowSeconds` gilt als Flood.
    spam: { enabled: true, maxMessages: 5, windowSeconds: 5 },
    links: { enabled: false, whitelist: [] },
    // Ab wie vielen Verstoessen welche Massnahme greift.
    escalation: [
      { at: 1, action: 'warn' },
      { at: 3, action: 'timeout', durationMinutes: 10 },
      { at: 5, action: 'kick' },
      { at: 7, action: 'ban' },
    ],
    // Verstoesse aelter als das zaehlen nicht mehr mit.
    decayDays: 30,
    exemptRoles: [],
    logChannelId: null,
  },
  welcome: {
    enabled: false,
    channelId: null,
    message: 'Willkommen auf dem Server, {user}!',
    autoroleIds: [],
  },
  antiraid: {
    enabled: false,
    // Mehr als `maxJoins` Beitritte in `windowSeconds` gilt als Raid.
    maxJoins: 10,
    windowSeconds: 60,
    lockdownMinutes: 30,
    alertChannelId: null,
  },
  customCommands: {
    enabled: false,
    prefix: '!',
    cooldownSeconds: 3,
  },
  messageLog: {
    // Standardmaessig aus - es ist eine Mitschrift von Nachrichteninhalten.
    enabled: false,
    channelId: null,
    keepDays: 30,
    includeBots: false,
    ignoredChannelIds: [],
  },
  tickets: {
    enabled: false,
    // Nachricht, unter der das Ticket-Emoji haengt.
    panelMessageId: null,
    // Kategorie, in der neue Ticket-Kanaele angelegt werden.
    categoryId: null,
    modRoleIds: [],
    maxOpenPerUser: 1,
    greeting: 'Hallo {user}, schildere hier dein Anliegen. Ein Mod meldet sich.',
  },
};

/** Tiefes Zusammenfuehren, damit neue Default-Keys bei alten Datensaetzen greifen. */
function merge(base, override) {
  if (Array.isArray(base) || Array.isArray(override)) return override ?? base;
  if (typeof base !== 'object' || base === null) return override ?? base;
  if (typeof override !== 'object' || override === null) return base;
  const out = { ...base };
  for (const [k, v] of Object.entries(override)) out[k] = merge(base[k], v);
  return out;
}

export class SettingsStore {
  #db;
  #cache = new Map();

  constructor(db) {
    this.#db = db;
  }

  get(guildId) {
    if (this.#cache.has(guildId)) return this.#cache.get(guildId);
    const row = this.#db
      .prepare('SELECT settings_json FROM guild_settings WHERE guild_id = ?')
      .get(guildId);

    let stored = {};
    if (row) {
      try {
        stored = JSON.parse(row.settings_json);
      } catch (err) {
        // Kaputtes JSON darf den Bot nicht lahmlegen - wir fallen auf Defaults
        // zurueck und sagen laut Bescheid, statt still das Falsche zu tun.
        log.error(`Settings fuer Guild ${guildId} sind kein gueltiges JSON, nutze Defaults`, err);
      }
    }
    const merged = merge(DEFAULT_SETTINGS, stored);
    this.#cache.set(guildId, merged);
    return merged;
  }

  set(guildId, settings) {
    const merged = merge(DEFAULT_SETTINGS, settings);
    this.#db
      .prepare(
        `INSERT INTO guild_settings (guild_id, settings_json, updated_at) VALUES (?, ?, ?)
         ON CONFLICT(guild_id) DO UPDATE SET settings_json = excluded.settings_json,
                                             updated_at    = excluded.updated_at`,
      )
      .run(guildId, JSON.stringify(merged), now());
    this.#cache.set(guildId, merged);
    return merged;
  }

  /** Die API schreibt direkt in dieselbe DB, daher muss der Bot den Cache verwerfen koennen. */
  invalidate(guildId) {
    guildId ? this.#cache.delete(guildId) : this.#cache.clear();
  }
}
