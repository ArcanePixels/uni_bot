import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import Database from 'better-sqlite3';
import { ensureSchema } from '../src/schema.js';
import { createPluginStore } from '../src/plugin-store.js';
import { SettingsStore } from '../src/settings.js';

/**
 * Ein Update darf niemals Einstellungen ueberschreiben oder loeschen.
 *
 * Das ist die Zusage, auf die sich jeder verlaesst, der den Bot betreibt -
 * und die schwerste, wenn sie bricht: Einstellungen sind muehsam
 * zusammengeklickt, und wer sie verliert, merkt es oft erst Tage spaeter.
 *
 * Jeder Start ruft `ensureSchema` auf. Diese Tests stellen sicher, dass das
 * nur ergaenzt, nie ersetzt.
 */

/** Stellt einen Neustart nach einem Update nach. */
const neustart = (db) => ensureSchema(db);

test('Einstellungen überleben einen Neustart', () => {
  const db = new Database(':memory:');
  ensureSchema(db);

  const store = new SettingsStore(db);
  store.set('g1', { automod: { enabled: true, logChannelId: 'c123' } });

  neustart(db);

  const nachher = store.get('g1');
  assert.equal(nachher.automod.enabled, true);
  assert.equal(nachher.automod.logChannelId, 'c123');
  db.close();
});

test('Auch mehrere Neustarts hintereinander ändern nichts', () => {
  // Bei haeufigen Updates laeuft das oft nacheinander.
  const db = new Database(':memory:');
  ensureSchema(db);
  new SettingsStore(db).set('g1', { automod: { enabled: true } });

  for (let i = 0; i < 5; i++) neustart(db);

  assert.equal(new SettingsStore(db).get('g1').automod.enabled, true);
  db.close();
});

test('Daten aller Server bleiben erhalten', () => {
  // Der Fall, der beim Weitergeben zaehlt: Ein Update darf nicht die
  // Einstellungen fremder Server treffen.
  const db = new Database(':memory:');
  ensureSchema(db);

  const store = new SettingsStore(db);
  store.set('meiner', { automod: { enabled: true } });
  store.set('fremder', { automod: { enabled: false }, welcome: { enabled: true } });

  neustart(db);

  assert.equal(store.get('meiner').automod.enabled, true);
  assert.equal(store.get('fremder').welcome.enabled, true);
  assert.equal(store.get('fremder').automod.enabled, false);
  db.close();
});

test('Verstöße, Posts und Panels bleiben stehen', () => {
  const db = new Database(':memory:');
  ensureSchema(db);

  db.prepare(
    'INSERT INTO infractions (guild_id, user_id, moderator, rule, action, created_at) VALUES (?,?,?,?,?,?)',
  ).run('g1', 'u1', 'm', 'spam', 'warn', 100);
  db.prepare(
    'INSERT INTO scheduled_posts (guild_id, channel_id, content, cron, enabled, created_at) VALUES (?,?,?,?,?,?)',
  ).run('g1', 'c1', 'Text', '0 9 * * *', 1, 100);

  neustart(db);

  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM infractions').get().n, 1);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM scheduled_posts').get().n, 1);
  db.close();
});

// --- Plugins --------------------------------------------------------------

const MANIFEST = {
  name: 'demo',
  label: 'Demo',
  ui: {
    sections: [
      { type: 'form', fields: [{ key: 'titel', label: 'Titel', type: 'text' }] },
      { type: 'list', key: 'dinge', fields: [{ key: 'text', label: 'Text', type: 'text' }] },
    ],
  },
};

test('Plugin-Einstellungen überleben einen Neustart', () => {
  const db = new Database(':memory:');
  ensureSchema(db);

  const store = createPluginStore(db, MANIFEST);
  store.saveConfig('g1', { titel: 'Meine Regeln' });
  store.addItem('g1', 'dinge', { text: 'Erster Eintrag' });

  // Neustart: Schema und Plugin-Speicher werden neu aufgebaut.
  neustart(db);
  const nachher = createPluginStore(db, MANIFEST);

  assert.equal(nachher.getConfig('g1').titel, 'Meine Regeln');
  assert.equal(nachher.listItems('g1', 'dinge').length, 1);
  assert.equal(nachher.listItems('g1', 'dinge')[0].text, 'Erster Eintrag');
  db.close();
});

test('Ein neues Feld im Plugin löscht die alten Werte nicht', () => {
  // Der heikelste Fall: Ein Update bringt ein Plugin mit zusaetzlichem Feld.
  // Die Spalte muss dazukommen, ohne dass die Tabelle neu angelegt wird.
  const db = new Database(':memory:');
  ensureSchema(db);

  const alt = createPluginStore(db, MANIFEST);
  alt.saveConfig('g1', { titel: 'Bleibt erhalten' });
  alt.addItem('g1', 'dinge', { text: 'Auch das' });

  const erweitert = {
    ...MANIFEST,
    ui: {
      sections: [
        {
          type: 'form',
          fields: [
            { key: 'titel', label: 'Titel', type: 'text' },
            { key: 'farbe', label: 'Farbe', type: 'color', default: '#000000' },
          ],
        },
        {
          type: 'list',
          key: 'dinge',
          fields: [
            { key: 'text', label: 'Text', type: 'text' },
            { key: 'symbol', label: 'Symbol', type: 'emoji' },
          ],
        },
      ],
    },
  };

  const neu = createPluginStore(db, erweitert);

  assert.equal(neu.getConfig('g1').titel, 'Bleibt erhalten', 'alter Wert verloren');
  assert.equal(neu.getConfig('g1').farbe, '#000000', 'neues Feld ohne Standard');
  assert.equal(neu.listItems('g1', 'dinge')[0].text, 'Auch das');
  assert.equal(neu.listItems('g1', 'dinge')[0].symbol, null, 'neue Spalte ist leer, nicht kaputt');
  db.close();
});

test('Der Merkzettel eines Plugins bleibt erhalten', () => {
  // Darin steht z. B. die ID der geposteten Regel-Nachricht. Ginge sie
  // verloren, poste der Bot beim naechsten Mal eine zweite Nachricht.
  const db = new Database(':memory:');
  ensureSchema(db);

  const store = createPluginStore(db, MANIFEST);
  store.setState('g1', { messageId: '999' });

  neustart(db);
  assert.equal(createPluginStore(db, MANIFEST).getState('g1').messageId, '999');
  db.close();
});

// --- Das Schema selbst ----------------------------------------------------

test('Das Schema enthält keine löschenden Befehle', () => {
  // Ein DROP oder DELETE im Schema wuerde bei jedem Start zuschlagen.
  // Deshalb hier gegen den Quelltext geprueft, nicht gegen das Verhalten.
  const quelle = new URL('../src/schema.js', import.meta.url);
  const text = readFileSync(quelle, 'utf8');

  assert.ok(!/\bDROP\s+TABLE\b/i.test(text), 'DROP TABLE im Schema gefunden');
  assert.ok(!/\bTRUNCATE\b/i.test(text), 'TRUNCATE im Schema gefunden');
  assert.ok(!/\bDELETE\s+FROM\b/i.test(text), 'DELETE FROM im Schema gefunden');
});

test('Jede Tabelle wird mit IF NOT EXISTS angelegt', () => {
  // Ohne das wuerde ein Start auf einer bestehenden Datenbank scheitern -
  // oder schlimmer, die Tabelle ersetzen.
  const quelle = new URL('../src/schema.js', import.meta.url);
  const text = readFileSync(quelle, 'utf8');

  const alle = (text.match(/CREATE TABLE/gi) ?? []).length;
  const sicher = (text.match(/CREATE TABLE IF NOT EXISTS/gi) ?? []).length;
  assert.equal(sicher, alle, `${alle - sicher} Tabelle(n) ohne IF NOT EXISTS`);
});
