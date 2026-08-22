import { PermissionFlagsBits } from 'discord.js';
import { createLogger } from '../core/logger.js';
import { resolveEscalation } from '../core/infractions.js';

const log = createLogger('automod');

// Erkennt URLs grosszuegig - lieber einmal zu viel pruefen als eine Umgehung durchlassen.
const LINK_RE = /\b(?:https?:\/\/|www\.)\S+/gi;

/** Hostname aus einem Treffer ziehen; unparsebare Treffer gelten als nicht-whitelisted. */
function hostOf(raw) {
  try {
    return new URL(raw.startsWith('http') ? raw : `https://${raw}`).hostname.toLowerCase();
  } catch {
    return null;
  }
}

function hasBadWord(content, badWords) {
  if (!badWords.length) return null;
  const haystack = content.toLowerCase();
  return badWords.find((w) => haystack.includes(w.toLowerCase())) ?? null;
}

function offendingLink(content, whitelist) {
  const matches = content.match(LINK_RE);
  if (!matches) return null;
  const allow = whitelist.map((h) => h.toLowerCase());
  for (const m of matches) {
    const host = hostOf(m);
    if (host === null) return m;
    // Subdomains einer erlaubten Domain gelten ebenfalls als erlaubt.
    const ok = allow.some((a) => host === a || host.endsWith(`.${a}`));
    if (!ok) return m;
  }
  return null;
}

/** Gleitendes Zeitfenster pro Guild+User fuer die Flood-Erkennung. */
class SpamTracker {
  #hits = new Map();

  push(key, windowSeconds, ts = Date.now()) {
    const cutoff = ts - windowSeconds * 1000;
    const kept = (this.#hits.get(key) ?? []).filter((t) => t > cutoff);
    kept.push(ts);
    this.#hits.set(key, kept);
    return kept.length;
  }

  clear(key) {
    this.#hits.delete(key);
  }

  /** Verhindert, dass die Map auf einem grossen Server unbegrenzt waechst. */
  prune(windowSeconds, ts = Date.now()) {
    const cutoff = ts - windowSeconds * 1000;
    for (const [key, times] of this.#hits) {
      if (!times.some((t) => t > cutoff)) this.#hits.delete(key);
    }
  }
}

export default {
  name: 'automod',

  setup({ settings, infractions, audit }) {
    const tracker = new SpamTracker();
    const pruner = setInterval(() => tracker.prune(60), 60_000);
    pruner.unref?.();

    async function punish(message, cfg, rule, detail) {
      const { guild, author } = message;
      const count = infractions.countActive(guild.id, author.id, cfg.decayDays) + 1;
      const step = resolveEscalation(cfg.escalation, count);
      const action = step?.action ?? 'warn';

      infractions.record({
        guildId: guild.id,
        userId: author.id,
        rule,
        action,
        reason: detail,
      });
      audit.record({
        guildId: guild.id,
        actorId: 'automod',
        action: `automod.${action}`,
        target: author.id,
        detail: `${rule}: ${detail}`,
      });

      // Die ausloesende Nachricht raeumen wir in jedem Fall weg.
      await message.delete().catch(() => {});

      const member = await guild.members.fetch(author.id).catch(() => null);
      const reason = `Automod: ${rule} (Verstoss ${count})`;

      try {
        if (action === 'timeout' && member?.moderatable) {
          await member.timeout((step.durationMinutes ?? 10) * 60_000, reason);
        } else if (action === 'kick' && member?.kickable) {
          await member.kick(reason);
        } else if (action === 'ban' && member?.bannable) {
          await guild.members.ban(author.id, { reason });
        }
      } catch (err) {
        // Fehlende Rechte oder Rollenhierarchie - der Verstoss bleibt trotzdem geloggt.
        log.warn(`Massnahme "${action}" gegen ${author.id} fehlgeschlagen`, err);
      }

      const target = cfg.logChannelId
        ? await message.client.channels.fetch(cfg.logChannelId).catch(() => null)
        : message.channel;
      await target
        ?.send(`**Automod** – <@${author.id}>: ${rule}. Massnahme: \`${action}\` (Verstoss ${count}).`)
        .catch(() => {});

      if (rule === 'spam') tracker.clear(`${guild.id}:${author.id}`);
    }

    return {
      async messageCreate(message) {
        if (!message.guild || message.author.bot) return;
        const cfg = settings.get(message.guild.id).automod;
        if (!cfg.enabled) return;

        const member = message.member;
        // Mods und ausgenommene Rollen laufen nicht in den Automod.
        if (member?.permissions.has(PermissionFlagsBits.ManageMessages)) return;
        if (cfg.exemptRoles.some((r) => member?.roles.cache.has(r))) return;

        const bad = hasBadWord(message.content, cfg.badWords);
        if (bad) return punish(message, cfg, 'wortfilter', `verbotenes Wort "${bad}"`);

        if (cfg.links.enabled) {
          const link = offendingLink(message.content, cfg.links.whitelist);
          if (link) return punish(message, cfg, 'link', `nicht erlaubter Link ${link}`);
        }

        if (cfg.spam.enabled) {
          const key = `${message.guild.id}:${message.author.id}`;
          const n = tracker.push(key, cfg.spam.windowSeconds);
          if (n > cfg.spam.maxMessages) {
            return punish(message, cfg, 'spam', `${n} Nachrichten in ${cfg.spam.windowSeconds}s`);
          }
        }
      },
    };
  },
};

export const __test__ = { hasBadWord, offendingLink, SpamTracker, hostOf };
