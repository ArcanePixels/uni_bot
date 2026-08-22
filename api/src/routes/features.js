import { Router } from 'express';
import { now } from '@allrounder/shared';
import { sendMessage, DiscordError } from '../discord.js';

const NUMBER_EMOJI = ['1️⃣', '2️⃣', '3️⃣', '4️⃣', '5️⃣', '6️⃣', '7️⃣', '8️⃣', '9️⃣', '🔟'];
const TICKET_EMOJI = '🎫';

/** Reaktion an eine Nachricht haengen. */
async function react(channelId, messageId, emoji, botToken) {
  const res = await fetch(
    `https://discord.com/api/v10/channels/${channelId}/messages/${messageId}/reactions/${encodeURIComponent(emoji)}/@me`,
    {
      method: 'PUT',
      headers: { Authorization: `Bot ${botToken}` },
      signal: AbortSignal.timeout(10_000),
    },
  );
  if (!res.ok && res.status !== 204) {
    throw new DiscordError(
      `Emoji ${emoji} konnte nicht gesetzt werden (HTTP ${res.status}). ` +
        'Bei eigenen Server-Emojis muss der Bot Zugriff darauf haben.',
      502,
    );
  }
}

export function featureRoutes(db, botToken) {
  const router = Router();

  const needToken = (res) => {
    if (botToken) return false;
    res.status(503).json({ error: 'DISCORD_TOKEN ist der API nicht bekannt.' });
    return true;
  };
  const handle = (res, err, next) => {
    if (err instanceof DiscordError) return res.status(err.status).json({ error: err.message });
    next(err);
  };

  // --- Reaction Roles -------------------------------------------------------

  router.get('/:guildId/reactionroles', (req, res) => {
    const panels = db
      .prepare('SELECT * FROM reaction_role_panels WHERE guild_id = ? ORDER BY id DESC')
      .all(req.params.guildId);
    const opts = db.prepare('SELECT * FROM reaction_role_options WHERE panel_id = ? ORDER BY position');
    res.json(panels.map((p) => ({ ...p, options: opts.all(p.id) })));
  });

  router.post('/:guildId/reactionroles', async (req, res, next) => {
    const { channelId, title, description = null, mode = 'multi', options } = req.body ?? {};
    if (!channelId || !title || !Array.isArray(options) || options.length === 0) {
      return res.status(400).json({ error: 'channelId, title und mindestens eine Option sind Pflicht' });
    }
    if (options.length > 20) {
      return res.status(400).json({ error: 'Höchstens 20 Optionen je Panel.' });
    }
    for (const o of options) {
      if (!o?.emoji || !o?.roleId) {
        return res.status(400).json({ error: 'Jede Option braucht emoji und roleId.' });
      }
    }
    // Dasselbe Emoji zweimal wäre nicht zuordenbar.
    const emojis = options.map((o) => o.emoji);
    if (new Set(emojis).size !== emojis.length) {
      return res.status(400).json({ error: 'Jedes Emoji darf nur einmal vorkommen.' });
    }
    if (needToken(res)) return;

    try {
      const lines = options.map((o) => `${o.emoji}  ${o.label || `<@&${o.roleId}>`}`);
      const text = [`**${title}**`, description, '', ...lines]
        .filter((x) => x !== null)
        .join('\n');

      const msg = await sendMessage(channelId, text, botToken);

      const info = db
        .prepare(
          `INSERT INTO reaction_role_panels (guild_id, channel_id, message_id, title, description, mode, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(req.params.guildId, channelId, msg.id, title, description, mode, now());

      const insOpt = db.prepare(
        'INSERT INTO reaction_role_options (panel_id, emoji, role_id, label, position) VALUES (?, ?, ?, ?, ?)',
      );
      options.forEach((o, i) => insOpt.run(info.lastInsertRowid, o.emoji, o.roleId, o.label ?? null, i));

      // Reaktionen nacheinander - Discord drosselt sonst.
      for (const o of options) await react(channelId, msg.id, o.emoji, botToken);

      res.status(201).json({ id: info.lastInsertRowid, messageId: msg.id });
    } catch (err) {
      handle(res, err, next);
    }
  });

  router.delete('/:guildId/reactionroles/:id', (req, res) => {
    const info = db
      .prepare('DELETE FROM reaction_role_panels WHERE id = ? AND guild_id = ?')
      .run(req.params.id, req.params.guildId);
    if (!info.changes) return res.status(404).json({ error: 'Nicht gefunden' });
    // Die Optionen haengen per FOREIGN KEY dran und gehen mit.
    res.status(204).end();
  });

  // --- Umfragen -------------------------------------------------------------

  router.get('/:guildId/polls', (req, res) => {
    const polls = db
      .prepare('SELECT * FROM polls WHERE guild_id = ? ORDER BY id DESC LIMIT 50')
      .all(req.params.guildId);
    const counts = db.prepare(
      'SELECT option_ix, COUNT(*) AS n FROM poll_votes WHERE poll_id = ? GROUP BY option_ix',
    );
    res.json(
      polls.map((p) => {
        const options = JSON.parse(p.options);
        const tally = new Array(options.length).fill(0);
        for (const { option_ix, n } of counts.all(p.id)) tally[option_ix] = n;
        return { ...p, options, counts: tally };
      }),
    );
  });

  router.post('/:guildId/polls', async (req, res, next) => {
    const { channelId, question, options, multi = false, closesAt = null } = req.body ?? {};
    if (!channelId || !question || !Array.isArray(options)) {
      return res.status(400).json({ error: 'channelId, question und options sind Pflicht' });
    }
    const clean = options.map((o) => String(o).trim()).filter(Boolean);
    if (clean.length < 2) return res.status(400).json({ error: 'Mindestens zwei Antworten.' });
    if (clean.length > 10) return res.status(400).json({ error: 'Höchstens zehn Antworten.' });
    if (closesAt && closesAt <= now()) {
      return res.status(400).json({ error: 'Das Ende muss in der Zukunft liegen.' });
    }
    if (needToken(res)) return;

    try {
      const lines = clean.map((o, i) => `${NUMBER_EMOJI[i]} **${o}**\n\`░░░░░░░░░░\` 0% (0)`);
      const foot = [
        '0 Stimmen',
        multi ? 'Mehrfachauswahl erlaubt' : 'eine Stimme pro Person',
        closesAt ? `endet <t:${closesAt}:R>` : null,
      ]
        .filter(Boolean)
        .join(' · ');
      const msg = await sendMessage(
        channelId,
        `📊 **${question}**\n\n${lines.join('\n\n')}\n\n_${foot}_`,
        botToken,
      );

      const info = db
        .prepare(
          `INSERT INTO polls (guild_id, channel_id, message_id, question, options, multi, closes_at, created_by, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
          req.params.guildId,
          channelId,
          msg.id,
          question,
          JSON.stringify(clean),
          multi ? 1 : 0,
          closesAt,
          req.body.createdBy ?? null,
          now(),
        );

      for (let i = 0; i < clean.length; i++) {
        await react(channelId, msg.id, NUMBER_EMOJI[i], botToken);
      }
      res.status(201).json({ id: info.lastInsertRowid, messageId: msg.id });
    } catch (err) {
      handle(res, err, next);
    }
  });

  router.post('/:guildId/polls/:id/close', (req, res) => {
    const info = db
      .prepare('UPDATE polls SET closed = 1 WHERE id = ? AND guild_id = ?')
      .run(req.params.id, req.params.guildId);
    if (!info.changes) return res.status(404).json({ error: 'Nicht gefunden' });
    res.json({ ok: true });
  });

  // --- Tickets --------------------------------------------------------------

  router.get('/:guildId/tickets', (req, res) => {
    res.json(
      db
        .prepare('SELECT * FROM tickets WHERE guild_id = ? ORDER BY created_at DESC LIMIT 100')
        .all(req.params.guildId),
    );
  });

  /** Legt die Nachricht an, unter der Mitglieder ein Ticket öffnen. */
  router.post('/:guildId/tickets/panel', async (req, res, next) => {
    const { channelId, text } = req.body ?? {};
    if (!channelId) return res.status(400).json({ error: 'channelId ist Pflicht' });
    if (needToken(res)) return;

    try {
      const body =
        text?.trim() ||
        '**Support**\n\nKlick auf 🎫, um ein Ticket zu öffnen. Es entsteht ein privater Kanal, den nur du und das Team sehen.';
      const msg = await sendMessage(channelId, body, botToken);
      await react(channelId, msg.id, TICKET_EMOJI, botToken);
      res.status(201).json({ messageId: msg.id });
    } catch (err) {
      handle(res, err, next);
    }
  });

  return router;
}
