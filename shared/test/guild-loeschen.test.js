import { test } from 'node:test';
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';
import { ensureSchema } from '../src/schema.js';
import { createPluginStore } from '../src/plugin-store.js';
import { tabellenMitGuildId, zaehleDaten, loescheGuild } from '../src/guild-loeschen.js';

/**
 * Das Loeschen aller Daten eines Servers.
 *
 * Zwei Dinge duerfen hier nicht schiefgehen: Es muss **alles** erwischen -
 * eine vergessene Tabelle waere genau die, in der Daten zurueckbleiben - und
 * es darf **nur** den genannten Server treffen.
 */

function vorbereiten() {
  const db = new Database(':memory:');
  ensureSchema(db);
  return db;
}

/** Legt fuer zwei Server je einen Eintrag in mehreren Tabellen an. */
function fuelle(db) {
  db.prepare(
    "INSERT INTO guild_settings (guild_id, settings_json, updated_at) VALUES (?, '{}', 0)",
  ).run('a');
  db.prepare(
    "INSERT INTO guild_settings (guild_id, settings_json, updated_at) VALUES (?, '{}', 0)",
  ).run('b');

  const verstoss = db.prepare(
    'INSERT INTO infractions (guild_id, user_id, moderator, rule, action, created_at) VALUES (?,?,?,?,?,?)',
  );
  verstoss.run('a', 'u1', 'm', 'spam', 'warn', 0);
  verstoss.run('a', 'u2', 'm', 'spam', 'warn', 0);
  verstoss.run('b', 'u3', 'm', 'spam', 'warn', 0);

  const audit = db.prepare(
    'INSERT INTO audit_log (guild_id, actor_id, action, created_at) VALUES (?,?,?,?)',
  );
  audit.run('a', 'x', 'test', 0);
  audit.run('b', 'x', 'test', 0);
}

const zaehle = (db, tabelle, guildId) =>
  db.prepare(`SELECT COUNT(*) AS n FROM ${tabelle} WHERE guild_id = ?`).get(guildId).n;

// --- Welche Tabellen werden erfasst? --------------------------------------

test('Alle Tabellen mit guild_id werden gefunden', () => {
  const db = vorbereiten();
  const tabellen = tabellenMitGuildId(db);

  // Stichproben aus allen Bereichen - keine davon darf fehlen.
  for (const erwartet of [
    'guild_settings',
    'infractions',
    'scheduled_posts',
    'youtube_feeds',
    'reaction_role_panels',
    'tickets',
    'polls',
    'interest_groups',
    'custom_commands',
    'message_log',
    'audit_log',
  ]) {
    assert.ok(tabellen.includes(erwartet), `${erwartet} wurde nicht gefunden`);
  }
  db.close();
});

test('Tabellen ohne guild_id bleiben unberührt', () => {
  const db = vorbereiten();
  const tabellen = tabellenMitGuildId(db);
  for (const name of tabellen) {
    const spalten = db.prepare(`PRAGMA table_info(${name})`).all().map((c) => c.name);
    assert.ok(spalten.includes('guild_id'), `${name} hat gar keine guild_id`);
  }
  db.close();
});

test('Plugin-Tabellen werden automatisch mit erfasst', () => {
  // Der wichtigste Fall: Ein Plugin, das es beim Schreiben dieses Codes noch
  // nicht gab, darf keine Datenreste hinterlassen.
  const db = vorbereiten();
  createPluginStore(db, {
    name: 'testplugin',
    label: 'Test',
    ui: {
      sections: [
        { type: 'form', fields: [{ key: 'wert', label: 'Wert', type: 'text' }] },
        { type: 'list', key: 'dinge', fields: [{ key: 'titel', label: 'T', type: 'text' }] },
      ],
    },
  });

  const tabellen = tabellenMitGuildId(db);
  assert.ok(tabellen.includes('plugin_testplugin_config'), 'Plugin-Einstellungen fehlen');
  assert.ok(tabellen.includes('plugin_testplugin_dinge'), 'Plugin-Liste fehlt');
  db.close();
});

// --- Zaehlen --------------------------------------------------------------

test('Vor dem Löschen lässt sich zählen, was betroffen ist', () => {
  const db = vorbereiten();
  fuelle(db);

  const { tabellen, gesamt } = zaehleDaten(db, 'a');
  assert.equal(tabellen.infractions, 2);
  assert.equal(tabellen.guild_settings, 1);
  assert.equal(tabellen.audit_log, 1);
  assert.equal(gesamt, 4);
  db.close();
});

test('Leere Tabellen tauchen in der Zählung nicht auf', () => {
  // Sonst stünde eine Liste voller Nullen in der Rückfrage.
  const db = vorbereiten();
  fuelle(db);
  const { tabellen } = zaehleDaten(db, 'a');
  for (const [name, n] of Object.entries(tabellen)) {
    assert.ok(n > 0, `${name} steht mit ${n} in der Liste`);
  }
  db.close();
});

test('Ein unbekannter Server hat nichts zu löschen', () => {
  const db = vorbereiten();
  fuelle(db);
  assert.equal(zaehleDaten(db, 'gibtsnicht').gesamt, 0);
  db.close();
});

// --- Löschen --------------------------------------------------------------

test('Alle Daten eines Servers verschwinden', () => {
  const db = vorbereiten();
  fuelle(db);

  const { gesamt } = loescheGuild(db, 'a');
  assert.equal(gesamt, 4);

  assert.equal(zaehle(db, 'guild_settings', 'a'), 0);
  assert.equal(zaehle(db, 'infractions', 'a'), 0);
  assert.equal(zaehle(db, 'audit_log', 'a'), 0);
  db.close();
});

test('Andere Server bleiben vollständig erhalten', () => {
  // Der gefährlichste Fehler wäre, zu viel zu löschen.
  const db = vorbereiten();
  fuelle(db);

  loescheGuild(db, 'a');

  assert.equal(zaehle(db, 'guild_settings', 'b'), 1);
  assert.equal(zaehle(db, 'infractions', 'b'), 1);
  assert.equal(zaehle(db, 'audit_log', 'b'), 1);
  db.close();
});

test('Auch Plugin-Daten verschwinden', () => {
  const db = vorbereiten();
  const store = createPluginStore(db, {
    name: 'testplugin',
    label: 'Test',
    ui: {
      sections: [
        { type: 'form', fields: [{ key: 'wert', label: 'W', type: 'text' }] },
        { type: 'list', key: 'dinge', fields: [{ key: 'titel', label: 'T', type: 'text' }] },
      ],
    },
  });

  store.saveConfig('a', { wert: 'geheim' });
  store.addItem('a', 'dinge', { titel: 'Eintrag A' });
  store.saveConfig('b', { wert: 'bleibt' });
  store.addItem('b', 'dinge', { titel: 'Eintrag B' });

  loescheGuild(db, 'a');

  assert.equal(store.listItems('a', 'dinge').length, 0, 'Plugin-Liste nicht geleert');
  assert.equal(zaehle(db, 'plugin_testplugin_config', 'a'), 0, 'Plugin-Einstellungen geblieben');

  assert.equal(store.listItems('b', 'dinge').length, 1, 'fremdes Plugin-Datum gelöscht');
  db.close();
});

test('Der Bericht nennt, was wo entfernt wurde', () => {
  const db = vorbereiten();
  fuelle(db);

  const bericht = loescheGuild(db, 'a');
  assert.equal(bericht.tabellen.infractions, 2);
  assert.ok(bericht.geprueft > 10, 'es müssen alle Tabellen geprüft worden sein');
  db.close();
});

test('Löschen ohne Daten ist kein Fehler', () => {
  const db = vorbereiten();
  fuelle(db);
  const bericht = loescheGuild(db, 'gibtsnicht');
  assert.equal(bericht.gesamt, 0);
  // Und nichts anderes wurde angefasst.
  assert.equal(zaehle(db, 'guild_settings', 'a'), 1);
  db.close();
});

test('Ohne Server-ID wird nichts gelöscht', () => {
  // Ein leerer Wert dürfte niemals als "alle" durchgehen.
  const db = vorbereiten();
  fuelle(db);

  for (const leer of ['', '   ', null, undefined]) {
    assert.throws(() => loescheGuild(db, leer), /guild_id/);
  }
  assert.equal(zaehle(db, 'guild_settings', 'a'), 1, 'nichts darf verschwunden sein');
  db.close();
});

test('Zweimal löschen schadet nicht', () => {
  const db = vorbereiten();
  fuelle(db);

  loescheGuild(db, 'a');
  const zweiter = loescheGuild(db, 'a');
  assert.equal(zweiter.gesamt, 0);
  db.close();
});

test('Nach dem Löschen zählt die Prüfung null', () => {
  const db = vorbereiten();
  fuelle(db);
  loescheGuild(db, 'a');
  assert.equal(zaehleDaten(db, 'a').gesamt, 0);
  db.close();
});
