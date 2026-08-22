import { Cron } from 'croner';

/**
 * Rechnet die Rohdaten der API in das um, was die Übersicht zeigt.
 * Reine Funktion ohne Seiteneffekte, damit sie testbar bleibt.
 */
export function buildOverview({ settings, infractions, scheduled, feeds, now = Date.now() }) {
  const nowSec = Math.floor(now / 1000);
  const weekAgo = nowSec - 7 * 86400;
  const dayAgo = nowSec - 86400;

  const recent = infractions.filter((i) => i.created_at >= weekAgo);
  const today = infractions.filter((i) => i.created_at >= dayAgo);

  // Wer ist wie oft aufgefallen - zeigt Wiederholungstäter.
  const perUser = new Map();
  for (const i of recent) perUser.set(i.user_id, (perUser.get(i.user_id) ?? 0) + 1);
  const repeatOffenders = [...perUser.entries()]
    .filter(([, n]) => n > 1)
    .sort((a, b) => b[1] - a[1]);

  const byRule = recent.reduce((acc, i) => {
    acc[i.rule] = (acc[i.rule] ?? 0) + 1;
    return acc;
  }, {});

  const activePosts = scheduled.filter((p) => p.enabled);
  const nextPost = activePosts
    .map((p) => ({ post: p, at: nextRun(p, nowSec) }))
    .filter((x) => x.at !== null)
    .sort((a, b) => a.at - b.at)[0] ?? null;

  return {
    automodOn: Boolean(settings.automod?.enabled),
    welcomeOn: Boolean(settings.welcome?.enabled),
    autoroleCount: settings.welcome?.autoroleIds?.length ?? 0,
    badWordCount: settings.automod?.badWords?.length ?? 0,
    linkFilterOn: Boolean(settings.automod?.links?.enabled),
    spamOn: Boolean(settings.automod?.spam?.enabled),

    infractionsWeek: recent.length,
    infractionsToday: today.length,
    repeatOffenders: repeatOffenders.length,
    topOffender: repeatOffenders[0] ?? null,
    byRule,

    activePosts: activePosts.length,
    nextPost,
    activeFeeds: feeds.filter((f) => f.enabled).length,

    // Hinweise auf Dinge, die eingerichtet aber wirkungslos sind.
    warnings: collectWarnings({ settings, scheduled, feeds }),
  };
}

/** Nächster Ausführungszeitpunkt eines geplanten Posts, oder null. */
export function nextRun(post, nowSec) {
  if (post.run_at) return post.run_at >= nowSec ? post.run_at : null;
  if (!post.cron) return null;
  try {
    const next = new Cron(post.cron).nextRun(new Date(nowSec * 1000));
    return next ? Math.floor(next.getTime() / 1000) : null;
  } catch {
    return null;
  }
}

/**
 * Findet Einstellungen, die zwar aktiv sind, aber nichts bewirken - der
 * häufigste Grund für "der Bot macht nichts".
 */
export function collectWarnings({ settings, scheduled, feeds }) {
  const out = [];
  const am = settings.automod ?? {};
  const wc = settings.welcome ?? {};

  if (am.enabled) {
    const nothingActive =
      !am.badWords?.length && !am.links?.enabled && !am.spam?.enabled;
    if (nothingActive) {
      out.push('Automod ist an, aber keine einzige Regel aktiv – es passiert nichts.');
    }
    if (am.links?.enabled && !am.links.whitelist?.length) {
      out.push('Der Link-Filter ist an, aber die Whitelist ist leer – damit wird JEDER Link gelöscht.');
    }
  }

  if (wc.enabled && !wc.channelId && !wc.autoroleIds?.length) {
    out.push('Willkommen ist an, aber weder Kanal noch Rolle gesetzt – es passiert nichts.');
  }

  const orphanPosts = scheduled.filter((p) => !p.enabled && p.last_run_at).length;
  if (orphanPosts > 0) {
    out.push(
      `${orphanPosts} geplante${orphanPosts === 1 ? 'r Post wurde' : ' Posts wurden'} automatisch deaktiviert – meist, weil der Zielkanal nicht mehr erreichbar war.`,
    );
  }

  const staleFeeds = feeds.filter((f) => f.enabled && !f.last_checked_at).length;
  if (staleFeeds > 0) {
    out.push(`${staleFeeds} YouTube-Feed${staleFeeds === 1 ? '' : 's'} wurde noch nie geprüft.`);
  }

  return out;
}
