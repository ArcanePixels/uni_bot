import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import {
  createTwitchClient,
  createTokenProvider,
  normalizeLogin,
  thumbnailUrl,
  verifySignature,
  TwitchError,
} from '../src/twitch.js';

/**
 * Die Twitch-Anbindung.
 *
 * Schwerpunkt liegt auf der Signaturpruefung: Der Webhook-Endpunkt ist
 * oeffentlich erreichbar, und ohne korrekte Pruefung koennte jeder gefaelschte
 * Live-Meldungen schicken.
 */

/** Eine Attrappe fuer fetch, die vorgegebene Antworten liefert. */
function fakeFetch(antworten) {
  const aufrufe = [];
  const fn = async (url, options = {}) => {
    aufrufe.push({ url: String(url), options });
    const treffer = antworten.find((a) => String(url).includes(a.match));
    if (!treffer) throw new Error(`Keine Antwort hinterlegt fuer ${url}`);
    if (treffer.throws) throw new Error(treffer.throws);
    return {
      ok: treffer.status ? treffer.status < 400 : true,
      status: treffer.status ?? 200,
      json: async () => treffer.body ?? {},
      text: async () => JSON.stringify(treffer.body ?? {}),
    };
  };
  fn.aufrufe = aufrufe;
  return fn;
}

const TOKEN_OK = {
  match: 'oauth2/token',
  body: { access_token: 'tok123', expires_in: 5000000 },
};

// --- Kanalnamen -----------------------------------------------------------

test('Kanalnamen werden aus allem erkannt, was Leute eintippen', () => {
  const faelle = [
    ['gronkh', 'gronkh'],
    ['GRONKH', 'gronkh'],
    ['  gronkh  ', 'gronkh'],
    ['@gronkh', 'gronkh'],
    ['https://twitch.tv/gronkh', 'gronkh'],
    ['https://www.twitch.tv/Gronkh', 'gronkh'],
    ['twitch.tv/gronkh', 'gronkh'],
    ['https://twitch.tv/gronkh?foo=1', 'gronkh'],
    ['https://twitch.tv/gronkh/videos', 'gronkh'],
  ];
  for (const [eingabe, erwartet] of faelle) {
    assert.equal(normalizeLogin(eingabe), erwartet, `"${eingabe}"`);
  }
});

test('Unsinn wird als Kanalname abgewiesen', () => {
  // Sonst landet Muell in der Abfrage und Twitch antwortet mit einem Fehler.
  for (const v of ['', '  ', null, undefined, 'ab', 'mit leerzeichen', 'hat-strich', 'ä'.repeat(5)]) {
    assert.equal(normalizeLogin(v), null, `"${v}" haette abgewiesen werden muessen`);
  }
});

// --- Vorschaubild ---------------------------------------------------------

test('Die Platzhalter im Vorschaubild werden ersetzt', () => {
  // So wie Twitch sie liefert, waere die Adresse unbrauchbar.
  const roh = 'https://static-cdn.jtvnw.net/previews/gronkh-{width}x{height}.jpg';
  assert.equal(thumbnailUrl(roh), 'https://static-cdn.jtvnw.net/previews/gronkh-640x360.jpg');
  assert.equal(
    thumbnailUrl(roh, 1280, 720),
    'https://static-cdn.jtvnw.net/previews/gronkh-1280x720.jpg',
  );
  assert.equal(thumbnailUrl(null), null);
});

// --- Signaturpruefung -----------------------------------------------------

const SECRET = 'ein-geheimnis-mit-genug-laenge';

/** Baut eine gueltig signierte Anfrage, so wie Twitch sie schickt. */
function signiere(body, { secret = SECRET, id = 'msg-1', timestamp = new Date().toISOString() } = {}) {
  const raw = typeof body === 'string' ? body : JSON.stringify(body);
  const signature =
    'sha256=' + createHmac('sha256', secret).update(id + timestamp + raw).digest('hex');
  return { secret: SECRET, messageId: id, timestamp, rawBody: raw, signature };
}

test('Eine gueltig signierte Anfrage wird angenommen', () => {
  assert.equal(verifySignature(signiere({ hallo: 'welt' })), true);
});

test('Eine gefaelschte Signatur wird abgewiesen', () => {
  const echt = signiere({ hallo: 'welt' });
  assert.equal(verifySignature({ ...echt, signature: 'sha256=' + '0'.repeat(64) }), false);
});

test('Ein veraenderter Inhalt faellt auf', () => {
  // Der Kern der Sache: Wer den Inhalt austauscht, hat keine passende Signatur.
  const echt = signiere({ betrag: 1 });
  assert.equal(verifySignature({ ...echt, rawBody: '{"betrag":9999}' }), false);
});

test('Ein falsches Geheimnis wird abgewiesen', () => {
  const fremd = signiere({ a: 1 }, { secret: 'anderes-geheimnis' });
  assert.equal(verifySignature(fremd), false);
});

test('Alte Nachrichten werden abgewiesen', () => {
  // Sonst koennte jemand eine mitgeschnittene gueltige Anfrage spaeter
  // erneut abschicken.
  const alt = new Date(Date.now() - 20 * 60_000).toISOString();
  assert.equal(verifySignature(signiere({ a: 1 }, { timestamp: alt })), false);
});

test('Nachrichten aus der Zukunft werden ebenfalls abgewiesen', () => {
  const zukunft = new Date(Date.now() + 20 * 60_000).toISOString();
  assert.equal(verifySignature(signiere({ a: 1 }, { timestamp: zukunft })), false);
});

test('Fehlende Angaben ergeben nie eine gueltige Signatur', () => {
  const echt = signiere({ a: 1 });
  for (const feld of ['secret', 'messageId', 'timestamp', 'signature']) {
    assert.equal(verifySignature({ ...echt, [feld]: undefined }), false, `ohne ${feld}`);
    assert.equal(verifySignature({ ...echt, [feld]: '' }), false, `${feld} leer`);
  }
});

test('Eine Signatur falscher Laenge stuerzt nicht ab', () => {
  // timingSafeEqual wirft bei unterschiedlicher Laenge - das muss abgefangen
  // sein, sonst legt eine fehlerhafte Anfrage den Endpunkt lahm.
  const echt = signiere({ a: 1 });
  assert.equal(verifySignature({ ...echt, signature: 'kurz' }), false);
  assert.equal(verifySignature({ ...echt, signature: 'sha256=' + 'a'.repeat(200) }), false);
});

// --- Zugangstoken ---------------------------------------------------------

test('Das Token wird geholt und wiederverwendet', async () => {
  const f = fakeFetch([TOKEN_OK]);
  const tokens = createTokenProvider({ clientId: 'id', clientSecret: 'geheim', fetchImpl: f });

  assert.equal(await tokens.get(), 'tok123');
  assert.equal(await tokens.get(), 'tok123');
  assert.equal(f.aufrufe.length, 1, 'nur eine Anfrage - das Token wird gehalten');
});

test('Parallele Aufrufe teilen sich eine Anfrage', async () => {
  const f = fakeFetch([TOKEN_OK]);
  const tokens = createTokenProvider({ clientId: 'id', clientSecret: 'geheim', fetchImpl: f });

  await Promise.all([tokens.get(), tokens.get(), tokens.get()]);
  assert.equal(f.aufrufe.length, 1, 'sonst drei gleichzeitige Anfragen fuer dasselbe Token');
});

test('Falsche Zugangsdaten werden klar gemeldet', async () => {
  const f = fakeFetch([{ match: 'oauth2/token', status: 401 }]);
  const tokens = createTokenProvider({ clientId: 'id', clientSecret: 'falsch', fetchImpl: f });

  await assert.rejects(() => tokens.get(), (err) => {
    assert.ok(err instanceof TwitchError);
    // Die Meldung muss sagen, wo man nachsehen soll.
    assert.match(err.message, /TWITCH_CLIENT_ID/);
    return true;
  });
});

test('Ein Netzwerkfehler wird als solcher gemeldet', async () => {
  const f = fakeFetch([{ match: 'oauth2/token', throws: 'ETIMEDOUT' }]);
  const tokens = createTokenProvider({ clientId: 'id', clientSecret: 'geheim', fetchImpl: f });
  await assert.rejects(() => tokens.get(), /nicht erreichbar/);
});

// --- Streamabfrage --------------------------------------------------------

const STREAM = {
  id: '123',
  user_login: 'Gronkh',
  user_name: 'Gronkh',
  title: 'Wir zocken',
  game_name: 'Elden Ring',
  viewer_count: 4200,
  started_at: '2026-08-24T18:00:00Z',
  thumbnail_url: 'https://cdn/prev-{width}x{height}.jpg',
};

test('Laufende Streams werden erkannt und aufbereitet', async () => {
  const f = fakeFetch([TOKEN_OK, { match: '/streams', body: { data: [STREAM] } }]);
  const client = createTwitchClient({ clientId: 'id', clientSecret: 'geheim', fetchImpl: f });

  const treffer = await client.getStreams(['Gronkh', 'papaplatte']);
  assert.equal(treffer.size, 1, 'nur wer live ist, kommt zurueck');

  const s = treffer.get('gronkh');
  assert.equal(s.name, 'Gronkh');
  assert.equal(s.game, 'Elden Ring');
  assert.equal(s.viewers, 4200);
  assert.equal(s.url, 'https://twitch.tv/Gronkh');
  assert.match(s.thumbnail, /640x360/, 'die Platzhalter muessen ersetzt sein');
});

test('Wer nicht live ist, taucht nicht auf', async () => {
  const f = fakeFetch([TOKEN_OK, { match: '/streams', body: { data: [] } }]);
  const client = createTwitchClient({ clientId: 'id', clientSecret: 'geheim', fetchImpl: f });
  assert.equal((await client.getStreams(['gronkh'])).size, 0);
});

test('Doppelte und ungueltige Namen werden vor der Abfrage aussortiert', async () => {
  const f = fakeFetch([TOKEN_OK, { match: '/streams', body: { data: [] } }]);
  const client = createTwitchClient({ clientId: 'id', clientSecret: 'geheim', fetchImpl: f });

  await client.getStreams(['Gronkh', 'gronkh', 'https://twitch.tv/gronkh', 'un gueltig', '']);
  const url = f.aufrufe.find((a) => a.url.includes('/streams')).url;
  const anzahl = (url.match(/user_login=/g) ?? []).length;
  assert.equal(anzahl, 1, `dreimal derselbe Kanal ergibt eine Abfrage, war: ${url}`);
});

test('Mehr als 100 Kanaele werden auf mehrere Abfragen verteilt', async () => {
  // Twitch erlaubt nicht mehr je Abfrage - sonst kaeme ein Fehler zurueck.
  const f = fakeFetch([TOKEN_OK, { match: '/streams', body: { data: [] } }]);
  const client = createTwitchClient({ clientId: 'id', clientSecret: 'geheim', fetchImpl: f });

  const viele = Array.from({ length: 250 }, (_, i) => `kanal${String(i).padStart(3, '0')}`);
  await client.getStreams(viele);

  const abfragen = f.aufrufe.filter((a) => a.url.includes('/streams'));
  assert.equal(abfragen.length, 3, '250 Kanaele ergeben drei Abfragen');
  for (const a of abfragen) {
    assert.ok((a.url.match(/user_login=/g) ?? []).length <= 100, 'nie mehr als 100 je Abfrage');
  }
});

test('Ein abgelaufenes Token wird einmal erneuert', async () => {
  let streamAufrufe = 0;
  const f = async (url, options = {}) => {
    if (String(url).includes('oauth2/token')) {
      return { ok: true, status: 200, json: async () => ({ access_token: 'neu', expires_in: 5000000 }) };
    }
    streamAufrufe++;
    // Der erste Versuch scheitert mit 401, der zweite geht durch.
    if (streamAufrufe === 1) return { ok: false, status: 401, json: async () => ({}) };
    return { ok: true, status: 200, json: async () => ({ data: [STREAM] }) };
  };
  const client = createTwitchClient({ clientId: 'id', clientSecret: 'geheim', fetchImpl: f });

  const treffer = await client.getStreams(['gronkh']);
  assert.equal(treffer.size, 1, 'nach dem Erneuern muss es klappen');
  assert.equal(streamAufrufe, 2, 'genau ein zweiter Versuch');
});

test('Drosselung wird als solche gemeldet', async () => {
  const f = fakeFetch([TOKEN_OK, { match: '/streams', status: 429 }]);
  const client = createTwitchClient({ clientId: 'id', clientSecret: 'geheim', fetchImpl: f });
  await assert.rejects(() => client.getStreams(['gronkh']), /drosselt/);
});

// --- EventSub -------------------------------------------------------------

test('Eine Anmeldung wird korrekt gestellt', async () => {
  const f = fakeFetch([TOKEN_OK, { match: 'eventsub', body: { data: [{ id: 'sub-1' }] } }]);
  const client = createTwitchClient({ clientId: 'id', clientSecret: 'geheim', fetchImpl: f });

  const r = await client.subscribe({
    userId: '999',
    callbackUrl: 'https://bot.example.de/twitch/webhook',
    secret: SECRET,
  });
  assert.equal(r.id, 'sub-1');

  const anfrage = f.aufrufe.find((a) => a.url.includes('eventsub'));
  const body = JSON.parse(anfrage.options.body);
  assert.equal(body.type, 'stream.online');
  assert.equal(body.condition.broadcaster_user_id, '999');
  assert.equal(body.transport.method, 'webhook');
  assert.equal(body.transport.secret, SECRET);
});

test('Eine bereits bestehende Anmeldung ist kein Fehler', async () => {
  // Sonst scheitert ein Neustart, bei dem alles schon angemeldet ist.
  const f = fakeFetch([TOKEN_OK, { match: 'eventsub', status: 409 }]);
  const client = createTwitchClient({ clientId: 'id', clientSecret: 'geheim', fetchImpl: f });

  const r = await client.subscribe({ userId: '1', callbackUrl: 'https://x/y', secret: SECRET });
  assert.equal(r.ok, true);
  assert.equal(r.schonVorhanden, true);
});

test('Eine bereits entfernte Anmeldung ist kein Fehler', async () => {
  const f = fakeFetch([TOKEN_OK, { match: 'eventsub', status: 404 }]);
  const client = createTwitchClient({ clientId: 'id', clientSecret: 'geheim', fetchImpl: f });
  assert.deepEqual(await client.unsubscribe('weg'), { ok: true });
});
