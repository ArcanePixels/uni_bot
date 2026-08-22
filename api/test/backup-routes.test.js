import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import Database from 'better-sqlite3';
import { ensureSchema } from '@allrounder/shared/schema';
import { createApp } from '../src/app.js';

const TOKEN = 'backup-test-token';
let server, base, dir, db;

before(async () => {
  dir = mkdtempSync(join(tmpdir(), 'allr-broutes-'));
  const databasePath = join(dir, 'bot.sqlite');
  db = new Database(databasePath);
  ensureSchema(db);
  db.prepare("INSERT INTO guild_settings (guild_id, settings_json, updated_at) VALUES ('1','{}',1)").run();

  server = createApp(db, TOKEN, null, {
    databasePath,
    backupDir: join(dir, 'backups'),
    keepDays: 14,
    ownerIds: ['owner-1'],
  }).listen(0);
  await new Promise((r) => server.once('listening', r));
  base = `http://127.0.0.1:${server.address().port}`;
});

after(() => {
  server.close();
  db.close();
  rmSync(dir, { recursive: true, force: true });
});

const auth = () => ({ Authorization: `Bearer ${TOKEN}` });
const OWNER = 'owner-1';

test('Sicherungen sind ohne Token nicht erreichbar', async () => {
  assert.equal((await fetch(`${base}/api/system/backups`)).status, 401);
  assert.equal((await fetch(`${base}/api/system/backups`, { method: 'POST' })).status, 401);
});

test('Übersicht ist zunächst leer', async () => {
  const res = await fetch(`${base}/api/system/backups?actorId=${OWNER}`, { headers: auth() });
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.deepEqual(body.backups, []);
  assert.equal(body.keepDays, 14);
});

test('Sicherung lässt sich von Hand auslösen', async () => {
  const res = await fetch(`${base}/api/system/backups`, {
    method: 'POST',
    headers: { ...auth(), 'Content-Type': 'application/json' },
    body: JSON.stringify({ actorId: OWNER }),
  });
  assert.equal(res.status, 201);
  const body = await res.json();
  assert.match(body.file, /^bot-[\d-]+_\d{4}\.sqlite$/);
  assert.equal(body.backups.length, 1);
  assert.ok(body.backups[0].size > 0, 'die Datei darf nicht leer sein');
});

test('Herunterladen liefert eine gültige Datenbank', async () => {
  const list = await (
    await fetch(`${base}/api/system/backups?actorId=${OWNER}`, { headers: auth() })
  ).json();
  const name = list.backups[0].name;

  const res = await fetch(`${base}/api/system/backups/${name}?actorId=${OWNER}`, {
    headers: auth(),
  });
  assert.equal(res.status, 200);
  assert.match(res.headers.get('content-disposition'), /attachment/);

  const buf = Buffer.from(await res.arrayBuffer());
  // SQLite-Dateien beginnen mit dieser Kennung.
  assert.equal(buf.subarray(0, 15).toString(), 'SQLite format 3');
});

test('Pfad-Ausbruch beim Download wird verhindert', async () => {
  for (const evil of ['..%2F..%2Fetc%2Fpasswd', '....//bot.sqlite', 'bot.sqlite']) {
    const res = await fetch(`${base}/api/system/backups/${evil}?actorId=${OWNER}`, {
      headers: auth(),
    });
    assert.ok(
      res.status === 400 || res.status === 404,
      `"${evil}" hätte abgewiesen werden müssen, kam aber mit ${res.status}`,
    );
  }
});

test('Unbekannte Sicherung gibt 404', async () => {
  const res = await fetch(`${base}/api/system/backups/bot-2020-01-01_0300.sqlite?actorId=${OWNER}`, {
    headers: auth(),
  });
  assert.equal(res.status, 404);
});

// --- Zugriffsbeschraenkung -------------------------------------------------

test('Ein fremder Admin kommt nicht an die Sicherungen', async () => {
  // Eine Sicherung enthaelt die Daten ALLER Server - wer auf irgendeinem
  // Server Admin ist, duerfte sie sonst herunterladen.
  for (const fremd of ['fremder-admin', '', 'owner-2']) {
    const res = await fetch(`${base}/api/system/backups?actorId=${fremd}`, { headers: auth() });
    assert.equal(res.status, 403, `"${fremd}" haette abgewiesen werden muessen`);
  }
});

test('Ein fremder Admin kann keine Sicherung ausloesen', async () => {
  const res = await fetch(`${base}/api/system/backups`, {
    method: 'POST',
    headers: { ...auth(), 'Content-Type': 'application/json' },
    body: JSON.stringify({ actorId: 'fremder-admin' }),
  });
  assert.equal(res.status, 403);
});

test('Ein fremder Admin kann keine Sicherung herunterladen', async () => {
  const list = await (
    await fetch(`${base}/api/system/backups?actorId=${OWNER}`, { headers: auth() })
  ).json();
  const name = list.backups[0]?.name ?? 'bot-2026-01-01_0300.sqlite';
  const res = await fetch(`${base}/api/system/backups/${name}?actorId=fremder`, {
    headers: auth(),
  });
  assert.equal(res.status, 403, 'der Download war nicht geschuetzt');
});

test('Ohne OWNER_IDS ist der Bereich fuer niemanden offen', async () => {
  const db2 = new Database(':memory:');
  ensureSchema(db2);
  const srv = createApp(db2, TOKEN, null, {
    databasePath: ':memory:',
    backupDir: join(dir, 'leer'),
    keepDays: 14,
    ownerIds: [],
  }).listen(0);
  await new Promise((r) => srv.once('listening', r));
  const b2 = `http://127.0.0.1:${srv.address().port}`;

  const res = await fetch(`${b2}/api/system/backups?actorId=irgendwer`, { headers: auth() });
  assert.equal(res.status, 403);
  assert.match((await res.json()).error, /OWNER_IDS/);

  srv.close();
  db2.close();
});
