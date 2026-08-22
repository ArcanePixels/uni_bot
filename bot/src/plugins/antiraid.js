import { createLogger } from '../core/logger.js';

const log = createLogger('antiraid');

/**
 * Anti-Raid: erkennt Massen-Joins in kurzer Zeit und schaltet den Server in
 * einen Lockdown.
 *
 * Bewusst zurueckhaltend: Der Lockdown setzt die Verifizierungsstufe hoch und
 * meldet es den Moderatoren. Automatisches Kicken oder Bannen waere zu riskant –
 * ein falscher Alarm wuerde echte Mitglieder treffen, etwa wenn der Server
 * gerade irgendwo verlinkt wurde.
 */

// Discord-Verifizierungsstufen.
const VERIFICATION = { NONE: 0, LOW: 1, MEDIUM: 2, HIGH: 3, VERY_HIGH: 4 };

/** Gleitendes Zeitfenster über die Joins je Server. */
export class JoinTracker {
  #joins = new Map();

  push(guildId, windowSeconds, ts = Date.now()) {
    const cutoff = ts - windowSeconds * 1000;
    const kept = (this.#joins.get(guildId) ?? []).filter((t) => t > cutoff);
    kept.push(ts);
    this.#joins.set(guildId, kept);
    return kept.length;
  }

  clear(guildId) {
    this.#joins.delete(guildId);
  }
}

export default {
  name: 'antiraid',

  setup({ settings, client, audit }) {
    const tracker = new JoinTracker();
    // Merkt sich je Server, ob gerade ein Lockdown läuft, und die vorherige Stufe.
    const lockdowns = new Map();

    async function lift(guildId) {
      const state = lockdowns.get(guildId);
      if (!state) return;
      lockdowns.delete(guildId);
      clearTimeout(state.timer);

      const guild = client.guilds.cache.get(guildId);
      if (!guild) return;
      try {
        await guild.setVerificationLevel(state.previousLevel, 'Anti-Raid: Lockdown beendet');
        audit.record({
          guildId,
          actorId: 'antiraid',
          action: 'antiraid.unlock',
          detail: 'Lockdown automatisch beendet',
        });
        log.info(`Lockdown auf ${guildId} beendet`);
      } catch (err) {
        log.warn(`Lockdown auf ${guildId} konnte nicht beendet werden`, err);
      }
    }

    async function engage(guild, cfg, joinCount) {
      if (lockdowns.has(guild.id)) return; // läuft schon

      const previousLevel = guild.verificationLevel;
      const timer = setTimeout(() => lift(guild.id), cfg.lockdownMinutes * 60_000);
      timer.unref?.();
      lockdowns.set(guild.id, { previousLevel, timer });

      try {
        await guild.setVerificationLevel(
          VERIFICATION.HIGH,
          `Anti-Raid: ${joinCount} Beitritte in ${cfg.windowSeconds}s`,
        );
        log.warn(`Lockdown auf ${guild.name}: ${joinCount} Beitritte in ${cfg.windowSeconds}s`);
      } catch (err) {
        // Ohne die Berechtigung "Server verwalten" geht das nicht - dann bleibt
        // wenigstens die Meldung an die Moderatoren.
        log.error('Verifizierungsstufe konnte nicht gesetzt werden', err);
      }

      audit.record({
        guildId: guild.id,
        actorId: 'antiraid',
        action: 'antiraid.lockdown',
        detail: `${joinCount} Beitritte in ${cfg.windowSeconds}s`,
      });

      if (cfg.alertChannelId) {
        const channel = await client.channels.fetch(cfg.alertChannelId).catch(() => null);
        await channel
          ?.send(
            `**Anti-Raid ausgelöst** – ${joinCount} Beitritte in ${cfg.windowSeconds} Sekunden.\n` +
              `Die Verifizierungsstufe wurde für ${cfg.lockdownMinutes} Minuten hochgesetzt. ` +
              `Prüft die neuen Mitglieder.`,
          )
          .catch(() => {});
      }
    }

    return {
      async guildMemberAdd(member) {
        const cfg = settings.get(member.guild.id).antiraid;
        if (!cfg?.enabled) return;

        const count = tracker.push(member.guild.id, cfg.windowSeconds);
        if (count >= cfg.maxJoins) {
          await engage(member.guild, cfg, count);
          tracker.clear(member.guild.id);
        }
      },
    };
  },
};
