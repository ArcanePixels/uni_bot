import { now } from '@allrounder/shared';
import { createLogger } from '../core/logger.js';

const log = createLogger('polls');

// Ziffern-Emojis für bis zu zehn Antwortmöglichkeiten.
export const NUMBER_EMOJI = ['1️⃣', '2️⃣', '3️⃣', '4️⃣', '5️⃣', '6️⃣', '7️⃣', '8️⃣', '9️⃣', '🔟'];

const TICK_MS = 30_000;

/** Baut den Nachrichtentext einer Umfrage samt Balken. */
export function renderPoll({ question, options, counts, closed, multi, closesAt }) {
  const total = counts.reduce((a, b) => a + b, 0);
  const lines = options.map((opt, i) => {
    const n = counts[i] ?? 0;
    const pct = total ? Math.round((n / total) * 100) : 0;
    // Balken aus Blöcken - kommt ohne Bilder aus und liest sich überall gleich.
    const filled = Math.round(pct / 10);
    const bar = '█'.repeat(filled) + '░'.repeat(10 - filled);
    return `${NUMBER_EMOJI[i]} **${opt}**\n\`${bar}\` ${pct}% (${n})`;
  });

  const head = closed ? `📊 **${question}** _(beendet)_` : `📊 **${question}**`;
  const foot = closed
    ? `Endergebnis · ${total} Stimme${total === 1 ? '' : 'n'}`
    : [
        `${total} Stimme${total === 1 ? '' : 'n'}`,
        multi ? 'Mehrfachauswahl erlaubt' : 'eine Stimme pro Person',
        closesAt ? `endet <t:${closesAt}:R>` : null,
      ]
        .filter(Boolean)
        .join(' · ');

  return `${head}\n\n${lines.join('\n\n')}\n\n_${foot}_`;
}

export default {
  name: 'polls',

  setup({ db, client }) {
    const findPoll = db.prepare('SELECT * FROM polls WHERE message_id = ? AND closed = 0');
    const countsFor = db.prepare(
      'SELECT option_ix, COUNT(*) AS n FROM poll_votes WHERE poll_id = ? GROUP BY option_ix',
    );
    const addVote = db.prepare(
      'INSERT OR IGNORE INTO poll_votes (poll_id, user_id, option_ix, voted_at) VALUES (?, ?, ?, ?)',
    );
    const dropVote = db.prepare(
      'DELETE FROM poll_votes WHERE poll_id = ? AND user_id = ? AND option_ix = ?',
    );
    const dropOtherVotes = db.prepare(
      'DELETE FROM poll_votes WHERE poll_id = ? AND user_id = ? AND option_ix != ?',
    );
    const dueToClose = db.prepare(
      'SELECT * FROM polls WHERE closed = 0 AND closes_at IS NOT NULL AND closes_at <= ?',
    );
    const markClosed = db.prepare('UPDATE polls SET closed = 1 WHERE id = ?');

    function tally(pollId, optionCount) {
      const counts = new Array(optionCount).fill(0);
      for (const { option_ix, n } of countsFor.all(pollId)) counts[option_ix] = n;
      return counts;
    }

    async function refresh(poll) {
      const options = JSON.parse(poll.options);
      const text = renderPoll({
        question: poll.question,
        options,
        counts: tally(poll.id, options.length),
        closed: Boolean(poll.closed),
        multi: Boolean(poll.multi),
        closesAt: poll.closes_at,
      });
      const channel = await client.channels.fetch(poll.channel_id).catch(() => null);
      const message = await channel?.messages.fetch(poll.message_id).catch(() => null);
      if (message) await message.edit(text).catch((err) => log.warn('Umfrage-Update fehlgeschlagen', err));
    }

    async function handleVote(reaction, user, adding) {
      if (user.bot) return;
      if (reaction.partial) {
        try {
          await reaction.fetch();
        } catch {
          return;
        }
      }
      const poll = findPoll.get(reaction.message.id);
      if (!poll) return;

      const ix = NUMBER_EMOJI.indexOf(reaction.emoji.name);
      const options = JSON.parse(poll.options);
      if (ix < 0 || ix >= options.length) return;

      if (adding) {
        addVote.run(poll.id, user.id, ix, now());
        if (!poll.multi) {
          // Bei Einfachauswahl die vorherige Stimme zurücknehmen - auch die
          // Reaktion, damit die Anzeige nicht in die Irre führt.
          dropOtherVotes.run(poll.id, user.id, ix);
          for (let i = 0; i < options.length; i++) {
            if (i === ix) continue;
            const other = reaction.message.reactions.cache.get(NUMBER_EMOJI[i]);
            await other?.users.remove(user.id).catch(() => {});
          }
        }
      } else {
        dropVote.run(poll.id, user.id, ix);
      }
      await refresh(poll);
    }

    // Abgelaufene Umfragen schließen.
    const timer = setInterval(async () => {
      try {
        for (const poll of dueToClose.all(now())) {
          markClosed.run(poll.id);
          await refresh({ ...poll, closed: 1 });
          log.info(`Umfrage ${poll.id} automatisch beendet`);
        }
      } catch (err) {
        log.error('Beenden abgelaufener Umfragen fehlgeschlagen', err);
      }
    }, TICK_MS);
    timer.unref?.();

    return {
      messageReactionAdd: (r, u) => handleVote(r, u, true),
      messageReactionRemove: (r, u) => handleVote(r, u, false),
    };
  },
};
