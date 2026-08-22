import { Router } from 'express';
import { now } from '@allrounder/shared';

// YouTube-Kanal-IDs sind 24 Zeichen und beginnen mit "UC".
const YT_ID_RE = /^UC[\w-]{22}$/;

export function youtubeRoutes(db) {
  const router = Router();

  router.get('/:guildId/youtube', (req, res) => {
    res.json(db.prepare('SELECT * FROM youtube_feeds WHERE guild_id = ?').all(req.params.guildId));
  });

  router.post('/:guildId/youtube', (req, res) => {
    const { ytChannelId, channelId, template = null } = req.body ?? {};
    if (!ytChannelId || !channelId) {
      return res.status(400).json({ error: 'ytChannelId und channelId sind Pflicht' });
    }
    if (!YT_ID_RE.test(ytChannelId)) {
      return res.status(400).json({
        error: 'ytChannelId muss eine YouTube-Kanal-ID sein (beginnt mit UC), kein Handle oder Link',
      });
    }
    try {
      const info = db
        .prepare(
          `INSERT INTO youtube_feeds (guild_id, channel_id, yt_channel_id, template, created_at)
           VALUES (?, ?, ?, ?, ?)`,
        )
        .run(req.params.guildId, channelId, ytChannelId, template, now());
      res.status(201).json({ id: info.lastInsertRowid });
    } catch (err) {
      if (String(err.code) === 'SQLITE_CONSTRAINT_UNIQUE') {
        return res.status(409).json({ error: 'Dieser Kanal wird bereits beobachtet' });
      }
      throw err;
    }
  });

  /**
   * Stoesst eine Pruefung ausserhalb der Reihe an.
   *
   * Der Bot laeuft in einem eigenen Prozess - die API kann den Feed-Abruf
   * nicht direkt ausloesen. Sie hinterlegt deshalb eine Anforderung in der
   * Datenbank, die der Bot binnen weniger Sekunden aufgreift.
   */
  router.post('/:guildId/youtube/check', (req, res) => {
    const feeds = db
      .prepare('SELECT COUNT(*) AS n FROM youtube_feeds WHERE guild_id = ? AND enabled = 1')
      .get(req.params.guildId).n;
    if (!feeds) {
      return res.status(400).json({ error: 'Es ist kein YouTube-Kanal eingetragen.' });
    }

    db.prepare(
      `INSERT INTO check_requests (kind, requested_at) VALUES ('youtube', ?)
       ON CONFLICT(kind) DO UPDATE SET requested_at = excluded.requested_at`,
    ).run(now());

    res.json({ ok: true, feeds });
  });

  router.delete('/:guildId/youtube/:id', (req, res) => {
    const info = db
      .prepare('DELETE FROM youtube_feeds WHERE id = ? AND guild_id = ?')
      .run(req.params.id, req.params.guildId);
    if (!info.changes) return res.status(404).json({ error: 'Nicht gefunden' });
    res.status(204).end();
  });

  return router;
}
