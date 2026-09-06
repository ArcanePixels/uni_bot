import { Router } from 'express';
import { now } from '@allrounder/shared';
import { reichereMitgliederAn, darfAktion } from '../member-guard.js';
import {
  getGuild,
  getGuildRoles,
  getBotMember,
  getGuildMembers,
  resolveMembers,
  timeoutMember,
  kickMember,
  banMember,
  unbanMember,
  getBans,
  sendMessage,
  DiscordError,
} from '../discord.js';

/**
 * Moderation von Hand aus dem Dashboard heraus.
 *
 * Jede Aktion wird zusaetzlich als Verstoss und im Audit-Log festgehalten -
 * sonst zaehlt eine manuelle Massnahme nicht in die Eskalation mit und die
 * Historie waere lueckenhaft.
 */
export function moderationRoutes(db, botToken) {
  const router = Router();

  const requireToken = (res) => {
    if (botToken) return false;
    res.status(503).json({ error: 'DISCORD_TOKEN ist der API nicht bekannt.' });
    return true;
  };

  const handle = (res, err, next) => {
    if (err instanceof DiscordError) return res.status(err.status).json({ error: err.message });
    next(err);
  };

  const recordInfraction = db.prepare(
    `INSERT INTO infractions (guild_id, user_id, moderator, rule, action, reason, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  );
  const recordAudit = db.prepare(
    `INSERT INTO audit_log (guild_id, actor_id, action, target, detail, created_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
  );

  // --- Mitglieder -----------------------------------------------------------

  router.get('/:guildId/members', async (req, res, next) => {
    if (requireToken(res)) return;
    try {
      const { guildId } = req.params;
      // Rollen und Gruender mitholen: Ohne sie wuerde die Oberflaeche
      // Massnahmen anbieten, die Discord ohnehin ablehnt - oder schlimmer,
      // gegen einen selbst.
      const [members, roles, guild, botMember] = await Promise.all([
        getGuildMembers(guildId, botToken),
        getGuildRoles(guildId, botToken),
        getGuild(guildId, botToken),
        getBotMember(guildId, botToken).catch(() => ({ id: null, roleIds: [] })),
      ]);

      const angereichert = reichereMitgliederAn({
        members,
        roles,
        ownerId: guild.ownerId,
        botRoleIds: botMember.roleIds,
        actorId: req.query.actorId ? String(req.query.actorId) : null,
      });

      const q = String(req.query.q ?? '').toLowerCase().trim();
      const rolleFilter = req.query.role ? String(req.query.role) : null;

      let gefiltert = angereichert;
      if (q) {
        gefiltert = gefiltert.filter(
          (m) =>
            m.name.toLowerCase().includes(q) ||
            (m.username ?? '').toLowerCase().includes(q) ||
            m.id.includes(q) ||
            m.roleNames.some((r) => r.name.toLowerCase().includes(q)),
        );
      }
      if (rolleFilter) {
        gefiltert = gefiltert.filter((m) => (m.roles ?? []).includes(rolleFilter));
      }

      res.json({
        members: gefiltert.slice(0, Number(req.query.limit ?? 200)),
        gesamt: gefiltert.length,
        // Fuer den Filter im Dashboard.
        roles: roles.map((r) => ({ id: r.id, name: r.name, color: r.color })),
      });
    } catch (err) {
      handle(res, err, next);
    }
  });

  /** Namen zu einer Liste von IDs - damit das Dashboard keine rohen IDs zeigt. */
  router.post('/:guildId/resolve', async (req, res, next) => {
    if (requireToken(res)) return;
    const ids = Array.isArray(req.body?.ids) ? req.body.ids.slice(0, 500) : [];
    try {
      res.json(await resolveMembers(req.params.guildId, botToken, ids));
    } catch (err) {
      handle(res, err, next);
    }
  });

  // --- Massnahmen -----------------------------------------------------------

  router.post('/:guildId/moderate', async (req, res, next) => {
    const { guildId } = req.params;
    const { userId, action, reason, minutes = 10, actorId = 'dashboard', notifyChannelId } =
      req.body ?? {};

    // Eingaben zuerst pruefen - eine ungueltige Anfrage bleibt ungueltig,
    // ganz gleich ob der Bot-Token gesetzt ist.
    if (!userId || !action) {
      return res.status(400).json({ error: 'userId und action sind Pflicht' });
    }
    if (!['warn', 'timeout', 'untimeout', 'kick', 'ban', 'unban'].includes(action)) {
      return res.status(400).json({ error: `Unbekannte Aktion "${action}"` });
    }
    const m = Number(minutes);
    if (action === 'timeout' && (!Number.isFinite(m) || m < 1 || m > 40320)) {
      // Discord erlaubt hoechstens 28 Tage.
      return res.status(400).json({ error: 'Timeout muss zwischen 1 und 40320 Minuten liegen.' });
    }

    if (requireToken(res)) return;

    const text = reason?.trim() || 'Ohne Angabe';
    const auditReason = `Dashboard: ${text}`;

    try {
      // Letzte Instanz. Die Oberflaeche graut Knoepfe aus, aber dieser
      // Endpunkt ist auch direkt aufrufbar - ohne Pruefung liesse sich das
      // Ausgrauen umgehen. Aufhebungen brauchen keine Rangfolge.
      if (!['unban', 'untimeout'].includes(action)) {
        const [alle, rollen, guild, botMember] = await Promise.all([
          getGuildMembers(guildId, botToken),
          getGuildRoles(guildId, botToken),
          getGuild(guildId, botToken),
          getBotMember(guildId, botToken).catch(() => ({ id: null, roleIds: [] })),
        ]);
        const ziel = alle.find((x) => String(x.id) === String(userId));
        // Wer nicht (mehr) auf dem Server ist, laesst sich nur bannen.
        if (ziel) {
          const problem = darfAktion({
            action,
            member: ziel,
            rollen: new Map(rollen.map((r) => [String(r.id), r])),
            ownerId: guild.ownerId,
            botRoleIds: botMember.roleIds,
            actorId: actorId === 'dashboard' ? null : actorId,
          });
          if (problem) return res.status(403).json({ error: problem });
        }
      }

      if (action === 'timeout') {
        await timeoutMember(guildId, userId, m, botToken, auditReason);
      } else if (action === 'untimeout') {
        await timeoutMember(guildId, userId, 0, botToken, auditReason);
      } else if (action === 'kick') {
        await kickMember(guildId, userId, botToken, auditReason);
      } else if (action === 'ban') {
        await banMember(guildId, userId, botToken, auditReason, Number(req.body.deleteDays ?? 0));
      } else if (action === 'unban') {
        await unbanMember(guildId, userId, botToken, auditReason);
      }
      // "warn" wirkt nur ueber den Log-Eintrag und die optionale Nachricht.

      const ts = now();
      // Aufhebungen zaehlen nicht als Verstoss.
      if (!['untimeout', 'unban'].includes(action)) {
        recordInfraction.run(guildId, userId, actorId, 'manuell', action, text, ts);
      }
      recordAudit.run(guildId, actorId, `mod.${action}`, userId, text, ts);

      if (notifyChannelId) {
        const label = { warn: 'verwarnt', timeout: 'stummgeschaltet', kick: 'gekickt', ban: 'gebannt' }[action];
        if (label) {
          await sendMessage(
            notifyChannelId,
            `**Moderation** – <@${userId}> wurde ${label}. Grund: ${text}`,
            botToken,
          ).catch(() => {});
        }
      }

      res.json({ ok: true });
    } catch (err) {
      handle(res, err, next);
    }
  });

  router.get('/:guildId/bans', async (req, res, next) => {
    if (requireToken(res)) return;
    try {
      res.json(await getBans(req.params.guildId, botToken));
    } catch (err) {
      handle(res, err, next);
    }
  });

  return router;
}
