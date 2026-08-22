import { Router } from 'express';
import { now } from '@allrounder/shared';

export function scheduledRoutes(db) {
  const router = Router();

  router.get('/:guildId/scheduled', (req, res) => {
    res.json(
      db
        .prepare('SELECT * FROM scheduled_posts WHERE guild_id = ? ORDER BY id DESC')
        .all(req.params.guildId),
    );
  });

  router.post('/:guildId/scheduled', (req, res) => {
    const { channelId, content, cron = null, runAt = null } = req.body ?? {};
    if (!channelId || !content) {
      return res.status(400).json({ error: 'channelId und content sind Pflicht' });
    }
    // Genau eine der beiden Zeitangaben - sonst waere unklar, was gilt.
    if (Boolean(cron) === Boolean(runAt)) {
      return res.status(400).json({ error: 'Entweder cron ODER runAt angeben' });
    }
    const info = db
      .prepare(
        `INSERT INTO scheduled_posts (guild_id, channel_id, content, cron, run_at, created_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
      )
      .run(req.params.guildId, channelId, content, cron, runAt, now());
    res.status(201).json({ id: info.lastInsertRowid });
  });

  router.delete('/:guildId/scheduled/:id', (req, res) => {
    const info = db
      .prepare('DELETE FROM scheduled_posts WHERE id = ? AND guild_id = ?')
      .run(req.params.id, req.params.guildId);
    if (!info.changes) return res.status(404).json({ error: 'Nicht gefunden' });
    res.status(204).end();
  });

  return router;
}
