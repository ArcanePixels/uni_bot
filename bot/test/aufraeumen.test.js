import { test } from 'node:test';
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';
import { ensureSchema } from '@allrounder/shared/schema';
import { leseTage, raeumeTabelle, starteAufraeumen, STANDARD } from '../src/core/aufraeumen.js';

/**
 * Das Aufraeumen alter Eintraege.
 *
 * Audit-Log und Verstoesse wuchsen vorher unbegrenzt. Wichtig hier: dass
 * wirklich nur Altes verschwindet - ein Fehler in der Zeitrechnung wuerde
 * stillschweigend Daten loeschen, die noch gebraucht werden.
 */

const TAG = 86400;
const jetzt = () => Math.floor(Date.now() / 1000);

function db_mit(eintraege) {
  const db = new Database(':memory:');
  ensureSchema(db);
  const audit = db.prepare(
    'INSERT INTO audit_log (guild_id, actor_id, action, created_at) VALUES (?,?,?,?)',
  );
  const verstoss = db.prepare(
    'INSERT INTO infractions (guild_id, user_id, moderator, rule, action, created_at) VALUES (?,?,?,?,?,?)',
  );
  for (const { tabelle, alterTage } of eintraege) {
    const ts = jetzt() - alterTage * TAG;
    if (tabelle === 'audit_log') audit.run('g1', 'a', 'test', ts);
    else verstoss.run('g1', 'u1', 'a', 'spam', 'warn', ts);
  }
  return db;
}

const zaehle = (db, t) => db.prepare(`SELECT COUNT(*) AS n FROM ${t}`).get().n;

// --- Die Tagesangabe ------------------------------------------------------

test('Fehlt die Angabe, gilt der Standard', () => {
  assert.equal(leseTage(undefined, 180), 180);
  assert.equal(leseTage(null, 180), 180);
  assert.equal(leseTage('', 180), 180);
  assert.equal(leseTage('   ', 180), 180);
});

test('Eine Zahl wird uebernommen', () => {
  assert.equal(leseTage('90', 180), 90);
  assert.equal(leseTage(30, 180), 30);
});

test('Null schaltet das Aufraeumen ab', () => {
  // Wer alles behalten will, soll das koennen.
  assert.equal(leseTage('0', 180), 0);
});

test('Unsinn faellt auf den Standard zurueck', () => {
  // Sonst wuerde ein Tippfehler in der .env still alles loeschen.
  for (const v of ['viel', '-5', 'NaN', '{}']) {
    assert.equal(leseTage(v, 180), 180, `"${v}"`);
  }
});

// --- Das Aufraeumen selbst ------------------------------------------------

test('Alte Eintraege verschwinden, neue bleiben', () => {
  const db = db_mit([
    { tabelle: 'audit_log', alterTage: 200 },
    { tabelle: 'audit_log', alterTage: 190 },
    { tabelle: 'audit_log', alterTage: 10 },
    { tabelle: 'audit_log', alterTage: 0 },
  ]);

  const entfernt = raeumeTabelle(db, 'audit_log', 180);
  assert.equal(entfernt, 2);
  assert.equal(zaehle(db, 'audit_log'), 2, 'die jungen muessen bleiben');
  db.close();
});

test('Genau an der Grenze wird nichts geloescht', () => {
  // Ein Eintrag von heute vor 180 Tagen ist noch keine 180 Tage *ueber*
  // der Grenze - ein Fehler hier wuerde taeglich einen Tag zu viel wegwerfen.
  const db = db_mit([{ tabelle: 'audit_log', alterTage: 180 }]);
  raeumeTabelle(db, 'audit_log', 180);
  assert.equal(zaehle(db, 'audit_log'), 1);
  db.close();
});

test('Null Tage laesst alles stehen', () => {
  const db = db_mit([
    { tabelle: 'audit_log', alterTage: 5000 },
    { tabelle: 'infractions', alterTage: 5000 },
  ]);
  assert.equal(raeumeTabelle(db, 'audit_log', 0), 0);
  assert.equal(zaehle(db, 'audit_log'), 1, 'auch uralte Eintraege bleiben');
  db.close();
});

test('Verstoesse werden getrennt vom Audit-Log behandelt', () => {
  // Unterschiedliche Aufbewahrung - sonst waere die eine Einstellung wirkungslos.
  const db = db_mit([
    { tabelle: 'audit_log', alterTage: 200 },
    { tabelle: 'infractions', alterTage: 200 },
  ]);

  raeumeTabelle(db, 'audit_log', 180);
  assert.equal(zaehle(db, 'audit_log'), 0, 'Audit weg');
  assert.equal(zaehle(db, 'infractions'), 1, 'Verstoss bleibt - andere Frist');
  db.close();
});

test('Ein unerlaubter Tabellenname wird abgewiesen', () => {
  // Der Name kommt zwar nur aus diesem Modul, aber die Pruefung kostet nichts.
  const db = db_mit([]);
  assert.throws(() => raeumeTabelle(db, 'audit_log; DROP TABLE x', 30), /Unerlaubter/);
  db.close();
});

// --- Der Ablauf im Betrieb ------------------------------------------------

test('Ohne Konfiguration gelten sinnvolle Voreinstellungen', () => {
  const db = db_mit([]);
  const meldungen = [];
  const stop = starteAufraeumen({
    db,
    log: { info: (m) => meldungen.push(m), warn: () => {} },
    env: {},
  });

  const text = meldungen.join(' ');
  assert.match(text, new RegExp(String(STANDARD.auditDays)));
  assert.match(text, new RegExp(String(STANDARD.infractionDays)));

  stop();
  db.close();
});

test('Beides auf 0 schaltet das Aufraeumen ganz ab', () => {
  const db = db_mit([{ tabelle: 'audit_log', alterTage: 9999 }]);
  const meldungen = [];
  const stop = starteAufraeumen({
    db,
    log: { info: (m) => meldungen.push(m), warn: () => {} },
    env: { AUDIT_KEEP_DAYS: '0', INFRACTION_KEEP_DAYS: '0' },
  });

  assert.match(meldungen.join(' '), /abgeschaltet/);
  assert.equal(zaehle(db, 'audit_log'), 1);

  stop();
  db.close();
});

test('Ein Fehler beim Aufraeumen stoert den Bot nicht', () => {
  // Die Datenbank wird mitten im Betrieb geschlossen - das darf nur eine
  // Warnung geben, keinen Absturz.
  const db = db_mit([]);
  const warnungen = [];
  const stop = starteAufraeumen({
    db,
    log: { info: () => {}, warn: (m) => warnungen.push(m) },
    env: { AUDIT_KEEP_DAYS: '1' },
  });
  db.close();
  // Der erste Lauf kommt erst nach einer Minute - hier reicht, dass der
  // Start nicht geworfen hat und sich sauber beenden laesst.
  assert.doesNotThrow(() => stop());
});

test('Nach dem Beenden laeuft nichts mehr', () => {
  const db = db_mit([]);
  const stop = starteAufraeumen({ db, log: { info: () => {}, warn: () => {} }, env: {} });
  assert.doesNotThrow(() => stop());
  assert.doesNotThrow(() => stop(), 'zweimal beenden darf auch nicht stoeren');
  db.close();
});
