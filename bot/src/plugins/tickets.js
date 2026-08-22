import { ChannelType, PermissionFlagsBits } from 'discord.js';
import { now } from '@allrounder/shared';
import { createLogger } from '../core/logger.js';

const log = createLogger('tickets');

const OPEN_EMOJI = '🎫';
const CLOSE_EMOJI = '🔒';

/**
 * Ticket-System: Mitglieder öffnen per Klick auf ein Emoji einen privaten
 * Kanal für Support-Anfragen.
 *
 * Der Kanal ist nur für den Ersteller, die Mod-Rollen und den Bot sichtbar.
 * Geschlossen wird über eine Reaktion im Ticket selbst; der Kanal bleibt
 * zunächst bestehen, damit nichts verloren geht.
 */
export default {
  name: 'tickets',

  setup({ db, client, settings, audit }) {
    const openCount = db.prepare(
      "SELECT COUNT(*) AS n FROM tickets WHERE guild_id = ? AND user_id = ? AND status = 'offen'",
    );
    const createTicket = db.prepare(
      `INSERT INTO tickets (guild_id, channel_id, user_id, subject, created_at)
       VALUES (?, ?, ?, ?, ?)`,
    );
    const findByChannel = db.prepare(
      "SELECT * FROM tickets WHERE channel_id = ? AND status = 'offen'",
    );
    const closeTicket = db.prepare(
      "UPDATE tickets SET status = 'geschlossen', closed_by = ?, closed_at = ? WHERE id = ?",
    );

    async function open(guild, user, cfg) {
      const already = openCount.get(guild.id, user.id).n;
      if (already >= (cfg.maxOpenPerUser ?? 1)) {
        log.info(`${user.id} hat bereits ${already} offene Tickets`);
        return;
      }

      // Nur Ersteller, Mod-Rollen und Bot dürfen hineinsehen.
      const overwrites = [
        { id: guild.roles.everyone.id, deny: [PermissionFlagsBits.ViewChannel] },
        {
          id: user.id,
          allow: [
            PermissionFlagsBits.ViewChannel,
            PermissionFlagsBits.SendMessages,
            PermissionFlagsBits.ReadMessageHistory,
          ],
        },
        {
          id: client.user.id,
          allow: [
            PermissionFlagsBits.ViewChannel,
            PermissionFlagsBits.SendMessages,
            PermissionFlagsBits.ManageChannels,
            PermissionFlagsBits.ReadMessageHistory,
          ],
        },
        ...(cfg.modRoleIds ?? []).map((id) => ({
          id,
          allow: [
            PermissionFlagsBits.ViewChannel,
            PermissionFlagsBits.SendMessages,
            PermissionFlagsBits.ReadMessageHistory,
          ],
        })),
      ];

      let channel;
      try {
        channel = await guild.channels.create({
          name: `ticket-${user.username}`.slice(0, 90),
          type: ChannelType.GuildText,
          parent: cfg.categoryId || undefined,
          permissionOverwrites: overwrites,
          reason: `Ticket von ${user.tag}`,
        });
      } catch (err) {
        log.error('Ticket-Kanal konnte nicht angelegt werden', err);
        return;
      }

      createTicket.run(guild.id, channel.id, user.id, null, now());
      audit.record({
        guildId: guild.id,
        actorId: user.id,
        action: 'ticket.open',
        target: channel.id,
      });

      const greeting =
        cfg.greeting?.trim() ||
        'Hallo {user}, schildere hier dein Anliegen. Ein Mod meldet sich.';
      const msg = await channel
        .send(`${greeting.replaceAll('{user}', `<@${user.id}>`)}\n\n_Zum Schließen auf ${CLOSE_EMOJI} klicken._`)
        .catch(() => null);
      await msg?.react(CLOSE_EMOJI).catch(() => {});
      log.info(`Ticket ${channel.id} für ${user.id} geöffnet`);
    }

    async function close(channel, ticket, closerId) {
      closeTicket.run(closerId, now(), ticket.id);
      audit.record({
        guildId: ticket.guild_id,
        actorId: closerId,
        action: 'ticket.close',
        target: channel.id,
      });

      await channel
        .send('**Ticket geschlossen.** Der Kanal wird in 30 Sekunden entfernt.')
        .catch(() => {});
      // Kurze Frist, damit noch jemand mitlesen oder etwas kopieren kann.
      setTimeout(() => {
        channel.delete('Ticket geschlossen').catch((err) => log.warn('Kanal löschen fehlgeschlagen', err));
      }, 30_000).unref?.();
    }

    return {
      async messageReactionAdd(reaction, user) {
        if (user.bot) return;
        if (reaction.partial) {
          try {
            await reaction.fetch();
          } catch {
            return;
          }
        }
        const guild = reaction.message.guild;
        if (!guild) return;
        const cfg = settings.get(guild.id).tickets;
        if (!cfg?.enabled) return;

        // Klick auf die Eröffnungsnachricht?
        if (reaction.emoji.name === OPEN_EMOJI && reaction.message.id === cfg.panelMessageId) {
          await reaction.users.remove(user.id).catch(() => {});
          const member = await guild.members.fetch(user.id).catch(() => null);
          if (member) await open(guild, member.user, cfg);
          return;
        }

        // Klick auf Schließen innerhalb eines Tickets?
        if (reaction.emoji.name === CLOSE_EMOJI) {
          const ticket = findByChannel.get(reaction.message.channelId);
          if (!ticket) return;
          const member = await guild.members.fetch(user.id).catch(() => null);
          const isMod =
            member?.permissions.has(PermissionFlagsBits.ManageMessages) ||
            (cfg.modRoleIds ?? []).some((r) => member?.roles.cache.has(r));
          // Schließen darf der Ersteller selbst oder ein Moderator.
          if (user.id !== ticket.user_id && !isMod) return;
          await close(reaction.message.channel, ticket, user.id);
        }
      },
    };
  },
};

export const __test__ = { OPEN_EMOJI, CLOSE_EMOJI };
