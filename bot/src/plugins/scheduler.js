import { Cron } from 'croner';
import { now } from '@allrounder/shared';
import { createLogger } from '../core/logger.js';

const log = createLogger('scheduler');

const TICK_MS = 30_000;

/**
 * Geplante Posts. Zwei Sorten:
 *   - `cron` gesetzt  -> wiederkehrend nach Cron-Ausdruck
 *   - `run_at` gesetzt -> einmalig zum Zeitpunkt, danach deaktiviert
 *
 * Statt fuer jeden Eintrag einen Timer zu halten, prueft ein Tick alle 30s
 * die faelligen Posts. Das ueberlebt Neustarts und Aenderungen ueber die API,
 * ohne dass Timer nachgezogen werden muessen.
 */
export default {
  name: 'scheduler',

  setup({ db, client, audit }) {
    const selectDue = db.prepare('SELECT * FROM scheduled_posts WHERE enabled = 1');
    const markRun = db.prepare('UPDATE scheduled_posts SET last_run_at = ? WHERE id = ?');
    const disable = db.prepare('UPDATE scheduled_posts SET enabled = 0, last_run_at = ? WHERE id = ?');

    function isDue(post, ts) {
      if (post.run_at) return post.run_at <= ts;
      if (!post.cron) return false;
      try {
        // Faellig, wenn seit dem letzten Lauf ein Cron-Slot vergangen ist.
        const ref = post.last_run_at ? new Date(post.last_run_at * 1000) : new Date((ts - 1) * 1000);
        const next = new Cron(post.cron).nextRun(ref);
        return next !== null && next.getTime() / 1000 <= ts;
      } catch (err) {
        log.error(`Ungueltiger Cron-Ausdruck in Post ${post.id}: "${post.cron}"`, err);
        return false;
      }
    }

    async function tick() {
      const ts = now();
      for (const post of selectDue.all()) {
        if (!isDue(post, ts)) continue;
        const channel = await client.channels.fetch(post.channel_id).catch(() => null);
        if (!channel) {
          log.warn(`Post ${post.id}: Kanal ${post.channel_id} nicht erreichbar, deaktiviere`);
          disable.run(ts, post.id);
          continue;
        }
        try {
          await channel.send(post.content);
          post.run_at ? disable.run(ts, post.id) : markRun.run(ts, post.id);
          audit.record({
            guildId: post.guild_id,
            actorId: 'scheduler',
            action: 'scheduler.post',
            target: post.channel_id,
            detail: `Post ${post.id}`,
          });
        } catch (err) {
          log.error(`Post ${post.id} konnte nicht gesendet werden`, err);
        }
      }
    }

    this._timer = setInterval(() => {
      tick().catch((err) => log.error('Scheduler-Tick gescheitert', err));
    }, TICK_MS);
    this._timer.unref?.();

    return {
      ready: () => tick().catch((err) => log.error('Erster Scheduler-Lauf gescheitert', err)),
    };
  },

  teardown() {
    clearInterval(this._timer);
  },
};
