import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import Database from 'better-sqlite3';
import { ensureSchema } from '@allrounder/shared/schema';
import { createApp } from '../src/app.js';

/**
 * Der Twitch-Webhook-Endpunkt.
 *
 * Der einzige Pfad der API, der ohne Token erreichbar ist - und damit der
 * einzige, den jeder aus dem Internet aufrufen kann. Entsprechend gruendlich:
 * Der Schwerpunkt liegt darauf, dass gefaelschte Anfragen nichts bewirken.
 */

const API_TOKEN = 'api-token';
const SECRET = 'webhook-geheimnis-mit-laenge';
let server, base;
const db = new Database(':memory:');

before(async () => {
  ensureSchema(db);
  server = createApp(db, API_TOKEN, null, null, [], new Map(), SECRET).listen(0);
  await new Promise((r) => server.once('listening', r));
  base = `http://127.0.0.1:${server.address().port}`;
});

after(() => {
  server.close();
  db.close();
});

/** Schickt eine Anfrage, so wie Twitch sie schickt. */
async function sende(body, { secret = SECRET, art = 'notification', id, timestamp, kaputt } = {}) {
  const raw = typeof body === 'string' ? body : JSON.stringify(body);
  const msgId = id ?? `msg-${Math.random().toString(36).slice(2)}`;
  const ts = timestamp ?? new Date().toISOString();
  const sig =
    'sha256=' + createHmac('sha256', secret).update(msgId + ts + raw).digest('hex');

  return fetch(`${base}/twitch/webhook`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'twitch-eventsub-message-id': msgId,
      'twitch-eventsub-message-timestamp': ts,
      'twitch-eventsub-message-signature': kaputt ?? sig,
      'twitch-eventsub-message-type': art,
    },
    body: raw,
  });
}

const LIVE_EVENT = {
  subscription: { type: 'stream.online', condition: { broadcaster_user_id: '123' } },
  event: {
    broadcaster_user_id: '123',
    broadcaster_user_login: 'Gronkh',
    broadcaster_user_name: 'Gronkh',
    started_at: '2026-08-24T18:00:00Z',
  },
};

const offene = () => db.prepare('SELECT * FROM twitch_events ORDER BY id').all();

// --- Abwehr ---------------------------------------------------------------

test('Eine Anfrage ohne Signatur wird abgewiesen', async () => {
  const res = await fetch(`${base}/twitch/webhook`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(LIVE_EVENT),
  });
  assert.equal(res.status, 403);
  assert.equal(offene().length, 0, 'nichts darf abgelegt worden sein');
});

test('Eine gefaelschte Signatur wird abgewiesen', async () => {
  const res = await sende(LIVE_EVENT, { kaputt: 'sha256=' + '0'.repeat(64) });
  assert.equal(res.status, 403);
  assert.equal(offene().length, 0);
});

test('Ein fremdes Geheimnis wird abgewiesen', async () => {
  // Der wichtigste Fall: Jemand kennt die Adresse, aber nicht das Geheimnis.
  const res = await sende(LIVE_EVENT, { secret: 'geraten' });
  assert.equal(res.status, 403);
  assert.equal(offene().length, 0);
});

test('Ein nachtraeglich veraenderter Inhalt faellt auf', async () => {
  // Signatur ueber den echten Inhalt bilden, dann einen anderen schicken.
  const echt = JSON.stringify(LIVE_EVENT);
  const msgId = 'manipuliert';
  const ts = new Date().toISOString();
  const sig = 'sha256=' + createHmac('sha256', SECRET).update(msgId + ts + echt).digest('hex');

  const res = await fetch(`${base}/twitch/webhook`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'twitch-eventsub-message-id': msgId,
      'twitch-eventsub-message-timestamp': ts,
      'twitch-eventsub-message-signature': sig,
      'twitch-eventsub-message-type': 'notification',
    },
    body: JSON.stringify({ ...LIVE_EVENT, event: { broadcaster_user_login: 'gekapert' } }),
  });
  assert.equal(res.status, 403);
  assert.equal(offene().length, 0);
});

test('Eine alte Anfrage wird abgewiesen', async () => {
  // Schutz davor, eine mitgeschnittene gueltige Anfrage spaeter erneut
  // abzuschicken.
  const alt = new Date(Date.now() - 30 * 60_000).toISOString();
  const res = await sende(LIVE_EVENT, { timestamp: alt });
  assert.equal(res.status, 403);
  assert.equal(offene().length, 0);
});

test('Eine kaputte Signatur legt den Endpunkt nicht lahm', async () => {
  for (const unsinn of ['', 'abc', 'sha256=', 'sha256=' + 'z'.repeat(64)]) {
    const res = await sende(LIVE_EVENT, { kaputt: unsinn });
    assert.equal(res.status, 403, `"${unsinn}"`);
  }
  // Danach muss der Endpunkt weiter funktionieren.
  assert.equal((await sende(LIVE_EVENT)).status, 204);
  db.prepare('DELETE FROM twitch_events').run();
});

// --- Der normale Ablauf ---------------------------------------------------

test('Twitch prueft beim Anmelden, ob wir zuhoeren', async () => {
  // Die Antwort muss der Challenge-Text im Klartext sein - alles andere
  // laesst die Anmeldung scheitern.
  const res = await sende(
    { challenge: 'bitte-zurueckgeben', subscription: { type: 'stream.online' } },
    { art: 'webhook_callback_verification' },
  );
  assert.equal(res.status, 200);
  assert.equal(await res.text(), 'bitte-zurueckgeben');
  assert.equal(offene().length, 0, 'die Pruefung ist kein Ereignis');
});

test('Eine Live-Meldung wird abgelegt', async () => {
  const res = await sende(LIVE_EVENT);
  assert.equal(res.status, 204, 'sofort bestaetigen, sonst wiederholt Twitch');

  const eintraege = offene();
  assert.equal(eintraege.length, 1);
  assert.equal(eintraege[0].typ, 'stream.online');
  assert.equal(eintraege[0].user_id, '123');
  assert.equal(eintraege[0].login, 'gronkh', 'klein geschrieben zum Vergleichen');
  assert.equal(eintraege[0].handled_at, null, 'noch unbearbeitet');
  db.prepare('DELETE FROM twitch_events').run();
});

test('Ein Zurueckziehen wird festgehalten', async () => {
  const res = await sende(
    {
      subscription: {
        type: 'stream.online',
        status: 'authorization_revoked',
        condition: { broadcaster_user_id: '456' },
      },
    },
    { art: 'revocation' },
  );
  assert.equal(res.status, 204);

  const eintraege = offene();
  assert.equal(eintraege.length, 1);
  assert.equal(eintraege[0].typ, 'revocation');
  db.prepare('DELETE FROM twitch_events').run();
});

test('Ungueltiges JSON wird abgewiesen', async () => {
  const res = await sende('{kein json');
  assert.equal(res.status, 400);
});

test('Eine unbekannte Art wird bestaetigt, nicht abgelehnt', async () => {
  // Sonst wiederholt Twitch endlos, nur weil eine neue Art dazugekommen ist.
  const res = await sende({ subscription: {} }, { art: 'irgendwas_neues' });
  assert.equal(res.status, 204);
});

// --- Zusammenspiel mit dem Rest der API -----------------------------------

test('Der Webhook laesst die uebrigen Endpunkte unberuehrt', async () => {
  // Der Webhook liest den Rohtext - danach muss express.json() fuer alle
  // anderen Pfade weiter funktionieren.
  const res = await fetch(`${base}/api/guilds/g1/settings`, {
    method: 'PUT',
    headers: { Authorization: `Bearer ${API_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ automod: { enabled: true } }),
  });
  assert.ok(res.status < 500, `JSON-Verarbeitung muss weiter gehen, war ${res.status}`);

  assert.equal((await fetch(`${base}/health`)).status, 200);
});

test('Der Webhook braucht kein API-Token', async () => {
  // Twitch kennt es nicht - der Endpunkt muss ohne auskommen.
  const res = await sende(LIVE_EVENT);
  assert.equal(res.status, 204);
  db.prepare('DELETE FROM twitch_events').run();
});

test('So unterscheidet man "laeuft" von "nicht eingerichtet"', async () => {
  // Genau die Pruefung, die in der Anleitung steht - sie muss stimmen, sonst
  // sucht man den Fehler an der falschen Stelle.
  const ohneSignatur = await fetch(`${base}/twitch/webhook`, { method: 'POST', body: '{}' });
  assert.equal(ohneSignatur.status, 403, 'eingerichtet: weist unsignierte Anfragen ab');

  // Ein GET sagt nichts aus - es ergibt immer 404.
  assert.equal((await fetch(`${base}/twitch/webhook`)).status, 404);
});

test('Ohne eingerichtetes Geheimnis gibt es den Endpunkt gar nicht', async () => {
  const leer = new Database(':memory:');
  ensureSchema(leer);
  const srv = createApp(leer, API_TOKEN, null).listen(0);
  await new Promise((r) => srv.once('listening', r));
  const url = `http://127.0.0.1:${srv.address().port}`;

  const res = await fetch(`${url}/twitch/webhook`, { method: 'POST', body: '{}' });
  assert.equal(res.status, 404, 'kein Geheimnis, kein Endpunkt');

  srv.close();
  leer.close();
});
