/**
 * Zugriff auf die Bot-API. Laeuft ausschliesslich serverseitig - das
 * API-Token darf niemals im Browser landen.
 */
const BASE = process.env.API_URL ?? 'http://api:8080';
const TOKEN = process.env.API_TOKEN;

export class ApiError extends Error {
  constructor(message, status) {
    super(message);
    this.status = status;
  }
}

async function request(path, options = {}) {
  if (!TOKEN) throw new ApiError('API_TOKEN ist im Dashboard nicht gesetzt.', 500);

  let res;
  try {
    res = await fetch(BASE + path, {
      ...options,
      headers: {
        Authorization: `Bearer ${TOKEN}`,
        ...(options.body ? { 'Content-Type': 'application/json' } : {}),
        ...options.headers,
      },
      cache: 'no-store',
      signal: AbortSignal.timeout(15_000),
    });
  } catch (err) {
    throw new ApiError(`Bot-API nicht erreichbar: ${err.message}`, 503);
  }

  if (res.status === 204) return null;

  const text = await res.text();
  let body = null;
  if (text) {
    try {
      body = JSON.parse(text);
    } catch {
      throw new ApiError(`Unerwartete Antwort der Bot-API (HTTP ${res.status}).`, 502);
    }
  }

  if (!res.ok) {
    throw new ApiError(body?.error ?? `Bot-API antwortete mit HTTP ${res.status}.`, res.status);
  }
  return body;
}

const g = (guildId, suffix = '') => `/api/guilds/${encodeURIComponent(guildId)}${suffix}`;

export const api = {
  getSchema: () => request('/api/guilds/schema'),
  getMeta: (guildId) => request(g(guildId, '/meta')),
  getAccent: (guildId) => request(g(guildId, '/accent')),

  getSettings: (guildId) => request(g(guildId, '/settings')),
  saveSettings: (guildId, settings) =>
    request(g(guildId, '/settings'), { method: 'PUT', body: JSON.stringify(settings) }),

  getInfractions: (guildId, params = '') => request(g(guildId, `/infractions${params}`)),
  deleteInfraction: (guildId, id) => request(g(guildId, `/infractions/${id}`), { method: 'DELETE' }),

  getScheduled: (guildId) => request(g(guildId, '/scheduled')),
  createScheduled: (guildId, post) =>
    request(g(guildId, '/scheduled'), { method: 'POST', body: JSON.stringify(post) }),
  deleteScheduled: (guildId, id) => request(g(guildId, `/scheduled/${id}`), { method: 'DELETE' }),

  getYoutube: (guildId) => request(g(guildId, '/youtube')),
  createYoutube: (guildId, feed) =>
    request(g(guildId, '/youtube'), { method: 'POST', body: JSON.stringify(feed) }),
  deleteYoutube: (guildId, id) => request(g(guildId, `/youtube/${id}`), { method: 'DELETE' }),
  checkYoutube: (guildId) => request(g(guildId, '/youtube/check'), { method: 'POST' }),

  getAudit: (guildId, params = '') => request(g(guildId, `/audit${params}`)),

  getMembers: (guildId, params = '') => request(g(guildId, `/members${params}`)),
  resolveMembers: (guildId, ids) =>
    request(g(guildId, '/resolve'), { method: 'POST', body: JSON.stringify({ ids }) }),
  moderate: (guildId, payload) =>
    request(g(guildId, '/moderate'), { method: 'POST', body: JSON.stringify(payload) }),
  getBans: (guildId) => request(g(guildId, '/bans')),

  getReactionRoles: (guildId) => request(g(guildId, '/reactionroles')),
  createReactionRoles: (guildId, panel) =>
    request(g(guildId, '/reactionroles'), { method: 'POST', body: JSON.stringify(panel) }),
  deleteReactionRoles: (guildId, id) =>
    request(g(guildId, `/reactionroles/${id}`), { method: 'DELETE' }),

  getPolls: (guildId) => request(g(guildId, '/polls')),
  createPoll: (guildId, poll) =>
    request(g(guildId, '/polls'), { method: 'POST', body: JSON.stringify(poll) }),
  closePoll: (guildId, id) => request(g(guildId, `/polls/${id}/close`), { method: 'POST' }),

  getTickets: (guildId) => request(g(guildId, '/tickets')),
  createTicketPanel: (guildId, payload) =>
    request(g(guildId, '/tickets/panel'), { method: 'POST', body: JSON.stringify(payload) }),

  getPresets: () => request('/api/guilds/presets'),
  getAllChannels: (guildId) => request(g(guildId, '/allchannels')),

  planPermissions: (guildId, payload) =>
    request(g(guildId, '/permissions/plan'), { method: 'POST', body: JSON.stringify(payload) }),
  applyPermissions: (guildId, payload) =>
    request(g(guildId, '/permissions/apply'), { method: 'POST', body: JSON.stringify(payload) }),
  getPermissionHistory: (guildId) => request(g(guildId, '/permissions/history')),
  undoPermissions: (guildId, changeId, payload) =>
    request(g(guildId, `/permissions/undo/${changeId}`), {
      method: 'POST',
      body: JSON.stringify(payload ?? {}),
    }),

  getInterests: (guildId) => request(g(guildId, '/interests')),
  createInterest: (guildId, payload) =>
    request(g(guildId, '/interests'), { method: 'POST', body: JSON.stringify(payload) }),
  updateInterest: (guildId, id, payload) =>
    request(g(guildId, `/interests/${id}`), { method: 'PUT', body: JSON.stringify(payload) }),
  deleteInterest: (guildId, id) => request(g(guildId, `/interests/${id}`), { method: 'DELETE' }),
  publishInterests: (guildId, payload) =>
    request(g(guildId, '/interests/publish'), { method: 'POST', body: JSON.stringify(payload) }),

  getCommands: (guildId) => request(g(guildId, '/commands')),
  createCommand: (guildId, payload) =>
    request(g(guildId, '/commands'), { method: 'POST', body: JSON.stringify(payload) }),
  updateCommand: (guildId, id, payload) =>
    request(g(guildId, `/commands/${id}`), { method: 'PUT', body: JSON.stringify(payload) }),
  deleteCommand: (guildId, id) => request(g(guildId, `/commands/${id}`), { method: 'DELETE' }),

  getMessageLog: (guildId, params = '') => request(g(guildId, `/messagelog${params}`)),
  clearMessageLog: (guildId, params = '') =>
    request(g(guildId, `/messagelog${params}`), { method: 'DELETE' }),

  // --- Plugins ------------------------------------------------------------
  // Eine Handvoll Endpunkte fuer beliebig viele Erweiterungen. Der Pfad
  // enthaelt den Plugin-Namen, deshalb kommt hier bei einem neuen Plugin
  // nichts dazu.
  getPlugins: () => request('/api/guilds/plugins'),
  getPluginData: (guildId, plugin) => request(g(guildId, `/p/${encodeURIComponent(plugin)}`)),
  savePluginConfig: (guildId, plugin, cfg) =>
    request(g(guildId, `/p/${encodeURIComponent(plugin)}/config`), {
      method: 'PUT',
      body: JSON.stringify(cfg),
    }),
  addPluginItem: (guildId, plugin, list, werte) =>
    request(g(guildId, `/p/${encodeURIComponent(plugin)}/list/${encodeURIComponent(list)}`), {
      method: 'POST',
      body: JSON.stringify(werte),
    }),
  updatePluginItem: (guildId, plugin, list, id, werte) =>
    request(g(guildId, `/p/${encodeURIComponent(plugin)}/list/${encodeURIComponent(list)}/${id}`), {
      method: 'PUT',
      body: JSON.stringify(werte),
    }),
  deletePluginItem: (guildId, plugin, list, id) =>
    request(g(guildId, `/p/${encodeURIComponent(plugin)}/list/${encodeURIComponent(list)}/${id}`), {
      method: 'DELETE',
    }),
  movePluginItem: (guildId, plugin, list, id, direction) =>
    request(
      g(guildId, `/p/${encodeURIComponent(plugin)}/list/${encodeURIComponent(list)}/${id}/move`),
      { method: 'POST', body: JSON.stringify({ direction }) },
    ),
  runPluginAction: (guildId, plugin, action) =>
    request(g(guildId, `/p/${encodeURIComponent(plugin)}/action/${encodeURIComponent(action)}`), {
      method: 'POST',
    }),

  getBackups: (actorId) =>
    request(`/api/system/backups?actorId=${encodeURIComponent(actorId ?? '')}`),
  createBackup: (actorId) =>
    request('/api/system/backups', { method: 'POST', body: JSON.stringify({ actorId }) }),
};
