import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';
import { ensureSchema } from '@allrounder/shared/schema';
import { createApp } from '../src/app.js';

/**
 * Die Auskunft, ob der Bot auf einem Server ist.
 *
 * Wichtig ist hier die Unterscheidung: „nicht eingeladen" und „Discord gerade
 * nicht erreichbar" sehen von aussen aehnlich aus, brauchen aber
 * unterschiedliche Antworten. Wer bei einem Discord-Ausfall zum Einladen
 * aufgefordert wird, laedt einen Bot ein, der laengst da ist.
 */

const TOKEN = 'status-token';
let server, base;
const db = new Database(':memory:');

before(async () => {
  ensureSchema(db);
  // Ohne Bot-Token - der haeufigste Fall in einer frischen Installation.
  server = createApp(db, TOKEN, null).listen(0);
  await new Promise((r) => server.once('listening', r));
  base = `http://127.0.0.1:${server.address().port}`;
});

after(() => {
  server.close();
  db.close();
});

const hole = (pfad) => fetch(base + pfad, { headers: { Authorization: `Bearer ${TOKEN}` } });

test('Ohne Bot-Token wird das klar gesagt', async () => {
  const res = await hole('/api/guilds/123/bot-status');
  assert.equal(res.status, 200);

  const body = await res.json();
  assert.equal(body.vorhanden, false);
  assert.equal(body.grund, 'kein-token');
});

test('Die Auskunft braucht den API-Token', async () => {
  assert.equal((await fetch(`${base}/api/guilds/123/bot-status`)).status, 401);
});

test('Die Antwort verrät nichts über den Server', async () => {
  // Nur ja/nein - wer die Serverdaten will, hat dafuer eigene Endpunkte,
  // die die Berechtigung pruefen.
  const roh = await (await hole('/api/guilds/123/bot-status')).text();
  assert.ok(!roh.includes('name'), 'kein Servername in der Antwort');
  assert.ok(!roh.includes('icon'));
});

test('Die Antwort ist immer 200, auch wenn der Bot fehlt', async () => {
  // Ein 404 waere hier irrefuehrend: Die Frage wurde ja beantwortet.
  // Die Oberflaeche soll den Hinweis anzeigen, keinen Fehler.
  const res = await hole('/api/guilds/gibtsnicht/bot-status');
  assert.equal(res.status, 200);
});
