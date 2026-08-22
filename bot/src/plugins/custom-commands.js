import { createLogger } from '../core/logger.js';

const log = createLogger('custom-commands');

/**
 * Eigene Textbefehle: `!regeln`, `!discord` und dergleichen.
 *
 * Bewusst mit Praefix statt als Slash-Command - so lassen sie sich im Dashboard
 * anlegen, ohne sie jedes Mal bei Discord neu anmelden zu muessen.
 */

/** Ersetzt die Platzhalter im Antworttext. */
export function renderResponse(text, { member, guild, channel }) {
  return String(text ?? '')
    .replaceAll('{user}', `<@${member.id}>`)
    .replaceAll('{username}', member.user.username)
    .replaceAll('{server}', guild.name)
    .replaceAll('{count}', String(guild.memberCount))
    .replaceAll('{channel}', `<#${channel.id}>`);
}

/**
 * Zieht den Befehlsnamen aus einer Nachricht.
 * Gibt null zurueck, wenn die Nachricht nicht mit dem Praefix beginnt.
 */
export function parseCommand(content, prefix) {
  if (!prefix || !content.startsWith(prefix)) return null;
  const rest = content.slice(prefix.length).trim();
  if (!rest) return null;
  const name = rest.split(/\s+/)[0].toLowerCase();
  // Nur einfache Namen - alles andere waere kein Befehl.
  return /^[\w-]{1,32}$/.test(name) ? name : null;
}

/**
 * Baut die Uebersicht der verfuegbaren Befehle.
 *
 * Eigene Textbefehle tauchen anders als Slash-Commands nicht in Discords
 * Vorschlagsliste auf - ohne so eine Uebersicht muesste man raten, was es gibt.
 * Gezeigt wird nur, was der Aufrufer auch nutzen darf.
 */
export function buildOverview(rows, hasRole, prefix) {
  const usable = rows.filter((r) => !r.role_id || hasRole(r.role_id));

  if (!usable.length) {
    return rows.length
      ? 'Für dich ist gerade kein Befehl freigeschaltet.'
      : 'Es ist noch kein eigener Befehl angelegt.';
  }

  const list = usable.map((r) => `\`${prefix}${r.name}\``).join(' · ');
  const hidden = rows.length - usable.length;
  const note = hidden > 0 ? `

_${hidden} weitere sind an eine Rolle gebunden._` : '';
  return `**Verfügbare Befehle**
${list}${note}`;
}

/** Namen, unter denen die Uebersicht erreichbar ist. */
export const OVERVIEW_NAMES = ['befehle', 'commands', 'hilfe', 'help'];

export default {
  name: 'custom-commands',

  setup({ settings, db }) {
    // Kleiner Schutz gegen Missbrauch: je Kanal höchstens alle paar Sekunden.
    const lastUse = new Map();

    const findCommand = db.prepare(
      'SELECT * FROM custom_commands WHERE guild_id = ? AND name = ? AND enabled = 1',
    );
    const countUse = db.prepare(
      'UPDATE custom_commands SET uses = uses + 1, last_used_at = ? WHERE id = ?',
    );
    const allCommands = db.prepare(
      'SELECT name, role_id FROM custom_commands WHERE guild_id = ? AND enabled = 1 ORDER BY name',
    );

    return {
      async messageCreate(message) {
        if (!message.guild || message.author.bot) return;
        const cfg = settings.get(message.guild.id).customCommands;
        if (!cfg?.enabled) return;

        const name = parseCommand(message.content, cfg.prefix);
        if (!name) return;

        // Eingebaute Übersicht - greift nur, wenn kein eigener Befehl so heißt.
        if (OVERVIEW_NAMES.includes(name) && !findCommand.get(message.guild.id, name)) {
          const key = `${message.channelId}:__overview`;
          const cd = (cfg.cooldownSeconds ?? 3) * 1000;
          if (Date.now() - (lastUse.get(key) ?? 0) < cd) return;
          lastUse.set(key, Date.now());

          await message
            .reply({
              content: buildOverview(
                allCommands.all(message.guild.id),
                (roleId) => Boolean(message.member?.roles.cache.has(roleId)),
                cfg.prefix,
              ),
              allowedMentions: { parse: [] },
            })
            .catch((err) => log.warn('Befehlsübersicht fehlgeschlagen', err));
          return;
        }

        const cmd = findCommand.get(message.guild.id, name);
        if (!cmd) return;

        // Nur eingeschränkt nutzbar?
        if (cmd.role_id && !message.member?.roles.cache.has(cmd.role_id)) return;

        const key = `${message.channelId}:${name}`;
        const cooldown = (cfg.cooldownSeconds ?? 3) * 1000;
        const prev = lastUse.get(key) ?? 0;
        if (Date.now() - prev < cooldown) return;
        lastUse.set(key, Date.now());

        try {
          await message.reply({
            content: renderResponse(cmd.response, {
              member: message.member,
              guild: message.guild,
              channel: message.channel,
            }),
            allowedMentions: { parse: [] }, // keine Massen-Erwähnungen aus Vorlagen
          });
          countUse.run(Math.floor(Date.now() / 1000), cmd.id);
        } catch (err) {
          log.warn(`Antwort auf !${name} fehlgeschlagen`, err);
        }
      },
    };
  },
};
