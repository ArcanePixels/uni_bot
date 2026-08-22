import { Router } from 'express';

export function auditRoutes(db) {
  const router = Router();

  router.get('/:guildId/audit', (req, res) => {
    const limit = Math.min(Number(req.query.limit ?? 50) || 50, 200);
    res.json(
      db
        .prepare('SELECT * FROM audit_log WHERE guild_id = ? ORDER BY created_at DESC LIMIT ?')
        .all(req.params.guildId, limit),
    );
  });

  return router;
}
