import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';
import { ensureSchema } from '@allrounder/shared/schema';
import { createApp } from '../src/app.js';

/**
 * Ansehen und Loeschen der Daten eines Servers.
 *
 * Der einzige Endpunkt, der auf einen Schlag alles wegwirft. Entsprechend
 * liegt der Schwerpunkt darauf, dass er das **nicht** aus Versehen tut.
 */

const TOKEN = 'daten-token';
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
const hole = (p) => fetch(base + p, { headers: auth() });
const loesche = (guildId, body) =>
  fetch(`${base}/api/guilds/${guildId}/daten/loeschen`, {
    method: 'POST',
    headers: auth(),
    body: JSON.stringify(body ?? {}),
  });

/** Legt fuer zwei Server Daten an. */
function fuelle() {
  db.prepare('DELETE FROM guild_settings').run();
  db.prepare('DELETE FROM infractions').run();
  const s = db.prepare(
    "INSERT INTO guild_settings (guild_id, settings_json, updated_at) VALUES (?, '{}', 0)",
  );
  s.run('g-a');
  s.run('g-b');
  const i = db.prepare(
    'INSERT INTO infractions (guild_id, user_id, moderator, rule, action, created_at) VALUES (?,?,?,?,?,?)',
  );
  i.run('g-a', 'u1', 'm', 'spam', 'warn', 0);
  i.run('g-b', 'u2', 'm', 'spam', 'warn', 0);
}

const zaehle = (tabelle, guildId) =>
  db.prepare(`SELECT COUNT(*) AS n FROM ${tabelle} WHERE guild_id = ?`).get(guildId).n;

// --- Ansehen --------------------------------------------------------------

test('Die Übersicht nennt, was gespeichert ist', async () => {
  fuelle();
  const body = await (await hole('/api/guilds/g-a/daten')).json();
  assert.equal(body.gesamt, 2);
  assert.equal(body.tabellen.guild_settings, 1);
  assert.equal(body.tabellen.infractions, 1);
});

test('Ein leerer Server meldet null', async () => {
  const body = await (await hole('/api/guilds/gibtsnicht/daten')).json();
  assert.equal(body.gesamt, 0);
});

test('Beide Endpunkte brauchen den Token', async () => {
  assert.equal((await fetch(`${base}/api/guilds/g-a/daten`)).status, 401);
  assert.equal(
    (await fetch(`${base}/api/guilds/g-a/daten/loeschen`, { method: 'POST' })).status,
    401,
  );
});

// --- Der Schutz vor Versehen ---------------------------------------------

test('Ohne Bestätigung wird nichts gelöscht', async () => {
  // Der wichtigste Test: Ein Klick allein darf nicht reichen.
  fuelle();
  const res = await loesche('g-a', {});
  assert.equal(res.status, 400);
  assert.match((await res.json()).error, /Server-ID/);
  assert.equal(zaehle('guild_settings', 'g-a'), 1, 'nichts darf verschwunden sein');
});

test('Eine falsche Bestätigung löscht nichts', async () => {
  fuelle();
  const res = await loesche('g-a', { bestaetigung: 'g-b' });
  assert.equal(res.status, 400);
  assert.equal(zaehle('guild_settings', 'g-a'), 1);
  assert.equal(zaehle('guild_settings', 'g-b'), 1, 'erst recht nicht der andere Server');
});

test('Eine leere Bestätigung reicht nicht', async () => {
  fuelle();
  for (const wert of ['', ' ', null]) {
    const res = await loesche('g-a', { bestaetigung: wert });
    assert.equal(res.status, 400, `"${wert}"`);
  }
  assert.equal(zaehle('guild_settings', 'g-a'), 1);
});

// --- Das Löschen selbst ---------------------------------------------------

test('Mit korrekter Bestätigung verschwindet alles', async () => {
  fuelle();
  const res = await loesche('g-a', { bestaetigung: 'g-a' });
  assert.equal(res.status, 200);

  const body = await res.json();
  assert.equal(body.ok, true);
  assert.equal(body.entfernt, 2);

  assert.equal(zaehle('guild_settings', 'g-a'), 0);
  assert.equal(zaehle('infractions', 'g-a'), 0);
});

test('Der andere Server bleibt unberührt', async () => {
  fuelle();
  await loesche('g-a', { bestaetigung: 'g-a' });

  assert.equal(zaehle('guild_settings', 'g-b'), 1);
  assert.equal(zaehle('infractions', 'g-b'), 1);
});

test('Zweimal löschen ist kein Fehler', async () => {
  fuelle();
  await loesche('g-a', { bestaetigung: 'g-a' });
  const zweiter = await loesche('g-a', { bestaetigung: 'g-a' });
  assert.equal(zweiter.status, 200);
  assert.equal((await zweiter.json()).entfernt, 0);
});

test('Nach dem Löschen meldet die Übersicht null', async () => {
  fuelle();
  await loesche('g-a', { bestaetigung: 'g-a' });
  const body = await (await hole('/api/guilds/g-a/daten')).json();
  assert.equal(body.gesamt, 0);
});
