import { now } from '@allrounder/shared';

/**
 * Verstoss-Buchhaltung. Getrennt vom Automod-Plugin, damit spaetere Module
 * (Mod-Commands, Dashboard) dieselbe Logik nutzen statt sie nachzubauen.
 */
export class InfractionService {
  #db;

  constructor(db) {
    this.#db = db;
  }

  record({ guildId, userId, rule, action, reason, moderator = 'automod', expiresAt = null }) {
    const info = this.#db
      .prepare(
        `INSERT INTO infractions (guild_id, user_id, moderator, rule, action, reason, created_at, expires_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(guildId, userId, moderator, rule, action, reason ?? null, now(), expiresAt);
    return info.lastInsertRowid;
  }

  /** Zaehlt nur Verstoesse innerhalb des Decay-Fensters. */
  countActive(guildId, userId, decayDays) {
    const since = now() - decayDays * 86400;
    const row = this.#db
      .prepare(
        'SELECT COUNT(*) AS n FROM infractions WHERE guild_id = ? AND user_id = ? AND created_at >= ?',
      )
      .get(guildId, userId, since);
    return row.n;
  }

  history(guildId, userId, limit = 25) {
    return this.#db
      .prepare(
        `SELECT id, moderator, rule, action, reason, created_at
           FROM infractions WHERE guild_id = ? AND user_id = ?
          ORDER BY created_at DESC LIMIT ?`,
      )
      .all(guildId, userId, limit);
  }
}

/**
 * Waehlt die haerteste Stufe, deren Schwelle der Zaehler erreicht hat.
 * Bei count=4 und Stufen [1:warn, 3:timeout, 5:kick] greift also timeout.
 */
export function resolveEscalation(escalation, count) {
  let match = null;
  for (const step of escalation) {
    if (count >= step.at && (match === null || step.at > match.at)) match = step;
  }
  return match;
}
