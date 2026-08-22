import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';
import { ensureSchema } from '@allrounder/shared/schema';
import { createApp } from '../src/app.js';

const TOKEN = 'cmd-test-token';
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
const post = (p, b) => fetch(base + p, { method: 'POST', headers: auth(), body: JSON.stringify(b) });
const get = (p) => fetch(base + p, { headers: auth() });

// --- Eigene Befehle --------------------------------------------------------

test('Befehl braucht Namen und Antwort', async () => {
  assert.equal((await post('/api/guilds/1/commands', {})).status, 400);
  assert.equal((await post('/api/guilds/1/commands', { name: 'regeln' })).status, 400);
  assert.equal((await post('/api/guilds/1/commands', { response: 'text' })).status, 400);
});

test('Unsinnige Befehlsnamen werden abgewiesen', async () => {
  for (const name of ['@everyone', 'mit leerzeichen', 'x'.repeat(40), '!!!']) {
    const res = await post('/api/guilds/1/commands', { name, response: 'x' });
    assert.equal(res.status, 400, `"${name}" hätte abgelehnt werden müssen`);
  }
});

test('Zu lange Antworten werden abgewiesen', async () => {
  const res = await post('/api/guilds/1/commands', { name: 'lang', response: 'x'.repeat(2000) });
  assert.equal(res.status, 400);
  assert.match((await res.json()).error, /1900/);
});

test('Befehl anlegen, lesen, ändern, löschen', async () => {
  const created = await post('/api/guilds/50/commands', {
    name: 'Regeln',
    response: 'Bitte lies {channel}',
  });
  assert.equal(created.status, 201);
  const { id, name } = await created.json();
  assert.equal(name, 'regeln', 'Namen werden kleingeschrieben gespeichert');

  const list = await (await get('/api/guilds/50/commands')).json();
  assert.equal(list.length, 1);
  assert.equal(list[0].uses, 0);

  const upd = await fetch(`${base}/api/guilds/50/commands/${id}`, {
    method: 'PUT',
    headers: auth(),
    body: JSON.stringify({ response: 'Neuer Text' }),
  });
  assert.equal(upd.status, 200);
  const after2 = await (await get('/api/guilds/50/commands')).json();
  assert.equal(after2[0].response, 'Neuer Text');
  assert.equal(after2[0].name, 'regeln', 'der Name bleibt');

  const del = await fetch(`${base}/api/guilds/50/commands/${id}`, {
    method: 'DELETE',
    headers: auth(),
  });
  assert.equal(del.status, 204);
});

test('Derselbe Befehlsname zweimal wird abgewiesen', async () => {
  const body = { name: 'hilfe', response: 'Hilfe-Text' };
  assert.equal((await post('/api/guilds/51/commands', body)).status, 201);
  const second = await post('/api/guilds/51/commands', body);
  assert.equal(second.status, 409);
  assert.match((await second.json()).error, /existiert bereits/);
});

test('Derselbe Name auf anderem Server ist erlaubt', async () => {
  const body = { name: 'hilfe', response: 'Text' };
  assert.equal((await post('/api/guilds/52/commands', body)).status, 201);
});

test('Ein- und Ausschalten funktioniert', async () => {
  const { id } = await (
    await post('/api/guilds/53/commands', { name: 'test', response: 'x' })
  ).json();

  await fetch(`${base}/api/guilds/53/commands/${id}`, {
    method: 'PUT',
    headers: auth(),
    body: JSON.stringify({ enabled: false }),
  });
  const list = await (await get('/api/guilds/53/commands')).json();
  assert.equal(list[0].enabled, 0);
});

test('Guild-Trennung: fremder Befehl ist nicht löschbar', async () => {
  const { id } = await (
    await post('/api/guilds/60/commands', { name: 'geheim', response: 'x' })
  ).json();
  const res = await fetch(`${base}/api/guilds/61/commands/${id}`, {
    method: 'DELETE',
    headers: auth(),
  });
  assert.equal(res.status, 404);
});

// --- Nachrichten-Log -------------------------------------------------------

test('Nachrichten-Log ist zunächst leer', async () => {
  const res = await get('/api/guilds/70/messagelog');
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), []);
});

test('Log lässt sich nach Mitglied filtern und löschen', async () => {
  const ins = db.prepare(
    `INSERT INTO message_log (guild_id, channel_id, message_id, author_id, kind, content_before, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  );
  ins.run('71', 'c1', 'm1', 'userA', 'delete', 'text a', 1);
  ins.run('71', 'c1', 'm2', 'userB', 'delete', 'text b', 2);

  const all = await (await get('/api/guilds/71/messagelog')).json();
  assert.equal(all.length, 2);

  const onlyA = await (await get('/api/guilds/71/messagelog?userId=userA')).json();
  assert.equal(onlyA.length, 1);
  assert.equal(onlyA[0].author_id, 'userA');

  const del = await fetch(`${base}/api/guilds/71/messagelog?userId=userA`, {
    method: 'DELETE',
    headers: auth(),
  });
  assert.equal((await del.json()).deleted, 1);

  const rest = await (await get('/api/guilds/71/messagelog')).json();
  assert.equal(rest.length, 1, 'der andere Eintrag muss bleiben');
});

test('Alle neuen Endpunkte brauchen den API-Token', async () => {
  for (const p of ['/api/guilds/1/commands', '/api/guilds/1/messagelog']) {
    assert.equal((await fetch(base + p)).status, 401, `${p} war ungeschützt`);
  }
});
