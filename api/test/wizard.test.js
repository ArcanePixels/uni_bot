import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';
import { ensureSchema } from '@allrounder/shared/schema';
import { createApp } from '../src/app.js';

const TOKEN = 'wizard-test-token';
let server, base;
const db = new Database(':memory:');

before(async () => {
  ensureSchema(db);
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
const get = (path) => fetch(base + path, { headers: auth() });

// --- Rechtepakete ----------------------------------------------------------

test('Rechtepakete sind abrufbar', async () => {
  const res = await get('/api/guilds/presets');
  assert.equal(res.status, 200);
  const list = await res.json();
  assert.ok(list.length >= 4, 'es müssen mehrere Pakete angeboten werden');
  for (const p of list) {
    assert.ok(p.key && p.label && p.description, `unvollständig: ${JSON.stringify(p)}`);
  }
});

// --- Rechte setzen ---------------------------------------------------------

test('Vorschau braucht Kanäle, Rolle und Paket', async () => {
  assert.equal((await post('/api/guilds/1/permissions/plan', {})).status, 400);
  assert.equal((await post('/api/guilds/1/permissions/plan', { channelIds: [] })).status, 400);
  assert.equal(
    (await post('/api/guilds/1/permissions/plan', { channelIds: ['c1'], roleId: 'r1' })).status,
    400,
  );
});

test('Unbekanntes Rechtepaket wird abgewiesen', async () => {
  const res = await post('/api/guilds/1/permissions/plan', {
    channelIds: ['c1'],
    roleId: 'r1',
    preset: 'alles-erlauben',
  });
  assert.equal(res.status, 400);
  assert.match((await res.json()).error, /Unbekanntes Rechtepaket/);
});

test('Zu viele Kanäle auf einmal werden abgewiesen', async () => {
  const res = await post('/api/guilds/1/permissions/plan', {
    channelIds: Array.from({ length: 201 }, (_, i) => `c${i}`),
    roleId: 'r1',
    preset: 'read',
  });
  assert.equal(res.status, 400);
  assert.match((await res.json()).error, /200/);
});

test('Gültige Anfrage kommt bis zur Discord-Abfrage', async () => {
  const res = await post('/api/guilds/1/permissions/plan', {
    channelIds: ['c1'],
    roleId: 'r1',
    preset: 'read',
  });
  assert.equal(res.status, 503, 'ohne Bot-Token 503, aber nicht 400');
});

test('Anwenden prüft dieselben Eingaben', async () => {
  assert.equal((await post('/api/guilds/1/permissions/apply', {})).status, 400);
  assert.equal(
    (await post('/api/guilds/1/permissions/apply', { channelIds: ['c'], roleId: 'r', preset: 'quatsch' })).status,
    400,
  );
});

test('Verlauf ist zunächst leer', async () => {
  const res = await get('/api/guilds/1/permissions/history');
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), []);
});

test('Zurücknehmen einer unbekannten Änderung gibt 404', async () => {
  const res = await post('/api/guilds/1/permissions/undo/9999', {});
  assert.equal(res.status, 404);
});

// --- Interessens-Gruppen ---------------------------------------------------

test('Gruppe braucht Emoji, Beschriftung und Rolle', async () => {
  assert.equal((await post('/api/guilds/1/interests', {})).status, 400);
  assert.equal((await post('/api/guilds/1/interests', { emoji: '🎮' })).status, 400);
  assert.equal((await post('/api/guilds/1/interests', { emoji: '🎮', label: 'Games' })).status, 400);
});

test('Gruppe anlegen, lesen, ändern, löschen', async () => {
  const created = await post('/api/guilds/77/interests', {
    emoji: '🎮',
    label: 'Games',
    roleId: 'r-games',
    channelIds: ['c1', 'c2'],
    preset: 'write',
  });
  assert.equal(created.status, 201);
  const { id } = await created.json();

  const list = await (await get('/api/guilds/77/interests')).json();
  assert.equal(list.length, 1);
  assert.equal(list[0].label, 'Games');
  assert.deepEqual(list[0].channelIds, ['c1', 'c2'], 'Kanäle müssen als Liste zurückkommen');

  const upd = await fetch(`${base}/api/guilds/77/interests/${id}`, {
    method: 'PUT',
    headers: auth(),
    body: JSON.stringify({ label: 'Gaming', channelIds: ['c1'] }),
  });
  assert.equal(upd.status, 200);
  const after = await (await get('/api/guilds/77/interests')).json();
  assert.equal(after[0].label, 'Gaming');
  assert.deepEqual(after[0].channelIds, ['c1']);
  assert.equal(after[0].emoji, '🎮', 'nicht geänderte Felder müssen bleiben');

  const del = await fetch(`${base}/api/guilds/77/interests/${id}`, {
    method: 'DELETE',
    headers: auth(),
  });
  assert.equal(del.status, 204);
});

test('Dasselbe Emoji zweimal wird abgewiesen', async () => {
  const body = { emoji: '📷', label: 'Fotografie', roleId: 'r-foto' };
  assert.equal((await post('/api/guilds/88/interests', body)).status, 201);
  const second = await post('/api/guilds/88/interests', { ...body, label: 'Anders' });
  assert.equal(second.status, 409);
  assert.match((await second.json()).error, /bereits verwendet/);
});

test('Unbekanntes Rechtepaket in einer Gruppe wird abgewiesen', async () => {
  const res = await post('/api/guilds/1/interests', {
    emoji: '🎨',
    label: 'Kunst',
    roleId: 'r',
    preset: 'unfug',
  });
  assert.equal(res.status, 400);
});

test('Veröffentlichen ohne Gruppen wird abgewiesen', async () => {
  const res = await post('/api/guilds/999/interests/publish', { channelId: 'c1' });
  assert.equal(res.status, 400);
  assert.match((await res.json()).error, /noch keine Interessens-Gruppe/);
});

test('Veröffentlichen braucht einen Kanal', async () => {
  assert.equal((await post('/api/guilds/88/interests/publish', {})).status, 400);
});

test('Guild-Trennung: fremde Gruppe ist nicht löschbar', async () => {
  const created = await post('/api/guilds/111/interests', {
    emoji: '🎵',
    label: 'Musik',
    roleId: 'r',
  });
  const { id } = await created.json();
  const res = await fetch(`${base}/api/guilds/222/interests/${id}`, {
    method: 'DELETE',
    headers: auth(),
  });
  assert.equal(res.status, 404);
});

test('Alle Wizard-Endpunkte brauchen den API-Token', async () => {
  for (const p of ['/api/guilds/1/interests', '/api/guilds/1/permissions/history']) {
    assert.equal((await fetch(base + p)).status, 401, `${p} war ungeschützt`);
  }
});
