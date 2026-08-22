import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';
import { ensureSchema } from '@allrounder/shared/schema';
import { createApp } from '../src/app.js';

const TOKEN = 'test-token-1234567890';
let server, base;
const db = new Database(':memory:');

before(async () => {
  ensureSchema(db);
  server = createApp(db, TOKEN).listen(0);
  await new Promise((r) => server.once('listening', r));
  base = `http://127.0.0.1:${server.address().port}`;
});

after(() => {
  server.close();
  db.close();
});

const auth = (extra = {}) => ({ Authorization: `Bearer ${TOKEN}`, ...extra });
const json = (body) => ({
  method: 'POST',
  headers: auth({ 'Content-Type': 'application/json' }),
  body: JSON.stringify(body),
});

test('Healthcheck ist ohne Token erreichbar', async () => {
  const res = await fetch(`${base}/health`);
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { ok: true });
});

test('Ohne Token gibt es 401', async () => {
  assert.equal((await fetch(`${base}/api/guilds/1/settings`)).status, 401);
});

test('Falsches Token gibt 401', async () => {
  const res = await fetch(`${base}/api/guilds/1/settings`, {
    headers: { Authorization: 'Bearer falsch' },
  });
  assert.equal(res.status, 401);
});

test('Settings lesen liefert Defaults, schreiben merged', async () => {
  const get = await fetch(`${base}/api/guilds/1/settings`, { headers: auth() });
  assert.equal(get.status, 200);
  assert.equal((await get.json()).automod.enabled, true);

  const put = await fetch(`${base}/api/guilds/1/settings`, {
    method: 'PUT',
    headers: auth({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({ welcome: { enabled: true, channelId: '555' } }),
  });
  assert.equal(put.status, 200);
  const saved = await put.json();
  assert.equal(saved.welcome.channelId, '555');
  assert.equal(saved.automod.spam.maxMessages, 5, 'Defaults muessen erhalten bleiben');
});

test('Geplanter Post: anlegen, lesen, loeschen', async () => {
  const created = await fetch(
    `${base}/api/guilds/1/scheduled`,
    json({ channelId: '999', content: 'Hallo', cron: '0 9 * * *' }),
  );
  assert.equal(created.status, 201);
  const { id } = await created.json();

  const list = await (await fetch(`${base}/api/guilds/1/scheduled`, { headers: auth() })).json();
  assert.equal(list.length, 1);
  assert.equal(list[0].content, 'Hallo');

  const del = await fetch(`${base}/api/guilds/1/scheduled/${id}`, {
    method: 'DELETE',
    headers: auth(),
  });
  assert.equal(del.status, 204);
});

test('Geplanter Post braucht genau eine Zeitangabe', async () => {
  const beides = await fetch(
    `${base}/api/guilds/1/scheduled`,
    json({ channelId: '9', content: 'x', cron: '* * * * *', runAt: 123 }),
  );
  assert.equal(beides.status, 400);

  const keines = await fetch(`${base}/api/guilds/1/scheduled`, json({ channelId: '9', content: 'x' }));
  assert.equal(keines.status, 400);
});

test('YouTube-Feed weist Handles statt Kanal-IDs ab', async () => {
  const bad = await fetch(
    `${base}/api/guilds/1/youtube`,
    json({ ytChannelId: '@arcanepixels', channelId: '999' }),
  );
  assert.equal(bad.status, 400);
  assert.match((await bad.json()).error, /UC/);
});

test('YouTube-Feed doppelt anlegen gibt 409', async () => {
  const body = { ytChannelId: 'UCabcdefghijklmnopqrstuv', channelId: '999' };
  assert.equal((await fetch(`${base}/api/guilds/1/youtube`, json(body))).status, 201);
  assert.equal((await fetch(`${base}/api/guilds/1/youtube`, json(body))).status, 409);
});

test('Guild-Trennung: fremde IDs sind nicht loeschbar', async () => {
  const { id } = await (
    await fetch(`${base}/api/guilds/1/scheduled`, json({ channelId: '9', content: 'geheim', cron: '* * * * *' }))
  ).json();
  // Dieselbe ID, aber andere Guild -> darf nicht gefunden werden.
  const res = await fetch(`${base}/api/guilds/2/scheduled/${id}`, {
    method: 'DELETE',
    headers: auth(),
  });
  assert.equal(res.status, 404);
});

test('Kaputtes JSON gibt 400 statt 500', async () => {
  const res = await fetch(`${base}/api/guilds/1/scheduled`, {
    method: 'POST',
    headers: auth({ 'Content-Type': 'application/json' }),
    body: '{kaputt',
  });
  assert.equal(res.status, 400);
});

test('Unbekannter Endpunkt gibt 404', async () => {
  assert.equal((await fetch(`${base}/gibtsnicht`)).status, 404);
});
