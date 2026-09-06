import { test } from 'node:test';
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';
import { ensureSchema } from '@allrounder/shared/schema';
import { createPluginStore } from '@allrounder/shared/plugin-store';
import {
  durchlauf,
  leseFrist,
  offeneFristen,
  ensureTabelle,
  STANDARD,
} from '../src/core/verwaiste-server.js';

/**
 * Die Schonfrist fuer Server, auf denen der Bot nicht mehr ist.
 *
 * Hier wird am Ende automatisch geloescht, ohne dass jemand zusieht. Die
 * Tests decken deshalb vor allem ab, wann **nicht** geloescht werden darf:
 * waehrend einer Stoerung, bei einem Server der zurueckkehrt, und wenn die
 * Verbindung gerade gar nicht steht.
 */

const STUNDE = 3600_000;

function db_mit(guildIds) {
  const db = new Database(':memory:');
  ensureSchema(db);
  ensureTabelle(db);
  const s = db.prepare(
    "INSERT INTO guild_settings (guild_id, settings_json, updated_at) VALUES (?, '{}', 0)",
  );
  for (const id of guildIds) s.run(id);
  return db;
}

const hatDaten = (db, guildId) =>
  db.prepare('SELECT COUNT(*) AS n FROM guild_settings WHERE guild_id = ?').get(guildId).n > 0;

const stehtUnterFrist = (db, guildId) =>
  db.prepare('SELECT COUNT(*) AS n FROM verwaiste_server WHERE guild_id = ?').get(guildId).n > 0;

// --- Die Frist aus der Umgebung ------------------------------------------

test('Ohne Angabe gilt der Standard von 24 Stunden', () => {
  assert.equal(leseFrist(undefined), STANDARD.fristStunden);
  assert.equal(leseFrist(''), 24);
});

test('Eine eigene Frist wird übernommen', () => {
  assert.equal(leseFrist('48'), 48);
  assert.equal(leseFrist('1.5'), 1.5);
});

test('Null schaltet das automatische Löschen ab', () => {
  assert.equal(leseFrist('0'), 0);
});

test('Unsinn fällt auf den Standard zurück', () => {
  // Sonst würde ein Tippfehler in der .env Daten kosten.
  for (const v of ['bald', '-5', 'NaN']) assert.equal(leseFrist(v), 24, `"${v}"`);
});

// --- Der normale Ablauf ---------------------------------------------------

test('Ein fehlender Server kommt unter Frist, wird aber nicht gelöscht', () => {
  const db = db_mit(['a', 'b']);

  const r = durchlauf({ db, anwesend: new Set(['a']), fristStunden: 24 });

  assert.deepEqual(r.neuVermisst, ['b']);
  assert.deepEqual(r.geloescht, []);
  assert.ok(hatDaten(db, 'b'), 'die Daten müssen noch da sein');
  assert.ok(stehtUnterFrist(db, 'b'));
  db.close();
});

test('Ein anwesender Server kommt nie unter Frist', () => {
  const db = db_mit(['a']);
  durchlauf({ db, anwesend: new Set(['a']), fristStunden: 24 });
  assert.equal(stehtUnterFrist(db, 'a'), false);
  db.close();
});

test('Kehrt der Server zurück, wird die Frist verworfen', () => {
  // Der wichtigste Fall bei einer Störung.
  const db = db_mit(['a']);
  const start = Date.now();

  durchlauf({ db, anwesend: new Set(), fristStunden: 24, jetzt: start });
  assert.ok(stehtUnterFrist(db, 'a'), 'zunächst unter Frist');

  const r = durchlauf({ db, anwesend: new Set(['a']), fristStunden: 24, jetzt: start + 2 * STUNDE });
  assert.deepEqual(r.zurueck, ['a']);
  assert.equal(stehtUnterFrist(db, 'a'), false, 'Frist muss weg sein');
  assert.ok(hatDaten(db, 'a'));
  db.close();
});

test('Nach der Rückkehr beginnt die Frist von vorn', () => {
  // Sonst würde ein Server, der zweimal kurz weg war, zu früh gelöscht.
  const db = db_mit(['a']);
  const t0 = Date.now();

  durchlauf({ db, anwesend: new Set(), fristStunden: 24, jetzt: t0 });
  durchlauf({ db, anwesend: new Set(['a']), fristStunden: 24, jetzt: t0 + 20 * STUNDE });
  durchlauf({ db, anwesend: new Set(), fristStunden: 24, jetzt: t0 + 21 * STUNDE });

  // 21 Stunden nach dem ersten Verschwinden, aber erst 1 Stunde nach dem zweiten.
  const r = durchlauf({ db, anwesend: new Set(), fristStunden: 24, jetzt: t0 + 30 * STUNDE });
  assert.deepEqual(r.geloescht, [], 'die Frist lief erst 9 Stunden');
  assert.ok(hatDaten(db, 'a'));
  db.close();
});

test('Nach Ablauf der Frist wird gelöscht', () => {
  const db = db_mit(['a', 'b']);
  const start = Date.now();

  durchlauf({ db, anwesend: new Set(['a']), fristStunden: 24, jetzt: start });
  const r = durchlauf({
    db,
    anwesend: new Set(['a']),
    fristStunden: 24,
    jetzt: start + 25 * STUNDE,
  });

  assert.equal(r.geloescht.length, 1);
  assert.equal(r.geloescht[0].guildId, 'b');
  assert.equal(hatDaten(db, 'b'), false);
  assert.ok(hatDaten(db, 'a'), 'der anwesende Server bleibt unberührt');
  db.close();
});

test('Kurz vor Ablauf passiert nichts', () => {
  const db = db_mit(['a']);
  const start = Date.now();

  durchlauf({ db, anwesend: new Set(), fristStunden: 24, jetzt: start });
  const r = durchlauf({
    db,
    anwesend: new Set(),
    fristStunden: 24,
    jetzt: start + 23.9 * STUNDE,
  });

  assert.deepEqual(r.geloescht, []);
  assert.ok(hatDaten(db, 'a'));
  db.close();
});

test('Auch Plugin-Daten verschwinden nach Ablauf', () => {
  const db = db_mit(['a']);
  const store = createPluginStore(db, {
    name: 'demo',
    label: 'Demo',
    ui: { sections: [{ type: 'list', key: 'x', fields: [{ key: 't', label: 'T', type: 'text' }] }] },
  });
  store.addItem('a', 'x', { t: 'Eintrag' });

  const start = Date.now();
  durchlauf({ db, anwesend: new Set(), fristStunden: 24, jetzt: start });
  durchlauf({ db, anwesend: new Set(), fristStunden: 24, jetzt: start + 25 * STUNDE });

  assert.equal(store.listItems('a', 'x').length, 0, 'Plugin-Daten sind geblieben');
  db.close();
});

// --- Wann NICHT gelöscht werden darf --------------------------------------

test('Mit Frist 0 wird nie gelöscht', () => {
  const db = db_mit(['a']);
  const start = Date.now();

  durchlauf({ db, anwesend: new Set(), fristStunden: 0, jetzt: start });
  const r = durchlauf({
    db,
    anwesend: new Set(),
    fristStunden: 0,
    jetzt: start + 1000 * STUNDE,
  });

  assert.deepEqual(r.geloescht, []);
  assert.ok(hatDaten(db, 'a'), 'auch nach 1000 Stunden');
  // Vermerkt wird trotzdem - für die Übersicht.
  assert.ok(stehtUnterFrist(db, 'a'));
  db.close();
});

test('Ein anwesender Server wird nie gelöscht, auch mit altem Vermerk', () => {
  // Doppelte Absicherung: Selbst wenn ein alter Eintrag herumliegt, darf ein
  // erreichbarer Server nicht getroffen werden.
  const db = db_mit(['a']);
  const start = Date.now();

  db.prepare(
    'INSERT INTO verwaiste_server (guild_id, vermisst_seit, zuletzt_geprueft) VALUES (?,?,?)',
  ).run('a', Math.floor(start / 1000) - 100 * 3600, Math.floor(start / 1000));

  const r = durchlauf({ db, anwesend: new Set(['a']), fristStunden: 24, jetzt: start });
  assert.deepEqual(r.geloescht, []);
  assert.ok(hatDaten(db, 'a'));
  db.close();
});

test('Server ohne Daten landen gar nicht erst unter Frist', () => {
  // Sonst füllte sich die Tabelle mit Einträgen, zu denen es nichts gibt.
  const db = db_mit([]);
  const r = durchlauf({ db, anwesend: new Set(), fristStunden: 24 });
  assert.deepEqual(r.neuVermisst, []);
  db.close();
});

// --- Die Übersicht --------------------------------------------------------

test('Die Übersicht nennt die verbleibende Zeit', () => {
  const db = db_mit(['a']);
  const start = Date.now();

  durchlauf({ db, anwesend: new Set(), fristStunden: 24, jetzt: start });
  const offen = offeneFristen(db, 24, start + 6 * STUNDE);

  assert.equal(offen.length, 1);
  assert.equal(offen[0].guildId, 'a');
  assert.ok(offen[0].stundenVerbleibend > 17 && offen[0].stundenVerbleibend < 19);
  db.close();
});

test('Bei Frist 0 gibt es keine Restzeit', () => {
  const db = db_mit(['a']);
  durchlauf({ db, anwesend: new Set(), fristStunden: 0 });
  assert.equal(offeneFristen(db, 0)[0].stundenVerbleibend, null);
  db.close();
});

test('Die Restzeit wird nie negativ', () => {
  const db = db_mit(['a']);
  const start = Date.now();
  durchlauf({ db, anwesend: new Set(), fristStunden: 24, jetzt: start });
  assert.equal(offeneFristen(db, 24, start + 100 * STUNDE)[0].stundenVerbleibend, 0);
  db.close();
});
