import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import Database from 'better-sqlite3';
import { ensureSchema } from '@allrounder/shared/schema';
import { backupName, selectExpired, createBackup } from '../src/backup.js';

const DAY = 86400_000;

test('backupName baut einen sortierbaren Namen', () => {
  const n = backupName(new Date(2026, 7, 22, 15, 4)); // Monate sind 0-basiert
  assert.equal(n, 'bot-2026-08-22_1504.sqlite');
});

test('backupName füllt einstellige Werte auf', () => {
  const n = backupName(new Date(2026, 0, 5, 9, 7));
  assert.equal(n, 'bot-2026-01-05_0907.sqlite');
});

test('selectExpired behält je Tag nur die jüngste Sicherung', () => {
  const now = new Date('2026-08-22T20:00:00Z');
  const files = [
    { name: 'bot-2026-08-22_0300.sqlite', mtime: now.getTime() - 3600_000 },
    { name: 'bot-2026-08-22_1500.sqlite', mtime: now.getTime() - 600_000 },
    { name: 'bot-2026-08-21_0300.sqlite', mtime: now.getTime() - DAY },
  ];
  const expired = selectExpired(files, 14, now);
  assert.deepEqual(expired, ['bot-2026-08-22_0300.sqlite'], 'die ältere vom selben Tag muss weg');
});

test('selectExpired entfernt Sicherungen jenseits der Aufbewahrung', () => {
  const now = new Date('2026-08-22T12:00:00Z');
  const files = [
    { name: 'bot-2026-08-22_0300.sqlite', mtime: now.getTime() },
    { name: 'bot-2026-08-01_0300.sqlite', mtime: now.getTime() - 21 * DAY },
  ];
  const expired = selectExpired(files, 14, now);
  assert.deepEqual(expired, ['bot-2026-08-01_0300.sqlite']);
});

test('selectExpired löscht nichts, wenn alles jung genug ist', () => {
  const now = new Date('2026-08-22T12:00:00Z');
  const files = [
    { name: 'bot-2026-08-22_0300.sqlite', mtime: now.getTime() },
    { name: 'bot-2026-08-21_0300.sqlite', mtime: now.getTime() - DAY },
    { name: 'bot-2026-08-20_0300.sqlite', mtime: now.getTime() - 2 * DAY },
  ];
  assert.deepEqual(selectExpired(files, 14, now), []);
});

test('selectExpired verkraftet eine leere Liste', () => {
  assert.deepEqual(selectExpired([], 14, new Date()), []);
});

test('Die letzte Sicherung wird nie gelöscht, egal wie alt', () => {
  const now = new Date('2026-08-22T12:00:00Z');
  // Uralt, aber die einzige die es gibt - ohne Schutz staende man ohne Sicherung da.
  const files = [{ name: 'bot-2020-01-01_0300.sqlite', mtime: now.getTime() - 2000 * DAY }];
  assert.deepEqual(selectExpired(files, 14, now), []);
});

test('Von mehreren uralten bleibt die jüngste erhalten', () => {
  const now = new Date('2026-08-22T12:00:00Z');
  const files = [
    { name: 'bot-2020-01-01_0300.sqlite', mtime: now.getTime() - 2000 * DAY },
    { name: 'bot-2020-06-01_0300.sqlite', mtime: now.getTime() - 1800 * DAY },
  ];
  const expired = selectExpired(files, 14, now);
  assert.deepEqual(expired, ['bot-2020-01-01_0300.sqlite'], 'nur die ältere darf weg');
});

test('createBackup erzeugt eine lesbare Kopie mit allen Daten', () => {
  const dir = mkdtempSync(join(tmpdir(), 'allr-backup-'));
  try {
    const dbPath = join(dir, 'quelle.sqlite');
    const db = new Database(dbPath);
    ensureSchema(db);
    db.prepare(
      "INSERT INTO guild_settings (guild_id, settings_json, updated_at) VALUES ('42', '{\"a\":1}', 1)",
    ).run();
    db.prepare(
      `INSERT INTO infractions (guild_id, user_id, moderator, rule, action, created_at)
       VALUES ('42','u1','automod','spam','warn',1)`,
    ).run();
    db.close();

    const targetDir = join(dir, 'sicherungen');
    const res = createBackup({ databasePath: dbPath, targetDir, keepDays: 14 });

    assert.ok(res.file.endsWith('.sqlite'));
    assert.equal(readdirSync(targetDir).length, 1);

    // Die Kopie muss vollständig und lesbar sein.
    const copy = new Database(res.file, { readonly: true });
    const s = copy.prepare("SELECT settings_json FROM guild_settings WHERE guild_id='42'").get();
    const n = copy.prepare('SELECT COUNT(*) AS n FROM infractions').get().n;
    copy.close();
    assert.equal(s.settings_json, '{"a":1}');
    assert.equal(n, 1);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('createBackup legt das Zielverzeichnis an, wenn es fehlt', () => {
  const dir = mkdtempSync(join(tmpdir(), 'allr-backup2-'));
  try {
    const dbPath = join(dir, 'q.sqlite');
    const db = new Database(dbPath);
    ensureSchema(db);
    db.close();

    const targetDir = join(dir, 'gibt', 'es', 'noch', 'nicht');
    const res = createBackup({ databasePath: dbPath, targetDir });
    assert.ok(res.file.includes('nicht'));
    assert.equal(readdirSync(targetDir).length, 1);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('createBackup akzeptiert auch "backupDir" statt "targetDir"', () => {
  // Die Dienst-Konfiguration nutzt "backupDir". Wurde die Umbenennung an einer
  // Aufrufstelle vergessen, scheiterte die automatische Sicherung stillschweigend.
  const dir = mkdtempSync(join(tmpdir(), 'allr-backup4-'));
  try {
    const dbPath = join(dir, 'q.sqlite');
    const db = new Database(dbPath);
    ensureSchema(db);
    db.close();

    const res = createBackup({ databasePath: dbPath, backupDir: join(dir, 'b'), keepDays: 14 });
    assert.ok(res.file.endsWith('.sqlite'));
    assert.equal(readdirSync(join(dir, 'b')).length, 1);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('createBackup meldet ein fehlendes Zielverzeichnis verständlich', () => {
  assert.throws(
    () => createBackup({ databasePath: 'egal.sqlite' }),
    /Kein Zielverzeichnis/,
  );
});

test('Die Quelldatenbank bleibt beim Sichern unverändert', () => {
  const dir = mkdtempSync(join(tmpdir(), 'allr-backup3-'));
  try {
    const dbPath = join(dir, 'q.sqlite');
    const db = new Database(dbPath);
    ensureSchema(db);
    db.prepare("INSERT INTO guild_settings (guild_id, settings_json, updated_at) VALUES ('1','{}',1)").run();
    db.close();

    createBackup({ databasePath: dbPath, targetDir: join(dir, 'b') });

    const after = new Database(dbPath, { readonly: true });
    const n = after.prepare('SELECT COUNT(*) AS n FROM guild_settings').get().n;
    after.close();
    assert.equal(n, 1, 'die Quelle darf nicht angetastet werden');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
