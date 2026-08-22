import { Router } from 'express';
import { now } from '@allrounder/shared';
import { getAllChannels, sendMessage, DiscordError } from '../discord.js';
import { planPermissions, applyPermissions, PRESETS } from '../permissions.js';

/**
 * Setup-Wizard und zentrale Rechteverwaltung.
 *
 * Der Bot greift hier tief in den Server ein, deshalb zwei Grundsätze:
 * 1. Es gibt immer eine Vorschau, bevor etwas passiert.
 * 2. Jede Änderung wird mit dem Vorher-Zustand mitgeschrieben, damit sie sich
 *    zurücknehmen lässt.
 */
export function wizardRoutes(db, botToken) {
  const router = Router();

  const needToken = (res) => {
    if (botToken) return false;
    res.status(503).json({ error: 'DISCORD_TOKEN ist der API nicht bekannt.' });
    return true;
  };
  const handle = (res, err, next) => {
    if (err instanceof DiscordError) return res.status(err.status).json({ error: err.message });
    if (err?.status) return res.status(err.status >= 400 && err.status < 600 ? err.status : 502).json({ error: err.message });
    next(err);
  };

  const recordAudit = db.prepare(
    `INSERT INTO audit_log (guild_id, actor_id, action, target, detail, created_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
  );

  // --- Rechtepakete und Kanäle ---------------------------------------------

  router.get('/presets', (_req, res) => {
    res.json(
      Object.entries(PRESETS).map(([key, p]) => ({
        key,
        label: p.label,
        description: p.description,
      })),
    );
  });

  router.get('/:guildId/allchannels', async (req, res, next) => {
    if (needToken(res)) return;
    try {
      res.json(await getAllChannels(req.params.guildId, botToken));
    } catch (err) {
      handle(res, err, next);
    }
  });

  // --- Rechte: Vorschau und Anwenden ---------------------------------------

  router.post('/:guildId/permissions/plan', async (req, res, next) => {
    const { channelIds, roleId, preset } = req.body ?? {};
    if (!Array.isArray(channelIds) || !channelIds.length || !roleId || !preset) {
      return res.status(400).json({ error: 'channelIds, roleId und preset sind Pflicht' });
    }
    if (!PRESETS[preset]) {
      return res.status(400).json({ error: `Unbekanntes Rechtepaket "${preset}"` });
    }
    if (channelIds.length > 200) {
      return res.status(400).json({ error: 'Höchstens 200 Kanäle auf einmal.' });
    }
    if (needToken(res)) return;

    try {
      res.json(await planPermissions({ guildId: req.params.guildId, channelIds, roleId, preset, botToken }));
    } catch (err) {
      handle(res, err, next);
    }
  });

  router.post('/:guildId/permissions/apply', async (req, res, next) => {
    const { channelIds, roleId, preset, actorId = 'dashboard' } = req.body ?? {};
    if (!Array.isArray(channelIds) || !channelIds.length || !roleId || !preset) {
      return res.status(400).json({ error: 'channelIds, roleId und preset sind Pflicht' });
    }
    if (!PRESETS[preset]) {
      return res.status(400).json({ error: `Unbekanntes Rechtepaket "${preset}"` });
    }
    if (needToken(res)) return;

    try {
      const result = await applyPermissions({
        guildId: req.params.guildId,
        channelIds,
        roleId,
        preset,
        botToken,
        reason: `Dashboard: Rechte "${PRESETS[preset].label}"`,
      });

      // Vorher-Zustand sichern, damit sich das zurücknehmen lässt.
      if (result.applied.length) {
        const info = db
          .prepare(
            `INSERT INTO permission_changes (guild_id, role_id, preset, snapshot, actor_id, created_at)
             VALUES (?, ?, ?, ?, ?, ?)`,
          )
          .run(
            req.params.guildId,
            roleId,
            preset,
            JSON.stringify(result.applied),
            actorId,
            now(),
          );
        result.changeId = info.lastInsertRowid;
      }

      recordAudit.run(
        req.params.guildId,
        actorId,
        'permissions.apply',
        roleId,
        `${PRESETS[preset].label} auf ${result.applied.length} Kanal/Kanäle`,
        now(),
      );
      res.json(result);
    } catch (err) {
      handle(res, err, next);
    }
  });

  router.get('/:guildId/permissions/history', (req, res) => {
    const rows = db
      .prepare(
        'SELECT id, role_id, preset, actor_id, created_at, snapshot FROM permission_changes WHERE guild_id = ? ORDER BY created_at DESC LIMIT 25',
      )
      .all(req.params.guildId);
    res.json(
      rows.map((r) => {
        const snap = JSON.parse(r.snapshot);
        return { ...r, channelCount: snap.length, snapshot: undefined, channels: snap.map((s) => s.name) };
      }),
    );
  });

  /** Nimmt eine Rechteänderung zurück, indem der Vorher-Zustand wiederhergestellt wird. */
  router.post('/:guildId/permissions/undo/:changeId', async (req, res, next) => {
    // Erst nachschlagen: Eine unbekannte Änderung bleibt unbekannt, egal ob
    // der Bot-Token gesetzt ist.
    const row = db
      .prepare('SELECT * FROM permission_changes WHERE id = ? AND guild_id = ?')
      .get(req.params.changeId, req.params.guildId);
    if (!row) return res.status(404).json({ error: 'Änderung nicht gefunden' });
    if (needToken(res)) return;

    const snapshot = JSON.parse(row.snapshot);
    const restored = [];
    const failed = [];

    for (const entry of snapshot) {
      try {
        const url = `https://discord.com/api/v10/channels/${entry.channelId}/permissions/${row.role_id}`;
        const headers = {
          Authorization: `Bot ${botToken}`,
          'X-Audit-Log-Reason': encodeURIComponent('Dashboard: Rechteänderung zurückgenommen'),
        };
        const r = entry.before
          ? await fetch(url, {
              method: 'PUT',
              headers: { ...headers, 'Content-Type': 'application/json' },
              body: JSON.stringify({ type: 0, allow: entry.before.allow, deny: entry.before.deny }),
              signal: AbortSignal.timeout(10_000),
            })
          : // Vorher gab es keinen Eintrag - also wieder entfernen.
            await fetch(url, { method: 'DELETE', headers, signal: AbortSignal.timeout(10_000) });
        if (!r.ok && r.status !== 204) throw new Error(`HTTP ${r.status}`);
        restored.push(entry.name);
      } catch (err) {
        failed.push({ name: entry.name, error: err.message });
      }
    }

    db.prepare('DELETE FROM permission_changes WHERE id = ?').run(row.id);
    recordAudit.run(
      req.params.guildId,
      req.body?.actorId ?? 'dashboard',
      'permissions.undo',
      row.role_id,
      `${restored.length} Kanal/Kanäle zurückgesetzt`,
      now(),
    );
    res.json({ restored, failed });
  });

  // --- Interessens-Gruppen --------------------------------------------------

  router.get('/:guildId/interests', (req, res) => {
    const rows = db
      .prepare('SELECT * FROM interest_groups WHERE guild_id = ? ORDER BY position, id')
      .all(req.params.guildId);
    res.json(rows.map((r) => ({ ...r, channelIds: JSON.parse(r.channel_ids) })));
  });

  router.post('/:guildId/interests', (req, res) => {
    const { emoji, label, roleId, channelIds = [], preset = 'write' } = req.body ?? {};
    if (!emoji || !label || !roleId) {
      return res.status(400).json({ error: 'emoji, label und roleId sind Pflicht' });
    }
    if (!PRESETS[preset]) {
      return res.status(400).json({ error: `Unbekanntes Rechtepaket "${preset}"` });
    }
    // Dasselbe Emoji zweimal wäre im Panel nicht zuordenbar.
    const taken = db
      .prepare('SELECT 1 FROM interest_groups WHERE guild_id = ? AND emoji = ?')
      .get(req.params.guildId, emoji);
    if (taken) return res.status(409).json({ error: 'Dieses Emoji wird bereits verwendet.' });

    const maxPos = db
      .prepare('SELECT COALESCE(MAX(position), -1) AS p FROM interest_groups WHERE guild_id = ?')
      .get(req.params.guildId).p;

    const info = db
      .prepare(
        `INSERT INTO interest_groups (guild_id, emoji, label, role_id, channel_ids, preset, position, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        req.params.guildId,
        emoji,
        label,
        roleId,
        JSON.stringify(channelIds),
        preset,
        maxPos + 1,
        now(),
      );
    res.status(201).json({ id: info.lastInsertRowid });
  });

  router.put('/:guildId/interests/:id', (req, res) => {
    const { emoji, label, roleId, channelIds, preset } = req.body ?? {};
    const existing = db
      .prepare('SELECT * FROM interest_groups WHERE id = ? AND guild_id = ?')
      .get(req.params.id, req.params.guildId);
    if (!existing) return res.status(404).json({ error: 'Nicht gefunden' });

    db.prepare(
      `UPDATE interest_groups SET emoji = ?, label = ?, role_id = ?, channel_ids = ?, preset = ?
        WHERE id = ?`,
    ).run(
      emoji ?? existing.emoji,
      label ?? existing.label,
      roleId ?? existing.role_id,
      JSON.stringify(channelIds ?? JSON.parse(existing.channel_ids)),
      preset ?? existing.preset,
      existing.id,
    );
    res.json({ ok: true });
  });

  router.delete('/:guildId/interests/:id', (req, res) => {
    const info = db
      .prepare('DELETE FROM interest_groups WHERE id = ? AND guild_id = ?')
      .run(req.params.id, req.params.guildId);
    if (!info.changes) return res.status(404).json({ error: 'Nicht gefunden' });
    res.status(204).end();
  });

  /**
   * Setzt die Kanalrechte aller Gruppen und postet danach das Auswahl-Panel.
   * Beides in einem Schritt, weil das eine ohne das andere nichts nützt.
   */
  router.post('/:guildId/interests/publish', async (req, res, next) => {
    const { channelId, title, description } = req.body ?? {};
    if (!channelId) return res.status(400).json({ error: 'channelId ist Pflicht' });

    const groups = db
      .prepare('SELECT * FROM interest_groups WHERE guild_id = ? ORDER BY position, id')
      .all(req.params.guildId);
    if (!groups.length) {
      return res.status(400).json({ error: 'Es ist noch keine Interessens-Gruppe angelegt.' });
    }
    if (needToken(res)) return;

    try {
      // Erst die Rechte setzen, damit die Kanäle beim ersten Klick auch da sind.
      const permResults = [];
      for (const g of groups) {
        const ids = JSON.parse(g.channel_ids);
        if (!ids.length) continue;
        const r = await applyPermissions({
          guildId: req.params.guildId,
          channelIds: ids,
          roleId: g.role_id,
          preset: g.preset,
          botToken,
          reason: `Setup-Wizard: ${g.label}`,
        });
        permResults.push({ label: g.label, applied: r.applied.length, failed: r.failed });
      }

      const heading = title?.trim() || 'Wähle deine Interessen';
      const lines = groups.map((g) => `${g.emoji}  **${g.label}**`);
      const text = [
        `**${heading}**`,
        description?.trim() || 'Klick auf ein Symbol, um die passenden Kanäle freizuschalten.',
        '',
        ...lines,
      ].join('\n');

      const msg = await sendMessage(channelId, text, botToken);

      // Als Reaction-Role-Panel eintragen, damit das bestehende Plugin die
      // Klicks verarbeitet - kein zweiter Mechanismus nötig.
      const panel = db
        .prepare(
          `INSERT INTO reaction_role_panels (guild_id, channel_id, message_id, title, description, mode, created_at)
           VALUES (?, ?, ?, ?, ?, 'multi', ?)`,
        )
        .run(req.params.guildId, channelId, msg.id, heading, description ?? null, now());

      const insOpt = db.prepare(
        'INSERT INTO reaction_role_options (panel_id, emoji, role_id, label, position) VALUES (?, ?, ?, ?, ?)',
      );
      for (const [i, g] of groups.entries()) {
        insOpt.run(panel.lastInsertRowid, g.emoji, g.role_id, g.label, i);
        const r = await fetch(
          `https://discord.com/api/v10/channels/${channelId}/messages/${msg.id}/reactions/${encodeURIComponent(g.emoji)}/@me`,
          { method: 'PUT', headers: { Authorization: `Bot ${botToken}` }, signal: AbortSignal.timeout(10_000) },
        );
        if (!r.ok && r.status !== 204) {
          permResults.push({ label: g.label, emojiFailed: true });
        }
      }

      recordAudit.run(
        req.params.guildId,
        req.body?.actorId ?? 'dashboard',
        'wizard.publish',
        channelId,
        `${groups.length} Gruppen`,
        now(),
      );

      res.status(201).json({ messageId: msg.id, panelId: panel.lastInsertRowid, permissions: permResults });
    } catch (err) {
      handle(res, err, next);
    }
  });

  return router;
}
