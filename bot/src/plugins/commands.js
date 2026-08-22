import {
  ApplicationCommandOptionType,
  ApplicationCommandType,
  MessageFlags,
  PermissionFlagsBits,
} from 'discord.js';
import { now } from '@allrounder/shared';
import { createLogger } from '../core/logger.js';
import { resolveEscalation } from '../core/infractions.js';
import { buildOverview } from './custom-commands.js';
import { SLASH_COMMANDS } from '@allrounder/shared/slash-commands';

const log = createLogger('commands');

/**
 * Slash-Commands fuer den Alltag der Moderation.
 *
 * Die Rechtepruefung laeuft doppelt: Discord blendet Befehle ohne die noetige
 * Berechtigung gar nicht erst ein (`default_member_permissions`), und der
 * Handler prueft es nochmal - Discords Angabe ist eine Voreinstellung, die
 * Server-Owner ueberschreiben koennen.
 */

const MOD = String(PermissionFlagsBits.ModerateMembers);

/**
 * Prueft beim Start, dass die Beschreibung in `shared` und die hier
 * angemeldeten Befehle zusammenpassen. Laufen sie auseinander, zeigt das
 * Dashboard etwas anderes an, als der Bot tatsaechlich kann.
 */
export function findMismatch(commands, described) {
  const a = new Set(commands.map((c) => c.name));
  const b = new Set(described.map((c) => c.name));
  const fehlt = [...a].filter((n) => !b.has(n));
  const zuviel = [...b].filter((n) => !a.has(n));
  return fehlt.length || zuviel.length ? { fehlt, zuviel } : null;
}

export const COMMANDS = [
  {
    name: 'warn',
    description: 'Verwarnt ein Mitglied und zählt den Verstoß mit',
    type: ApplicationCommandType.ChatInput,
    default_member_permissions: MOD,
    options: [
      {
        name: 'mitglied',
        description: 'Wer wird verwarnt',
        type: ApplicationCommandOptionType.User,
        required: true,
      },
      {
        name: 'grund',
        description: 'Warum',
        type: ApplicationCommandOptionType.String,
        required: false,
      },
    ],
  },
  {
    name: 'history',
    description: 'Zeigt die Verstöße eines Mitglieds',
    type: ApplicationCommandType.ChatInput,
    default_member_permissions: MOD,
    options: [
      {
        name: 'mitglied',
        description: 'Wessen Verstöße',
        type: ApplicationCommandOptionType.User,
        required: true,
      },
    ],
  },
  {
    name: 'timeout',
    description: 'Schaltet ein Mitglied vorübergehend stumm',
    type: ApplicationCommandType.ChatInput,
    default_member_permissions: MOD,
    options: [
      {
        name: 'mitglied',
        description: 'Wer wird stummgeschaltet',
        type: ApplicationCommandOptionType.User,
        required: true,
      },
      {
        name: 'minuten',
        description: 'Wie lange (1 bis 40320)',
        type: ApplicationCommandOptionType.Integer,
        required: true,
        min_value: 1,
        max_value: 40320,
      },
      {
        name: 'grund',
        description: 'Warum',
        type: ApplicationCommandOptionType.String,
        required: false,
      },
    ],
  },
  {
    name: 'befehle',
    description: 'Zeigt, welche eigenen Textbefehle es auf diesem Server gibt',
    type: ApplicationCommandType.ChatInput,
    // Bewusst ohne Rechteangabe: Die Uebersicht zeigt nur, was der Aufrufer
    // ohnehin nutzen darf.
  },
  {
    name: 'clear',
    description: 'Löscht die letzten Nachrichten in diesem Kanal',
    type: ApplicationCommandType.ChatInput,
    default_member_permissions: String(PermissionFlagsBits.ManageMessages),
    options: [
      {
        name: 'anzahl',
        description: 'Wie viele (1 bis 100)',
        type: ApplicationCommandOptionType.Integer,
        required: true,
        min_value: 1,
        max_value: 100,
      },
      {
        name: 'mitglied',
        description: 'Nur Nachrichten dieses Mitglieds',
        type: ApplicationCommandOptionType.User,
        required: false,
      },
    ],
  },
];

function formatDate(ts) {
  return `<t:${ts}:d>`;
}

export default {
  name: 'commands',

  setup({ db, client, settings, infractions, audit }) {
    const RULE_LABEL = { wortfilter: 'Wortfilter', spam: 'Spam', link: 'Link', manuell: 'von Hand' };
    const ACTION_LABEL = { warn: 'Verwarnung', timeout: 'Timeout', kick: 'Kick', ban: 'Ban' };

    /** Antwortet nur dem Aufrufer sichtbar. */
    const reply = (interaction, content) =>
      interaction.reply({ content, flags: MessageFlags.Ephemeral });

    async function handleWarn(interaction) {
      const target = interaction.options.getUser('mitglied');
      const reason = interaction.options.getString('grund')?.trim() || 'Ohne Angabe';
      const cfg = settings.get(interaction.guildId).automod;

      if (target.bot) return reply(interaction, 'Bots lassen sich nicht verwarnen.');
      if (target.id === interaction.user.id) {
        return reply(interaction, 'Du kannst dich nicht selbst verwarnen.');
      }

      const count = infractions.countActive(interaction.guildId, target.id, cfg.decayDays) + 1;
      infractions.record({
        guildId: interaction.guildId,
        userId: target.id,
        moderator: interaction.user.id,
        rule: 'manuell',
        action: 'warn',
        reason,
      });
      audit.record({
        guildId: interaction.guildId,
        actorId: interaction.user.id,
        action: 'mod.warn',
        target: target.id,
        detail: reason,
      });

      // Hinweis, falls die Eskalation beim nächsten Verstoß härter ausfällt.
      const next = resolveEscalation(cfg.escalation, count + 1);
      const hint =
        next && next.action !== 'warn'
          ? `\nBeim nächsten Verstoß greift: **${ACTION_LABEL[next.action] ?? next.action}**.`
          : '';

      await reply(
        interaction,
        `**${target.username}** verwarnt (Verstoß ${count}). Grund: ${reason}${hint}`,
      );

      if (cfg.logChannelId) {
        const ch = await client.channels.fetch(cfg.logChannelId).catch(() => null);
        await ch
          ?.send(
            `**Verwarnung** – <@${target.id}> von <@${interaction.user.id}>. Grund: ${reason} (Verstoß ${count})`,
          )
          .catch(() => {});
      }
    }

    async function handleHistory(interaction) {
      const target = interaction.options.getUser('mitglied');
      const rows = infractions.history(interaction.guildId, target.id, 15);
      if (!rows.length) {
        return reply(interaction, `Für **${target.username}** ist nichts erfasst.`);
      }

      const cfg = settings.get(interaction.guildId).automod;
      const active = infractions.countActive(interaction.guildId, target.id, cfg.decayDays);
      const lines = rows.map(
        (r) =>
          `${formatDate(r.created_at)} · ${RULE_LABEL[r.rule] ?? r.rule} · ` +
          `**${ACTION_LABEL[r.action] ?? r.action}**${r.reason ? ` – ${r.reason}` : ''}`,
      );

      await reply(
        interaction,
        `**${target.username}** – ${active} aktive${active === 1 ? 'r' : ''} Verstoß` +
          `${active === 1 ? '' : 'e'} (verfallen nach ${cfg.decayDays} Tagen)\n\n${lines.join('\n')}`,
      );
    }

    async function handleTimeout(interaction) {
      const target = interaction.options.getUser('mitglied');
      const minutes = interaction.options.getInteger('minuten');
      const reason = interaction.options.getString('grund')?.trim() || 'Ohne Angabe';

      const member = await interaction.guild.members.fetch(target.id).catch(() => null);
      if (!member) return reply(interaction, 'Dieses Mitglied ist nicht auf dem Server.');
      if (!member.moderatable) {
        return reply(
          interaction,
          'Discord lässt das nicht zu – meist steht die Bot-Rolle nicht über der des Mitglieds.',
        );
      }

      try {
        await member.timeout(minutes * 60_000, `${interaction.user.tag}: ${reason}`);
      } catch (err) {
        log.warn(`Timeout für ${target.id} fehlgeschlagen`, err);
        return reply(interaction, `Hat nicht geklappt: ${err.message}`);
      }

      infractions.record({
        guildId: interaction.guildId,
        userId: target.id,
        moderator: interaction.user.id,
        rule: 'manuell',
        action: 'timeout',
        reason,
      });
      audit.record({
        guildId: interaction.guildId,
        actorId: interaction.user.id,
        action: 'mod.timeout',
        target: target.id,
        detail: `${minutes} Min: ${reason}`,
      });

      await reply(interaction, `**${target.username}** für ${minutes} Minuten stummgeschaltet.`);
    }

    async function handleClear(interaction) {
      const amount = interaction.options.getInteger('anzahl');
      const only = interaction.options.getUser('mitglied');

      await interaction.deferReply({ flags: MessageFlags.Ephemeral });
      try {
        const fetched = await interaction.channel.messages.fetch({ limit: 100 });
        // Discord löscht nur Nachrichten, die jünger als 14 Tage sind.
        const cutoff = Date.now() - 14 * 86400_000;
        let list = [...fetched.values()].filter((m) => m.createdTimestamp > cutoff);
        if (only) list = list.filter((m) => m.author.id === only.id);
        list = list.slice(0, amount);

        if (!list.length) {
          return interaction.editReply('Nichts zu löschen – nichts passt oder alles ist zu alt.');
        }
        const deleted = await interaction.channel.bulkDelete(list, true);

        audit.record({
          guildId: interaction.guildId,
          actorId: interaction.user.id,
          action: 'mod.clear',
          target: interaction.channelId,
          detail: `${deleted.size} Nachrichten${only ? ` von ${only.username}` : ''}`,
        });
        await interaction.editReply(
          `${deleted.size} Nachricht${deleted.size === 1 ? '' : 'en'} gelöscht.` +
            (deleted.size < list.length ? ' Ältere als 14 Tage lassen sich nicht löschen.' : ''),
        );
      } catch (err) {
        log.error('Löschen fehlgeschlagen', err);
        await interaction.editReply(`Hat nicht geklappt: ${err.message}`);
      }
    }

    async function handleBefehle(interaction) {
      const cfg = settings.get(interaction.guildId).customCommands;
      if (!cfg?.enabled) {
        return reply(interaction, 'Eigene Textbefehle sind auf diesem Server ausgeschaltet.');
      }
      const rows = db
        .prepare(
          'SELECT name, role_id FROM custom_commands WHERE guild_id = ? AND enabled = 1 ORDER BY name',
        )
        .all(interaction.guildId);

      await reply(
        interaction,
        buildOverview(
          rows,
          (roleId) => Boolean(interaction.member?.roles?.cache?.has(roleId)),
          cfg.prefix,
        ),
      );
    }

    const HANDLERS = {
      warn: handleWarn,
      befehle: handleBefehle,
      history: handleHistory,
      timeout: handleTimeout,
      clear: handleClear,
    };

    return {
      /** Befehle bei Discord anmelden, sobald der Bot verbunden ist. */
      async ready() {
        const abweichung = findMismatch(COMMANDS, SLASH_COMMANDS);
        if (abweichung) {
          log.warn(
            'Die Befehlsbeschreibung in shared/slash-commands.js passt nicht zu den ' +
              `angemeldeten Befehlen. Nicht beschrieben: [${abweichung.fehlt.join(', ')}], ` +
              `beschrieben aber nicht vorhanden: [${abweichung.zuviel.join(', ')}]. ` +
              'Das Dashboard zeigt dadurch etwas Falsches an.',
          );
        }
        try {
          await client.application.commands.set(COMMANDS);
          log.info(`${COMMANDS.length} Slash-Commands angemeldet`);
        } catch (err) {
          log.error('Slash-Commands konnten nicht angemeldet werden', err);
        }
      },

      async interactionCreate(interaction) {
        if (!interaction.isChatInputCommand()) return;
        const handler = HANDLERS[interaction.commandName];
        if (!handler) return;

        // Discords Rechteangabe ist nur eine Voreinstellung - hier nochmal prüfen.
        // /befehle ist bewusst für alle: es zeigt nur, was ohnehin nutzbar ist.
        if (interaction.commandName !== 'befehle') {
          const needed =
            interaction.commandName === 'clear'
              ? PermissionFlagsBits.ManageMessages
              : PermissionFlagsBits.ModerateMembers;
          if (!interaction.memberPermissions?.has(needed)) {
            return reply(interaction, 'Dafür fehlt dir die Berechtigung.');
          }
        }

        try {
          await handler(interaction);
        } catch (err) {
          log.error(`Befehl /${interaction.commandName} fehlgeschlagen`, err);
          const msg = 'Da ist etwas schiefgegangen. Details stehen im Bot-Log.';
          interaction.deferred || interaction.replied
            ? await interaction.editReply(msg).catch(() => {})
            : await reply(interaction, msg).catch(() => {});
        }
      },
    };
  },
};
