import { now } from '@allrounder/shared';
import { createLogger } from '../core/logger.js';

const log = createLogger('youtube');

const FEED_URL = 'https://www.youtube.com/feeds/videos.xml?channel_id=';
const DEFAULT_INTERVAL_MS = 10 * 60_000;

/**
 * Minimaler Parser fuer den YouTube-Atom-Feed. Wir brauchen nur den neuesten
 * Eintrag, daher lohnt keine XML-Abhaengigkeit.
 */
export function parseFeed(xml) {
  const entry = xml.match(/<entry>([\s\S]*?)<\/entry>/);
  if (!entry) return null;
  const block = entry[1];
  // Die Tag-Namen kommen ausschliesslich als Literale aus diesem Modul und
  // bestehen nur aus Wortzeichen und ":" - beides ohne Sonderbedeutung in
  // einer Regex, daher ist kein Escaping noetig.
  const pick = (tag) =>
    block.match(new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`))?.[1]?.trim() ?? null;
  const videoId = pick('yt:videoId');
  if (!videoId) return null;
  return {
    videoId,
    title: decodeEntities(pick('title') ?? ''),
    author: decodeEntities(block.match(/<author>[\s\S]*?<name>([\s\S]*?)<\/name>/)?.[1]?.trim() ?? ''),
    url: `https://www.youtube.com/watch?v=${videoId}`,
    publishedAt: pick('published'),
  };
}

function decodeEntities(s) {
  return s
    .replaceAll('&amp;', '&')
    .replaceAll('&lt;', '<')
    .replaceAll('&gt;', '>')
    .replaceAll('&quot;', '"')
    .replaceAll('&#39;', "'");
}

export default {
  name: 'youtube',

  setup({ db, client }) {
    const intervalMs = Number(process.env.YOUTUBE_INTERVAL_MS ?? DEFAULT_INTERVAL_MS);
    const selectFeeds = db.prepare('SELECT * FROM youtube_feeds WHERE enabled = 1');
    const update = db.prepare(
      'UPDATE youtube_feeds SET last_video_id = ?, last_checked_at = ? WHERE id = ?',
    );
    const touch = db.prepare('UPDATE youtube_feeds SET last_checked_at = ? WHERE id = ?');

    // Anforderung einer Pruefung ausserhalb der Reihe, ausgeloest ueber das
    // Dashboard. Bot und API sind getrennte Prozesse - die Datenbank ist der
    // einfachste gemeinsame Nenner.
    const offeneAnfrage = db.prepare(
      "SELECT requested_at FROM check_requests WHERE kind = 'youtube' AND (handled_at IS NULL OR handled_at < requested_at)",
    );
    const anfrageErledigt = db.prepare(
      "UPDATE check_requests SET handled_at = ? WHERE kind = 'youtube'",
    );

    async function checkFeed(feed) {
      const res = await fetch(FEED_URL + encodeURIComponent(feed.yt_channel_id), {
        signal: AbortSignal.timeout(15_000),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const latest = parseFeed(await res.text());
      if (!latest) {
        touch.run(now(), feed.id);
        return;
      }

      // Erster Lauf: nur merken, nicht posten - sonst kaeme beim Einrichten
      // sofort ein alter Upload als "neu" rein.
      if (!feed.last_video_id) {
        update.run(latest.videoId, now(), feed.id);
        log.info(`Feed ${feed.yt_channel_id} initialisiert auf ${latest.videoId}`);
        return;
      }
      if (latest.videoId === feed.last_video_id) {
        touch.run(now(), feed.id);
        return;
      }

      const channel = await client.channels.fetch(feed.channel_id).catch(() => null);
      if (!channel) {
        log.warn(`Feed ${feed.id}: Zielkanal ${feed.channel_id} nicht erreichbar`);
        touch.run(now(), feed.id);
        return;
      }

      const tpl = feed.template ?? 'Neues Video von **{author}**: {title}\n{url}';
      const text = tpl
        .replaceAll('{title}', latest.title)
        .replaceAll('{url}', latest.url)
        .replaceAll('{author}', latest.author);

      await channel.send(text);
      update.run(latest.videoId, now(), feed.id);
      log.info(`Neues Video gepostet: ${latest.videoId} -> ${feed.channel_id}`);
    }

    async function tick() {
      for (const feed of selectFeeds.all()) {
        try {
          await checkFeed(feed);
        } catch (err) {
          // Netzwerkfehler sind normal; der naechste Tick versucht es erneut.
          log.warn(`Feed-Check ${feed.yt_channel_id} fehlgeschlagen`, err);
        }
      }
    }

    // Der regulaere Durchlauf.
    this._timer = setInterval(() => {
      tick().catch((err) => log.error('YouTube-Tick gescheitert', err));
    }, intervalMs);

    // Haeufiger nachsehen, ob jemand im Dashboard auf "Jetzt pruefen" geklickt
    // hat - sonst muesste man bis zum naechsten regulaeren Durchlauf warten.
    this._anfrageTimer = setInterval(() => {
      try {
        if (!offeneAnfrage.get()) return;
        anfrageErledigt.run(now());
        log.info('Pruefung ueber das Dashboard angefordert');
        tick().catch((err) => log.error('Angeforderte Pruefung gescheitert', err));
      } catch (err) {
        log.warn('Pruefen der Anfrage fehlgeschlagen', err);
      }
    }, 5_000);

    return {
      ready: () => tick().catch((err) => log.error('Erster YouTube-Lauf gescheitert', err)),
    };
  },

  teardown() {
    clearInterval(this._timer);
    clearInterval(this._anfrageTimer);
  },
};
