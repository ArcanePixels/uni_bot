import { createLogger } from '../core/logger.js';

const log = createLogger('reaction-roles');

/**
 * Reaction Roles: Mitglieder vergeben sich Rollen selbst, indem sie auf ein
 * Emoji unter einer Nachricht klicken.
 *
 * `mode` steuert das Verhalten:
 *   multi  - beliebig viele Rollen gleichzeitig
 *   single - nur eine; die vorherige wird entfernt
 *
 * Discord meldet Reaktionen auch fuer Nachrichten, die der Bot nicht im
 * Zwischenspeicher hat. Deshalb sind die Partial-Events noetig (siehe
 * bot/src/index.js), und wir arbeiten mit den IDs statt mit Objekten.
 */

/** Erkennt sowohl Unicode-Emojis als auch benutzerdefinierte (`<:name:id>`). */
export function emojiKey(reactionEmoji) {
  return reactionEmoji.id ?? reactionEmoji.name;
}

/** Wandelt eine gespeicherte Emoji-Angabe in die Form, die Discord zum Setzen braucht. */
export function toReactionParam(stored) {
  // Benutzerdefinierte Emojis speichern wir als "name:id".
  return stored.includes(':') ? stored : stored;
}

export default {
  name: 'reaction-roles',

  setup({ db, client, audit }) {
    const findOption = db.prepare(
      `SELECT o.role_id, o.emoji, p.mode, p.guild_id, p.id AS panel_id
         FROM reaction_role_options o
         JOIN reaction_role_panels p ON p.id = o.panel_id
        WHERE p.message_id = ? AND o.emoji = ?`,
    );
    const siblingRoles = db.prepare(
      'SELECT role_id FROM reaction_role_options WHERE panel_id = ? AND role_id != ?',
    );

    async function resolve(reaction, user) {
      if (user.bot) return null;
      // Bei Teil-Daten muss die Nachricht erst nachgeladen werden.
      if (reaction.partial) {
        try {
          await reaction.fetch();
        } catch (err) {
          log.warn('Reaktion konnte nicht nachgeladen werden', err);
          return null;
        }
      }
      const key = emojiKey(reaction.emoji);
      const row = findOption.get(reaction.message.id, key);
      if (!row) return null;

      const guild = client.guilds.cache.get(row.guild_id);
      if (!guild) return null;
      const member = await guild.members.fetch(user.id).catch(() => null);
      if (!member) return null;
      return { row, guild, member };
    }

    return {
      async messageReactionAdd(reaction, user) {
        const found = await resolve(reaction, user);
        if (!found) return;
        const { row, member } = found;

        try {
          if (row.mode === 'single') {
            // Andere Rollen desselben Panels abnehmen, damit wirklich nur eine gilt.
            for (const { role_id } of siblingRoles.all(row.panel_id, row.role_id)) {
              if (member.roles.cache.has(role_id)) {
                await member.roles.remove(role_id, 'Reaction Roles: Einfachauswahl');
              }
            }
          }
          await member.roles.add(row.role_id, 'Reaction Roles');
          audit.record({
            guildId: row.guild_id,
            actorId: user.id,
            action: 'reactionrole.add',
            target: user.id,
            detail: row.role_id,
          });
        } catch (err) {
          // Fast immer die Rollenhierarchie - die Bot-Rolle steht zu tief.
          log.warn(`Rolle ${row.role_id} für ${user.id} konnte nicht vergeben werden`, err);
        }
      },

      async messageReactionRemove(reaction, user) {
        const found = await resolve(reaction, user);
        if (!found) return;
        const { row, member } = found;

        try {
          await member.roles.remove(row.role_id, 'Reaction Roles: abgewählt');
          audit.record({
            guildId: row.guild_id,
            actorId: user.id,
            action: 'reactionrole.remove',
            target: user.id,
            detail: row.role_id,
          });
        } catch (err) {
          log.warn(`Rolle ${row.role_id} für ${user.id} konnte nicht entfernt werden`, err);
        }
      },
    };
  },
};
