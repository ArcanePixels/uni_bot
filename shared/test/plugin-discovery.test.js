import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { validateManifest, tableName } from '../src/plugin-manifest.js';
import { discoverPlugins, publicManifests } from '../src/plugin-discovery.js';

/**
 * Das Einlesen der Plugin-Ordner.
 *
 * Wichtigster Punkt: Ein kaputtes Plugin darf niemals den Start verhindern -
 * es wird uebersprungen und der Grund genannt. Wer ein Plugin schreibt, soll
 * am Log ablesen koennen, was fehlt.
 */

/** Legt einen Wegwerf-Ordner mit Plugins an. */
function ordnerMit(plugins) {
  const wurzel = mkdtempSync(join(tmpdir(), 'plugintest-'));
  for (const [name, dateien] of Object.entries(plugins)) {
    const dir = join(wurzel, name);
    mkdirSync(dir, { recursive: true });
    for (const [datei, inhalt] of Object.entries(dateien)) {
      writeFileSync(join(dir, datei), inhalt);
    }
  }
  return wurzel;
}

const gueltig = (name = 'demo', extra = {}) =>
  JSON.stringify({
    name,
    label: 'Demo',
    ui: { sections: [{ type: 'form', fields: [{ key: 'a', label: 'A', type: 'text' }] }] },
    ...extra,
  });

// --- Manifest pruefen -----------------------------------------------------

test('Ein vollstaendiges Manifest wird angenommen', () => {
  const { ok, fehler } = validateManifest(JSON.parse(gueltig()));
  assert.equal(ok, true, fehler.join('; '));
});

test('Ein Manifest ohne Oberflaeche ist erlaubt', () => {
  // Ein reines Bot-Plugin braucht keine Seite im Dashboard.
  assert.equal(validateManifest({ name: 'still', label: 'Still' }).ok, true);
});

test('Alle Probleme kommen auf einmal, nicht nur das erste', () => {
  const { fehler } = validateManifest({
    name: 'GROSS UND FALSCH',
    ui: { sections: [{ type: 'form', fields: [{ key: '1ungueltig', type: 'quatsch' }] }] },
  });
  // Wer ein Plugin schreibt, soll nicht Fehler fuer Fehler abarbeiten muessen.
  assert.ok(fehler.length >= 4, `erwartet mehrere Meldungen, bekam: ${fehler.join(' | ')}`);
  assert.ok(fehler.some((f) => f.includes('label')));
  assert.ok(fehler.some((f) => f.includes('quatsch')));
});

test('Namen, die als Tabellenname gefaehrlich waeren, werden abgewiesen', () => {
  // Der Name landet im Tabellennamen - hier ist Strenge Absicht.
  for (const name of ['Demo', 'de mo', 'demo;DROP', '../x', 'd', '']) {
    assert.equal(
      validateManifest({ name, label: 'X' }).ok,
      false,
      `"${name}" haette abgewiesen werden muessen`,
    );
  }
});

test('Feldnamen, die als Spaltenname gefaehrlich waeren, werden abgewiesen', () => {
  for (const key of ['a b', 'a;b', "a'b", '1a', 'a-b']) {
    const { ok } = validateManifest({
      name: 'demo',
      label: 'D',
      ui: { sections: [{ type: 'form', fields: [{ key, label: 'X', type: 'text' }] }] },
    });
    assert.equal(ok, false, `"${key}" haette abgewiesen werden muessen`);
  }
});

test('Eine Auswahl ohne Optionen wird abgewiesen', () => {
  const { ok, fehler } = validateManifest({
    name: 'demo',
    label: 'D',
    ui: { sections: [{ type: 'form', fields: [{ key: 'a', label: 'A', type: 'select' }] }] },
  });
  assert.equal(ok, false);
  assert.ok(fehler.some((f) => f.includes('options')));
});

test('Zwei Listen mit demselben Schluessel werden abgewiesen', () => {
  // Sie wuerden sich sonst dieselbe Tabelle teilen.
  const liste = {
    type: 'list',
    key: 'items',
    fields: [{ key: 'a', label: 'A', type: 'text' }],
  };
  const { ok, fehler } = validateManifest({
    name: 'demo',
    label: 'D',
    ui: { sections: [liste, { ...liste }] },
  });
  assert.equal(ok, false);
  assert.ok(fehler.some((f) => f.includes('mehrfach')));
});

test('Tabellennamen tragen immer das Plugin-Praefix', () => {
  // So kann ein Plugin keine Tabelle des Grundsystems ueberschreiben.
  assert.equal(tableName('regeln'), 'plugin_regeln_config');
  assert.equal(tableName('regeln', 'items'), 'plugin_regeln_items');
  assert.equal(tableName('mein-plugin', 'a-b'), 'plugin_mein_plugin_a_b');
});

// --- Ordner einlesen ------------------------------------------------------

test('Ein Plugin-Ordner wird gefunden', () => {
  const dir = ordnerMit({
    demo: { 'plugin.json': gueltig(), 'bot.js': 'export default {}', 'api.js': 'export default {}' },
  });
  try {
    const { plugins, fehler } = discoverPlugins(dir);
    assert.deepEqual(fehler, []);
    assert.equal(plugins.length, 1);
    assert.equal(plugins[0].name, 'demo');
    assert.ok(plugins[0].botPath, 'bot.js muss gefunden werden');
    assert.ok(plugins[0].apiPath, 'api.js muss gefunden werden');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('bot.js und api.js sind beide freiwillig', () => {
  const dir = ordnerMit({ demo: { 'plugin.json': gueltig() } });
  try {
    const { plugins } = discoverPlugins(dir);
    assert.equal(plugins.length, 1);
    assert.equal(plugins[0].botPath, null);
    assert.equal(plugins[0].apiPath, null);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('Ein kaputtes Plugin wird uebersprungen, die anderen laufen weiter', () => {
  const dir = ordnerMit({
    kaputt: { 'plugin.json': '{ das ist kein JSON' },
    heil: { 'plugin.json': gueltig('heil') },
  });
  try {
    const { plugins, fehler } = discoverPlugins(dir);
    // Das ist der Kern: ein Fehler darf nicht alles mitreissen.
    assert.equal(plugins.length, 1);
    assert.equal(plugins[0].name, 'heil');
    assert.equal(fehler.length, 1);
    assert.match(fehler[0], /kaputt/);
    assert.match(fehler[0], /JSON/, 'der Grund muss genannt werden');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('Ein Ordner ohne plugin.json wird mit Grund gemeldet', () => {
  const dir = ordnerMit({ leer: { 'bot.js': 'export default {}' } });
  try {
    const { plugins, fehler } = discoverPlugins(dir);
    assert.equal(plugins.length, 0);
    assert.match(fehler[0], /plugin\.json/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('Ordnername und Name im Manifest muessen uebereinstimmen', () => {
  // Sonst waere unklar, welcher Name in der URL steht.
  const dir = ordnerMit({ ordner: { 'plugin.json': gueltig('anders') } });
  try {
    const { plugins, fehler } = discoverPlugins(dir);
    assert.equal(plugins.length, 0);
    assert.match(fehler[0], /anders/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('Ein Plugin laesst sich mit _ davor abschalten', () => {
  const dir = ordnerMit({
    _pause: { 'plugin.json': gueltig('_pause') },
    '.versteckt': { 'plugin.json': gueltig('.versteckt') },
    aktiv: { 'plugin.json': gueltig('aktiv') },
  });
  try {
    const { plugins, fehler } = discoverPlugins(dir);
    assert.deepEqual(plugins.map((p) => p.name), ['aktiv']);
    // Abgeschaltet ist kein Fehler - es soll keine Warnung geben.
    assert.deepEqual(fehler, []);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('Lose Dateien im Plugin-Ordner stoeren nicht', () => {
  const dir = ordnerMit({ demo: { 'plugin.json': gueltig() } });
  writeFileSync(join(dir, 'README.md'), '# Hinweis');
  writeFileSync(join(dir, 'altes-plugin.js'), 'export default {}');
  try {
    const { plugins, fehler } = discoverPlugins(dir);
    assert.equal(plugins.length, 1);
    assert.deepEqual(fehler, [], 'lose Dateien sind der alte Weg, keine Fehler');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('Ein fehlendes Verzeichnis ist kein Fehler', () => {
  const { plugins, fehler } = discoverPlugins(join(tmpdir(), 'gibt-es-nicht-12345'));
  assert.deepEqual(plugins, []);
  assert.deepEqual(fehler, []);
});

// --- Was nach aussen geht -------------------------------------------------

test('Nach aussen gehen keine Dateipfade', () => {
  const oeffentlich = publicManifests([
    {
      name: 'demo',
      dir: '/geheim/pfad',
      botPath: '/geheim/pfad/bot.js',
      manifest: JSON.parse(gueltig()),
    },
  ]);
  const roh = JSON.stringify(oeffentlich);
  assert.ok(!roh.includes('/geheim'), 'Pfade gehen den Browser nichts an');
  assert.ok(!roh.includes('botPath'));
  assert.equal(oeffentlich[0].label, 'Demo');
});

test('Ein Plugin ohne Oberflaeche taucht im Dashboard nicht auf', () => {
  const oeffentlich = publicManifests([
    { name: 'still', manifest: { name: 'still', label: 'Still' } },
  ]);
  assert.deepEqual(oeffentlich, [], 'ohne ui gibt es nichts anzuzeigen');
});
