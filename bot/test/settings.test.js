import { test } from 'node:test';
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';
import { ensureSchema } from '@allrounder/shared/schema';
import { SettingsStore } from '@allrounder/shared/settings';

function freshDb() {
  const db = new Database(':memory:');
  ensureSchema(db);
  return db;
}

test('Unbekannte Guild bekommt die Defaults', () => {
  const store = new SettingsStore(freshDb());
  const s = store.get('42');
  assert.equal(s.automod.enabled, true);
  assert.equal(s.welcome.enabled, false);
});

test('Teil-Update laesst uebrige Defaults stehen', () => {
  const store = new SettingsStore(freshDb());
  store.set('42', { welcome: { enabled: true, channelId: '999' } });
  const s = store.get('42');
  assert.equal(s.welcome.enabled, true);
  assert.equal(s.welcome.channelId, '999');
  // Nicht angefasste Defaults muessen erhalten bleiben.
  assert.equal(s.automod.spam.maxMessages, 5);
  assert.deepEqual(s.welcome.autoroleIds, []);
});

test('Schema laesst sich mehrfach anlegen', () => {
  const db = freshDb();
  assert.doesNotThrow(() => ensureSchema(db));
});

test('invalidate erzwingt Neuladen aus der DB', () => {
  const db = freshDb();
  const a = new SettingsStore(db);
  const b = new SettingsStore(db);
  a.get('42');
  b.set('42', { automod: { enabled: false } });
  a.invalidate();
  assert.equal(a.get('42').automod.enabled, false);
});
