import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';
import { ensureSchema } from '@allrounder/shared/schema';
import { createApp } from '../src/app.js';

const TOKEN = 'feat-test-token';
let server, base;
const db = new Database(':memory:');

before(async () => {
  ensureSchema(db);
  // Ohne Bot-Token - prueft die Eingabekontrolle, ohne Discord zu berühren.
  server = createApp(db, TOKEN, null).listen(0);
  await new Promise((r) => server.once('listening', r));
  base = `http://127.0.0.1:${server.address().port}`;
});

after(() => {
  server.close();
  db.close();
});

const auth = () => ({ Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' });
const post = (path, body) =>
  fetch(base + path, { method: 'POST', headers: auth(), body: JSON.stringify(body) });

// --- Reaction Roles --------------------------------------------------------

test('Reaction-Role-Panel braucht Kanal, Titel und Optionen', async () => {
  assert.equal((await post('/api/guilds/1/reactionroles', {})).status, 400);
  assert.equal((await post('/api/guilds/1/reactionroles', { channelId: 'c' })).status, 400);
  assert.equal(
    (await post('/api/guilds/1/reactionroles', { channelId: 'c', title: 'T', options: [] })).status,
    400,
  );
});

test('Jede Option braucht Emoji und Rolle', async () => {
  const res = await post('/api/guilds/1/reactionroles', {
    channelId: 'c',
    title: 'T',
    options: [{ emoji: '🎮' }],
  });
  assert.equal(res.status, 400);
  assert.match((await res.json()).error, /emoji und roleId/);
});

test('Doppelte Emojis werden abgewiesen', async () => {
  const res = await post('/api/guilds/1/reactionroles', {
    channelId: 'c',
    title: 'T',
    options: [
      { emoji: '🎮', roleId: 'r1' },
      { emoji: '🎮', roleId: 'r2' },
    ],
  });
  assert.equal(res.status, 400);
  assert.match((await res.json()).error, /nur einmal/);
});

test('Mehr als 20 Optionen werden abgewiesen', async () => {
  const options = Array.from({ length: 21 }, (_, i) => ({ emoji: `e${i}`, roleId: `r${i}` }));
  const res = await post('/api/guilds/1/reactionroles', { channelId: 'c', title: 'T', options });
  assert.equal(res.status, 400);
});

test('Gültiges Panel kommt bis zur Discord-Anfrage', async () => {
  const res = await post('/api/guilds/1/reactionroles', {
    channelId: 'c',
    title: 'Rollen',
    options: [{ emoji: '🎮', roleId: 'r1' }],
  });
  // Ohne Bot-Token 503 - aber eben nicht 400.
  assert.equal(res.status, 503);
});

test('Leere Panel-Liste ist kein Fehler', async () => {
  const res = await fetch(`${base}/api/guilds/999/reactionroles`, { headers: auth() });
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), []);
});

// --- Umfragen --------------------------------------------------------------

test('Umfrage braucht mindestens zwei Antworten', async () => {
  const res = await post('/api/guilds/1/polls', {
    channelId: 'c',
    question: 'Nur eine?',
    options: ['A'],
  });
  assert.equal(res.status, 400);
  assert.match((await res.json()).error, /zwei/);
});

test('Umfrage erlaubt höchstens zehn Antworten', async () => {
  const res = await post('/api/guilds/1/polls', {
    channelId: 'c',
    question: 'Zu viele?',
    options: Array.from({ length: 11 }, (_, i) => `Option ${i}`),
  });
  assert.equal(res.status, 400);
  assert.match((await res.json()).error, /zehn/);
});

test('Leere Antworten werden herausgefiltert', async () => {
  // Nach dem Filtern bleibt nur eine - muss also abgelehnt werden.
  const res = await post('/api/guilds/1/polls', {
    channelId: 'c',
    question: 'Test',
    options: ['A', '  ', ''],
  });
  assert.equal(res.status, 400);
});

test('Ende in der Vergangenheit wird abgewiesen', async () => {
  const res = await post('/api/guilds/1/polls', {
    channelId: 'c',
    question: 'Schon vorbei?',
    options: ['A', 'B'],
    closesAt: Math.floor(Date.now() / 1000) - 3600,
  });
  assert.equal(res.status, 400);
  assert.match((await res.json()).error, /Zukunft/);
});

test('Gültige Umfrage kommt bis zur Discord-Anfrage', async () => {
  const res = await post('/api/guilds/1/polls', {
    channelId: 'c',
    question: 'Pizza oder Pasta?',
    options: ['Pizza', 'Pasta'],
  });
  assert.equal(res.status, 503, 'ohne Bot-Token 503, aber nicht 400');
});

// --- Tickets ---------------------------------------------------------------

test('Ticket-Panel braucht einen Kanal', async () => {
  assert.equal((await post('/api/guilds/1/tickets/panel', {})).status, 400);
});

test('Ticket-Liste ist zunächst leer', async () => {
  const res = await fetch(`${base}/api/guilds/1/tickets`, { headers: auth() });
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), []);
});

// --- Absicherung -----------------------------------------------------------

test('Alle neuen Endpunkte brauchen den API-Token', async () => {
  for (const path of [
    '/api/guilds/1/reactionroles',
    '/api/guilds/1/polls',
    '/api/guilds/1/tickets',
  ]) {
    assert.equal((await fetch(base + path)).status, 401, `${path} war ungeschützt`);
  }
});

test('Guild-Trennung: fremdes Panel ist nicht löschbar', async () => {
  const info = db
    .prepare(
      `INSERT INTO reaction_role_panels (guild_id, channel_id, title, mode, created_at)
       VALUES ('111', 'c', 'T', 'multi', 0)`,
    )
    .run();
  const res = await fetch(`${base}/api/guilds/222/reactionroles/${info.lastInsertRowid}`, {
    method: 'DELETE',
    headers: auth(),
  });
  assert.equal(res.status, 404);
});

// --- YouTube: Pruefung anfordern -------------------------------------------

test('Pruefung anfordern ohne eingetragenen Kanal wird abgewiesen', async () => {
  const res = await post('/api/guilds/leer/youtube/check', {});
  assert.equal(res.status, 400);
  assert.match((await res.json()).error, /kein YouTube-Kanal/);
});

test('Pruefung anfordern hinterlegt eine Anfrage fuer den Bot', async () => {
  // Der Bot laeuft in einem eigenen Prozess - die API kann den Abruf nicht
  // selbst ausloesen, sondern hinterlegt eine Anforderung in der Datenbank.
  db.prepare(
    `INSERT INTO youtube_feeds (guild_id, channel_id, yt_channel_id, created_at)
     VALUES ('900', 'c1', 'UCaaaaaaaaaaaaaaaaaaaaaa', 0)`,
  ).run();

  const vorher = db.prepare("SELECT * FROM check_requests WHERE kind = 'youtube'").get();
  assert.equal(vorher, undefined, 'vorher darf nichts offen sein');

  const res = await post('/api/guilds/900/youtube/check', {});
  assert.equal(res.status, 200);
  assert.equal((await res.json()).feeds, 1);

  const nachher = db.prepare("SELECT * FROM check_requests WHERE kind = 'youtube'").get();
  assert.ok(nachher, 'die Anforderung muss hinterlegt sein');
  assert.ok(nachher.requested_at > 0);
  assert.equal(nachher.handled_at, null, 'noch nicht abgearbeitet');
});

test('Mehrfaches Anfordern legt keine zweite Zeile an', async () => {
  await post('/api/guilds/900/youtube/check', {});
  await post('/api/guilds/900/youtube/check', {});
  const n = db.prepare("SELECT COUNT(*) AS n FROM check_requests WHERE kind = 'youtube'").get().n;
  assert.equal(n, 1, 'der Zeitstempel wird ueberschrieben, nicht angehaengt');
});

test('Die Anfrage braucht den API-Token', async () => {
  const res = await fetch(`${base}/api/guilds/900/youtube/check`, { method: 'POST' });
  assert.equal(res.status, 401);
});
