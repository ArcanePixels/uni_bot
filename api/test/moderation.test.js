import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';
import { ensureSchema } from '@allrounder/shared/schema';
import { createApp } from '../src/app.js';

const TOKEN = 'mod-test-token';
let server, base;
const db = new Database(':memory:');

before(async () => {
  ensureSchema(db);
  // Ohne Bot-Token: prueft den Weg, auf dem Discord gar nicht erst gefragt wird.
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

test('Moderation ohne Token ist nicht erreichbar', async () => {
  const res = await fetch(`${base}/api/guilds/1/moderate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ userId: '5', action: 'ban' }),
  });
  assert.equal(res.status, 401, 'ohne Bearer-Token muss es 401 geben');
});

test('Mitgliederliste ohne Token ist nicht erreichbar', async () => {
  assert.equal((await fetch(`${base}/api/guilds/1/members`)).status, 401);
});

test('Fehlende Pflichtfelder werden abgewiesen', async () => {
  assert.equal((await post('/api/guilds/1/moderate', {})).status, 400);
  assert.equal((await post('/api/guilds/1/moderate', { userId: '5' })).status, 400);
  assert.equal((await post('/api/guilds/1/moderate', { action: 'ban' })).status, 400);
});

test('Unbekannte Aktionen werden abgewiesen', async () => {
  const res = await post('/api/guilds/1/moderate', { userId: '5', action: 'explodieren' });
  assert.equal(res.status, 400);
  assert.match((await res.json()).error, /Unbekannte Aktion/);
});

test('Timeout-Dauer wird auf Discords Grenzen geprueft', async () => {
  // Discord erlaubt hoechstens 28 Tage = 40320 Minuten.
  for (const minutes of [0, -5, 40321, 'viel']) {
    const res = await post('/api/guilds/1/moderate', {
      userId: '5',
      action: 'timeout',
      minutes,
    });
    assert.equal(res.status, 400, `minutes=${minutes} haette abgelehnt werden muessen`);
  }
});

test('Gueltige Timeout-Dauer passiert die Pruefung', async () => {
  // Ohne Bot-Token kommt danach 503 - aber eben NICHT 400.
  const res = await post('/api/guilds/1/moderate', {
    userId: '5',
    action: 'timeout',
    minutes: 10,
  });
  assert.equal(res.status, 503, 'ohne DISCORD_TOKEN muss 503 kommen, nicht 400');
});

test('Ohne DISCORD_TOKEN meldet die API das verstaendlich', async () => {
  const res = await fetch(`${base}/api/guilds/1/members`, { headers: auth() });
  assert.equal(res.status, 503);
  assert.match((await res.json()).error, /DISCORD_TOKEN/);
});

test('resolve vertraegt eine leere Liste', async () => {
  const res = await post('/api/guilds/1/resolve', { ids: [] });
  assert.equal(res.status, 503, 'ohne Bot-Token 503, aber kein Absturz');
});
