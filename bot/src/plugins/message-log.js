import { createLogger } from '../core/logger.js';

const log = createLogger('message-log');

/**
 * Schreibt bearbeitete und geloeschte Nachrichten mit.
 *
 * Discord selbst protokolliert Nachrichteninhalte nicht - bei Streitigkeiten
 * ist das oft das Einzige, was nachtraeglich Klarheit bringt.
 *
 * Datenschutz-Hinweis: Das ist eine Mitschrift von Inhalten. Deshalb
 * standardmaessig aus, mit einstellbarer Aufbewahrungsdauer und der
 * Moeglichkeit, Kanaele auszunehmen.
 */

const MAX_LEN = 1800; // Discord-Nachrichten fassen 2000 Zeichen

export function truncate(text, max = MAX_LEN) {
  const s = String(text ?? '');
  return s.length > max ? `${s.slice(0, max)}…` : s;
}

/** Fällt die Nachricht unter die Mitschrift? */
export function shouldLog(cfg, { channelId, authorIsBot, categoryId }) {
  if (!cfg?.enabled) return false;
  if (authorIsBot && !cfg.includeBots) return false;
  if (cfg.ignoredChannelIds?.includes(channelId)) return false;
  if (categoryId && cfg.ignoredChannelIds?.includes(categoryId)) return false;
  return true;
}

export default {
  name: 'message-log',

  setup({ settings, client, db }) {
    const insert = db.prepare(
      `INSERT INTO message_log (guild_id, channel_id, message_id, author_id, kind, content_before, content_after, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    );
    const prune = db.prepare('DELETE FROM message_log WHERE created_at < ?');

    // Einmal am Tag alte Einträge wegräumen.
    const pruneTimer = setInterval(() => {
      try {
        // Die längste Aufbewahrung über alle Server bestimmt, was bleibt.
        const rows = db.prepare('SELECT settings_json FROM guild_settings').all();
        let maxDays = 7;
        for (const r of rows) {
          try {
            const days = JSON.parse(r.settings_json)?.messageLog?.keepDays;
            if (Number.isFinite(days)) maxDays = Math.max(maxDays, days);
          } catch {
            // Kaputtes JSON ignorieren - der Settings-Store meldet das ohnehin.
          }
        }
        const cutoff = Math.floor(Date.now() / 1000) - maxDays * 86400;
        const info = prune.run(cutoff);
        if (info.changes) log.info(`${info.changes} alte Log-Einträge entfernt`);
      } catch (err) {
        log.warn('Aufräumen des Nachrichten-Logs fehlgeschlagen', err);
      }
    }, 24 * 3600_000);
    pruneTimer.unref?.();

    async function post(cfg, guild, text) {
      if (!cfg.channelId) return;
      const ch = await client.channels.fetch(cfg.channelId).catch(() => null);
      await ch?.send({ content: text, allowedMentions: { parse: [] } }).catch(() => {});
    }

    return {
      async messageUpdate(before, after) {
        // Bei Teil-Daten fehlt der alte Inhalt - dann bringt der Eintrag nichts.
        if (!after.guild || after.author?.bot === undefined) return;
        const cfg = settings.get(after.guild.id).messageLog;
        if (
          !shouldLog(cfg, {
            channelId: after.channelId,
            authorIsBot: after.author.bot,
            categoryId: after.channel?.parentId,
          })
        ) {
          return;
        }
        if (before.content === after.content) return; // etwa nur eine Einbettung geladen

        insert.run(
          after.guild.id,
          after.channelId,
          after.id,
          after.author.id,
          'edit',
          truncate(before.content),
          truncate(after.content),
          Math.floor(Date.now() / 1000),
        );

        await post(
          cfg,
          after.guild,
          `**Nachricht bearbeitet** von <@${after.author.id}> in <#${after.channelId}>\n` +
            `**Vorher:** ${truncate(before.content, 700) || '_leer_'}\n` +
            `**Nachher:** ${truncate(after.content, 700) || '_leer_'}\n` +
            `[Zur Nachricht](${after.url})`,
        );
      },

      async messageDelete(message) {
        if (!message.guild || !message.author) return;
        const cfg = settings.get(message.guild.id).messageLog;
        if (
          !shouldLog(cfg, {
            channelId: message.channelId,
            authorIsBot: message.author.bot,
            categoryId: message.channel?.parentId,
          })
        ) {
          return;
        }

        insert.run(
          message.guild.id,
          message.channelId,
          message.id,
          message.author.id,
          'delete',
          truncate(message.content),
          null,
          Math.floor(Date.now() / 1000),
        );

        const attachments = message.attachments?.size
          ? `\n_${message.attachments.size} Anhang/Anhänge waren dabei._`
          : '';
        await post(
          cfg,
          message.guild,
          `**Nachricht gelöscht** von <@${message.author.id}> in <#${message.channelId}>\n` +
            `${truncate(message.content, 900) || '_kein Text_'}${attachments}`,
        );
      },
    };
  },
};
