import { Router, raw } from 'express';
import {
  verifySignature,
  HEADERS,
  MESSAGE_TYPES,
} from '@allrounder/shared/twitch';

/**
 * Der Webhook-Endpunkt fuer Twitch (EventSub).
 *
 * Liegt bewusst **ausserhalb** der Token-Pruefung: Twitch kennt unser API-Token
 * nicht. Stattdessen weist sich Twitch mit einer Signatur aus, die aus einem
 * gemeinsamen Geheimnis berechnet wird.
 *
 * Zwei Dinge sind hier heikel:
 *
 * 1. **Der Rohtext.** Die Signatur wird ueber den unveraenderten Text der
 *    Anfrage gebildet. Haette `express.json()` ihn schon geparst und wieder
 *    zusammengesetzt, stimmte die Signatur nicht mehr - deshalb `raw()`.
 *
 * 2. **Antwortzeit.** Twitch erwartet eine Antwort binnen weniger Sekunden und
 *    wiederholt sonst. Wir bestaetigen deshalb sofort und legen die Arbeit in
 *    die Datenbank, statt Discord waehrend der Anfrage anzusprechen.
 */
export function twitchWebhookRoutes(db, { secret, onEvent = null } = {}) {
  const router = Router();

  // Der Rohtext wird fuer die Signatur gebraucht.
  router.use(raw({ type: '*/*', limit: '256kb' }));

  router.post('/', (req, res) => {
    // Ohne Geheimnis kann nichts geprueft werden - dann lieber gar nichts
    // annehmen, als ungeprueft zu handeln.
    if (!secret) return res.status(503).send('Twitch-Webhook ist nicht eingerichtet');

    const rawBody = Buffer.isBuffer(req.body) ? req.body.toString('utf8') : String(req.body ?? '');

    const echt = verifySignature({
      secret,
      messageId: req.get(HEADERS.id),
      timestamp: req.get(HEADERS.timestamp),
      signature: req.get(HEADERS.signature),
      rawBody,
    });
    // 403 ohne Details: Wer faelscht, soll nicht erfahren, woran es lag.
    if (!echt) return res.status(403).send('Ungueltige Signatur');

    let daten;
    try {
      daten = JSON.parse(rawBody);
    } catch {
      return res.status(400).send('Ungueltiges JSON');
    }

    const art = req.get(HEADERS.type);

    // 1. Twitch prueft beim Anmelden, ob wir wirklich zuhoeren. Die Antwort
    //    muss der Challenge-Text im Klartext sein.
    if (art === MESSAGE_TYPES.VERIFICATION) {
      return res.status(200).type('text/plain').send(daten.challenge ?? '');
    }

    // 2. Twitch hat eine Anmeldung zurueckgezogen (etwa nach zu vielen
    //    Fehlversuchen). Nur festhalten, damit man es im Log sieht.
    if (art === MESSAGE_TYPES.REVOCATION) {
      console.warn(
        `[twitch] Anmeldung zurueckgezogen: ${daten.subscription?.type} ` +
          `fuer ${daten.subscription?.condition?.broadcaster_user_id} ` +
          `(Grund: ${daten.subscription?.status})`,
      );
      merkeEreignis(db, {
        typ: 'revocation',
        userId: daten.subscription?.condition?.broadcaster_user_id ?? null,
        rohdaten: rawBody,
      });
      return res.status(204).end();
    }

    // 3. Der eigentliche Fall: Jemand ist live gegangen.
    if (art === MESSAGE_TYPES.NOTIFICATION) {
      const e = daten.event ?? {};
      merkeEreignis(db, {
        typ: daten.subscription?.type ?? 'unbekannt',
        userId: e.broadcaster_user_id ?? null,
        login: (e.broadcaster_user_login ?? '').toLowerCase() || null,
        name: e.broadcaster_user_name ?? null,
        startedAt: e.started_at ?? null,
        rohdaten: rawBody,
      });
      // Nur fuer Tests und den Fall, dass jemand direkt mithoeren will.
      onEvent?.(daten);
      // Sofort bestaetigen - der Bot holt sich das Ereignis aus der Datenbank.
      return res.status(204).end();
    }

    // Unbekannte Art: bestaetigen, damit Twitch nicht endlos wiederholt.
    return res.status(204).end();
  });

  return router;
}

/**
 * Legt das Ereignis in der Datenbank ab.
 *
 * Der Bot laeuft in einem eigenen Container und kann von hier nicht direkt
 * angesprochen werden - die Datenbank ist der Briefkasten dazwischen.
 * Doppelte Ereignisse sind moeglich (Twitch wiederholt bei Zweifeln), deshalb
 * verwirft der Bot spaeter Wiederholungen.
 */
function merkeEreignis(db, { typ, userId, login = null, name = null, startedAt = null, rohdaten }) {
  try {
    db.prepare(
      `INSERT INTO twitch_events (typ, user_id, login, name, started_at, rohdaten, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    ).run(typ, userId, login, name, startedAt, rohdaten, Math.floor(Date.now() / 1000));
  } catch (err) {
    // Der Empfang darf nicht scheitern, nur weil das Ablegen misslingt -
    // sonst wiederholt Twitch endlos.
    console.error('[twitch] Ereignis konnte nicht abgelegt werden:', err.message);
  }
}

/** Legt die Tabelle an, in der eingehende Ereignisse landen. */
export function ensureTwitchEventTable(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS twitch_events (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      typ        TEXT    NOT NULL,
      user_id    TEXT,
      login      TEXT,
      name       TEXT,
      started_at TEXT,
      rohdaten   TEXT,
      created_at INTEGER NOT NULL,
      handled_at INTEGER
    );
    CREATE INDEX IF NOT EXISTS idx_twitch_events_offen
      ON twitch_events (handled_at, id);
  `);
}
