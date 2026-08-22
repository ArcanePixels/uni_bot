import { Router } from 'express';
import { now } from '@allrounder/shared';

// Befehlsnamen bleiben schlicht - alles andere waere kein Befehl.
const NAME_RE = /^[\w-]{1,32}$/;

export function commandRoutes(db) {
  const router = Router();

  // --- Eigene Textbefehle ---------------------------------------------------

  router.get('/:guildId/commands', (req, res) => {
    res.json(
      db
        .prepare('SELECT * FROM custom_commands WHERE guild_id = ? ORDER BY name')
        .all(req.params.guildId),
    );
  });

  router.post('/:guildId/commands', (req, res) => {
    const { name, response, roleId = null } = req.body ?? {};
    const clean = String(name ?? '').trim().toLowerCase();

    if (!clean || !response?.trim()) {
      return res.status(400).json({ error: 'name und response sind Pflicht' });
    }
    if (!NAME_RE.test(clean)) {
      return res.status(400).json({
        error: 'Der Name darf nur Buchstaben, Ziffern, _ und - enthalten (höchstens 32 Zeichen).',
      });
    }
    if (response.length > 1900) {
      return res.status(400).json({ error: 'Die Antwort darf höchstens 1900 Zeichen haben.' });
    }

    try {
      const info = db
        .prepare(
          `INSERT INTO custom_commands (guild_id, name, response, role_id, created_at)
           VALUES (?, ?, ?, ?, ?)`,
        )
        .run(req.params.guildId, clean, response, roleId, now());
      res.status(201).json({ id: info.lastInsertRowid, name: clean });
    } catch (err) {
      if (String(err.code) === 'SQLITE_CONSTRAINT_UNIQUE') {
        return res.status(409).json({ error: `Der Befehl "${clean}" existiert bereits.` });
      }
      throw err;
    }
  });

  router.put('/:guildId/commands/:id', (req, res) => {
    const existing = db
      .prepare('SELECT * FROM custom_commands WHERE id = ? AND guild_id = ?')
      .get(req.params.id, req.params.guildId);
    if (!existing) return res.status(404).json({ error: 'Nicht gefunden' });

    const { response, roleId, enabled } = req.body ?? {};
    if (response !== undefined && response.length > 1900) {
      return res.status(400).json({ error: 'Die Antwort darf höchstens 1900 Zeichen haben.' });
    }

    db.prepare(
      'UPDATE custom_commands SET response = ?, role_id = ?, enabled = ? WHERE id = ?',
    ).run(
      response ?? existing.response,
      roleId === undefined ? existing.role_id : roleId,
      enabled === undefined ? existing.enabled : enabled ? 1 : 0,
      existing.id,
    );
    res.json({ ok: true });
  });

  router.delete('/:guildId/commands/:id', (req, res) => {
    const info = db
      .prepare('DELETE FROM custom_commands WHERE id = ? AND guild_id = ?')
      .run(req.params.id, req.params.guildId);
    if (!info.changes) return res.status(404).json({ error: 'Nicht gefunden' });
    res.status(204).end();
  });

  // --- Nachrichten-Log ------------------------------------------------------

  router.get('/:guildId/messagelog', (req, res) => {
    const limit = Math.min(Number(req.query.limit ?? 100) || 100, 300);
    const rows = req.query.userId
      ? db
          .prepare(
            `SELECT * FROM message_log WHERE guild_id = ? AND author_id = ?
              ORDER BY created_at DESC LIMIT ?`,
          )
          .all(req.params.guildId, req.query.userId, limit)
      : db
          .prepare('SELECT * FROM message_log WHERE guild_id = ? ORDER BY created_at DESC LIMIT ?')
          .all(req.params.guildId, limit);
    res.json(rows);
  });

  /** Löscht die Mitschrift eines Mitglieds - etwa auf dessen Wunsch. */
  router.delete('/:guildId/messagelog', (req, res) => {
    const { userId } = req.query;
    const info = userId
      ? db
          .prepare('DELETE FROM message_log WHERE guild_id = ? AND author_id = ?')
          .run(req.params.guildId, userId)
      : db.prepare('DELETE FROM message_log WHERE guild_id = ?').run(req.params.guildId);
    res.json({ deleted: info.changes });
  });

  return router;
}
