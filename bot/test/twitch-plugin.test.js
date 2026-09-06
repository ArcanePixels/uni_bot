import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import Database from 'better-sqlite3';
import { createPluginStore } from '@allrounder/shared/plugin-store';
import { formatText, buildEmbed, parseColor, schonGemeldet } from '../../plugins/twitch/bot.js';

/**
 * Das Twitch-Plugin.
 *
 * Schwerpunkt: **nie doppelt melden.** Webhook und Abfrage laufen gleichzeitig
 * und koennen dieselbe Sendung sehen - ohne Absicherung gaebe es zwei
 * Meldungen mit Ping. Dagegen steht die Stream-ID, die Twitch je Sendung
 * vergibt, plus eine Sperrzeit.
 */

const MANIFEST = JSON.parse(
  readFileSync(new URL('../../plugins/twitch/plugin.json', import.meta.url), 'utf8'),
);

const STREAM = {
  id: '4711',
  login: 'gronkh',
  name: 'Gronkh',
  title: 'Wir zocken Elden Ring',
  game: 'Elden Ring',
  viewers: 4200,
  startedAt: '2026-08-24T18:00:00Z',
  thumbnail: 'https://cdn/prev-640x360.jpg',
  url: 'https://twitch.tv/gronkh',
};

// --- Doppelte Meldungen ---------------------------------------------------

test('Dieselbe Sendung wird nur einmal gemeldet', () => {
  // Der Kernfall: Webhook meldet, kurz darauf sieht die Abfrage denselben
  // Stream. Ohne diese Pruefung gaebe es zwei Meldungen mit Ping.
  const merk = { gronkh: { streamId: '4711', zeit: Date.now() } };
  assert.equal(schonGemeldet(merk, 'gronkh', '4711', 60), true);
});

test('Eine neue Sendung nach Ablauf der Sperre wird gemeldet', () => {
  const vorGestern = Date.now() - 48 * 60 * 60_000;
  const merk = { gronkh: { streamId: 'alt', zeit: vorGestern } };
  assert.equal(schonGemeldet(merk, 'gronkh', 'neu', 60), false);
});

test('Ein kurzer Verbindungsabbruch loest keine zweite Meldung aus', () => {
  // Nach einem Abbruch vergibt Twitch eine neue Stream-ID. Ohne Sperrzeit
  // gaebe es dann eine zweite Meldung mit Ping.
  const vorZehnMinuten = Date.now() - 10 * 60_000;
  const merk = { gronkh: { streamId: 'alt', zeit: vorZehnMinuten } };
  assert.equal(schonGemeldet(merk, 'gronkh', 'neu-nach-abbruch', 60), true, 'Sperre greift');
});

test('Sperrzeit 0 schaltet die Sperre ab', () => {
  const merk = { gronkh: { streamId: 'alt', zeit: Date.now() } };
  assert.equal(schonGemeldet(merk, 'gronkh', 'neu', 0), false);
  // Dieselbe Sendung bleibt trotzdem gesperrt - sonst haette man Dauerfeuer.
  assert.equal(schonGemeldet(merk, 'gronkh', 'alt', 0), true);
});

test('Ein unbekannter Kanal gilt als nicht gemeldet', () => {
  assert.equal(schonGemeldet({}, 'neuer', '1', 60), false);
  assert.equal(schonGemeldet(undefined, 'neuer', '1', 60), false);
});

test('Andere Kanaele sperren sich nicht gegenseitig', () => {
  const merk = { gronkh: { streamId: '1', zeit: Date.now() } };
  assert.equal(schonGemeldet(merk, 'papaplatte', '2', 60), false);
});

test('Eine unsinnige Sperrzeit sperrt nicht dauerhaft', () => {
  // Sonst waere nach einem Tippfehler nie wieder eine Meldung moeglich.
  const merk = { gronkh: { streamId: 'alt', zeit: Date.now() } };
  for (const wert of [null, undefined, 'viel', NaN]) {
    assert.equal(schonGemeldet(merk, 'gronkh', 'neu', wert), false, `${wert}`);
  }
});

// --- Nachrichtentext ------------------------------------------------------

test('Platzhalter werden ersetzt', () => {
  assert.equal(formatText('{name} spielt {game}!', STREAM), 'Gronkh spielt Elden Ring!');
  assert.equal(formatText('{title}', STREAM), 'Wir zocken Elden Ring');
  assert.equal(formatText('{url}', STREAM), 'https://twitch.tv/gronkh');
});

test('Ein Platzhalter kommt auch mehrfach durch', () => {
  assert.equal(formatText('{name} — ja, {name}!', STREAM), 'Gronkh — ja, Gronkh!');
});

test('Fehlende Angaben ergeben keinen kaputten Text', () => {
  const ohne = { login: 'wer', name: 'Wer', title: '', game: '' };
  assert.equal(formatText('{name} spielt {game}', ohne), 'Wer spielt etwas');
  assert.equal(formatText(undefined, STREAM), 'Gronkh ist jetzt live!', 'Standardtext');
});

// --- Farbe ----------------------------------------------------------------

test('Die Farbe faellt auf Twitch-Lila zurueck', () => {
  assert.equal(parseColor('#9146ff'), 0x9146ff);
  assert.equal(parseColor('ff0000'), 0xff0000);
  for (const v of ['lila', '', null, undefined, '#12345']) {
    assert.equal(parseColor(v), 0x9146ff, `"${v}"`);
  }
});

// --- Die Nachricht --------------------------------------------------------

test('Die Meldung enthaelt alles Wichtige', () => {
  const d = buildEmbed(STREAM, { color: '#9146ff', zeige_vorschau: 1 }).toJSON();
  assert.equal(d.title, 'Wir zocken Elden Ring');
  assert.equal(d.url, 'https://twitch.tv/gronkh');
  assert.equal(d.author.name, 'Gronkh');
  assert.equal(d.color, 0x9146ff);

  const felder = Object.fromEntries(d.fields.map((f) => [f.name, f.value]));
  assert.equal(felder.Spiel, 'Elden Ring');
  assert.equal(felder.Zuschauer, '4200');
});

test('Das Vorschaubild laesst sich abschalten', () => {
  assert.ok(buildEmbed(STREAM, { zeige_vorschau: 1 }).toJSON().image, 'an');
  assert.equal(buildEmbed(STREAM, { zeige_vorschau: 0 }).toJSON().image, undefined, 'aus');
});

test('Das Vorschaubild bekommt einen Zeitstempel', () => {
  // Twitch liefert dieselbe Adresse fuer die ganze Sendung. Ohne Zeitstempel
  // zeigte Discord bei einer spaeteren Meldung das alte Bild aus dem Cache.
  const bild = buildEmbed(STREAM, { zeige_vorschau: 1 }).toJSON().image.url;
  assert.match(bild, /\?t=\d+/);
});

test('Ein eigener Hinweis erscheint in der Meldung', () => {
  const d = buildEmbed(STREAM, {}, 'Unser Streamer ist da!').toJSON();
  assert.equal(d.description, 'Unser Streamer ist da!');
});

test('Ohne Titel steht trotzdem etwas Sinnvolles da', () => {
  const d = buildEmbed({ ...STREAM, title: '' }, {}).toJSON();
  assert.equal(d.title, 'Gronkh ist live');
});

test('Fehlende Angaben ergeben keine leeren Felder', () => {
  // Discord weist ein Feld mit leerem Wert ab.
  const d = buildEmbed({ login: 'x', name: 'X', url: 'https://twitch.tv/x' }, {}).toJSON();
  for (const f of d.fields ?? []) {
    assert.ok(f.value.length > 0, `Feld "${f.name}" waere leer`);
  }
});

// --- Gegen das echte Manifest --------------------------------------------

test('Das Manifest ergibt einen benutzbaren Speicher', () => {
  const db = new Database(':memory:');
  const store = createPluginStore(db, MANIFEST);

  const tabellen = db
    .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name LIKE 'plugin_twitch%'")
    .all()
    .map((t) => t.name);
  assert.ok(tabellen.includes('plugin_twitch_config'));
  assert.ok(tabellen.includes('plugin_twitch_kanaele'));

  // Die Standardwerte muessen sinnvoll sein.
  const cfg = store.getConfig('g1');
  assert.equal(cfg.cooldown_min, 60);
  assert.equal(cfg.color, '#9146ff');
  assert.match(cfg.text, /\{name\}/);

  // Ein Kanal braucht einen Namen.
  assert.ok(store.addItem('g1', 'kanaele', { login: 'gronkh' }).ok);
  assert.ok(store.addItem('g1', 'kanaele', {}).error, 'ohne Namen darf nicht gehen');

  db.close();
});

test('Der Kanal fordert alle noetigen Rechte', () => {
  // Ohne Nachrichtenverlauf faende der Bot seine eigenen Nachrichten nicht,
  // ohne Links einbetten kaeme kein Embed durch.
  const feld = MANIFEST.ui.sections
    .flatMap((s) => s.fields ?? [])
    .find((f) => f.type === 'channel');
  for (const recht of ['VIEW_CHANNEL', 'SEND_MESSAGES', 'EMBED_LINKS']) {
    assert.ok(feld.requiresPermissions.includes(recht), `${recht} fehlt`);
  }
});

test('Server sehen einander nicht', () => {
  const db = new Database(':memory:');
  const store = createPluginStore(db, MANIFEST);

  store.addItem('a', 'kanaele', { login: 'nur_bei_a' });
  store.addItem('b', 'kanaele', { login: 'nur_bei_b' });

  assert.deepEqual(store.listItems('a', 'kanaele').map((k) => k.login), ['nur_bei_a']);
  assert.deepEqual(store.listItems('b', 'kanaele').map((k) => k.login), ['nur_bei_b']);

  // Auch der Merkzettel ist getrennt - sonst wuerde eine Meldung auf Server A
  // die auf Server B unterdruecken.
  store.setState('a', { gemeldet: { x: { streamId: '1', zeit: Date.now() } } });
  assert.deepEqual(store.getState('b'), {});

  db.close();
});
