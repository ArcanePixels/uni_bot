import { Router } from 'express';

export function infractionRoutes(db) {
  const router = Router();

  router.get('/:guildId/infractions', (req, res) => {
    const limit = Math.min(Number(req.query.limit ?? 50) || 50, 200);
    const rows = req.query.userId
      ? db
          .prepare(
            `SELECT * FROM infractions WHERE guild_id = ? AND user_id = ?
              ORDER BY created_at DESC LIMIT ?`,
          )
          .all(req.params.guildId, req.query.userId, limit)
      : db
          .prepare('SELECT * FROM infractions WHERE guild_id = ? ORDER BY created_at DESC LIMIT ?')
          .all(req.params.guildId, limit);
    res.json(rows);
  });

  router.delete('/:guildId/infractions/:id', (req, res) => {
    const info = db
      .prepare('DELETE FROM infractions WHERE id = ? AND guild_id = ?')
      .run(req.params.id, req.params.guildId);
    if (!info.changes) return res.status(404).json({ error: 'Nicht gefunden' });
    res.status(204).end();
  });

  return router;
}
