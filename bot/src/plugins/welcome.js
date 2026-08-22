import { createLogger } from '../core/logger.js';

const log = createLogger('welcome');

/** Platzhalter im Willkommenstext ersetzen. */
export function renderTemplate(tpl, member) {
  return tpl
    .replaceAll('{user}', `<@${member.id}>`)
    .replaceAll('{username}', member.user.username)
    .replaceAll('{server}', member.guild.name)
    .replaceAll('{count}', String(member.guild.memberCount));
}

export default {
  name: 'welcome',

  setup({ settings, audit }) {
    return {
      async guildMemberAdd(member) {
        const cfg = settings.get(member.guild.id).welcome;
        if (!cfg.enabled) return;

        if (cfg.channelId) {
          const channel = await member.client.channels.fetch(cfg.channelId).catch(() => null);
          if (channel) {
            await channel.send(renderTemplate(cfg.message, member)).catch((err) =>
              log.warn(`Willkommensnachricht in ${cfg.channelId} fehlgeschlagen`, err),
            );
          } else {
            log.warn(`Willkommens-Kanal ${cfg.channelId} nicht erreichbar (geloescht?)`);
          }
        }

        // Autorole einzeln vergeben, damit eine unzustellbare Rolle die
        // anderen nicht mit blockiert.
        for (const roleId of cfg.autoroleIds) {
          try {
            await member.roles.add(roleId, 'Autorole beim Join');
            audit.record({
              guildId: member.guild.id,
              actorId: 'bot',
              action: 'welcome.autorole',
              target: member.id,
              detail: roleId,
            });
          } catch (err) {
            log.warn(`Autorole ${roleId} fuer ${member.id} fehlgeschlagen`, err);
          }
        }
      },
    };
  },
};
