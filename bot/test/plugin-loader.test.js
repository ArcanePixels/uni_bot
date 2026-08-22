import { test, beforeEach, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadExternalPlugins, validatePlugin } from '../src/core/plugin-loader.js';

let dir;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'allr-plugins-'));
});

after(() => {
  // Aufraeumen uebernimmt jeder Test selbst; hier nur der letzte Rest.
  try {
    rmSync(dir, { recursive: true, force: true });
  } catch {
    // Unter Windows kann ein Handle noch offen sein - unkritisch.
  }
});

/** Schreibt eine Plugin-Datei und gibt ihren Namen zurück. */
function schreibe(name, inhalt) {
  writeFileSync(join(dir, name), inhalt, 'utf8');
  return name;
}

const GUELTIG = `export default {
  name: 'testplugin',
  setup() {
    return { messageCreate() {} };
  },
};`;

test('Fehlendes Verzeichnis ist kein Fehler', async () => {
  const res = await loadExternalPlugins(join(dir, 'gibtsnicht'));
  assert.deepEqual(res.geladen, []);
  assert.deepEqual(res.fehler, []);
});

test('Leeres Verzeichnis lädt nichts', async () => {
  const res = await loadExternalPlugins(dir);
  assert.deepEqual(res.geladen, []);
  assert.deepEqual(res.fehler, []);
});

test('Ein gültiges Plugin wird geladen', async () => {
  schreibe('mein-plugin.js', GUELTIG);
  const res = await loadExternalPlugins(dir);
  assert.equal(res.geladen.length, 1);
  assert.equal(res.geladen[0].name, 'testplugin');
  assert.deepEqual(res.fehler, []);
});

test('Ein Plugin mit Syntaxfehler hält den Rest nicht auf', async () => {
  schreibe('kaputt.js', 'export default { name: "x", setup() { ');
  schreibe('heil.js', GUELTIG);

  const res = await loadExternalPlugins(dir);
  assert.equal(res.geladen.length, 1, 'das heile Plugin muss trotzdem laden');
  assert.equal(res.geladen[0].name, 'testplugin');
  assert.equal(res.fehler.length, 1);
  assert.match(res.fehler[0], /kaputt\.js/);
});

test('Ein Plugin ohne Standard-Export wird abgewiesen', async () => {
  schreibe('ohne-export.js', 'export const irgendwas = 1;');
  const res = await loadExternalPlugins(dir);
  assert.equal(res.geladen.length, 0);
  assert.match(res.fehler[0], /kein Standard-Export/);
});

test('Ein Plugin ohne Namen wird abgewiesen', async () => {
  schreibe('namenlos.js', 'export default { setup() {} };');
  const res = await loadExternalPlugins(dir);
  assert.match(res.fehler[0], /keinen "name"/);
});

test('Ein Plugin ohne setup wird abgewiesen', async () => {
  schreibe('ohne-setup.js', 'export default { name: "x" };');
  const res = await loadExternalPlugins(dir);
  assert.match(res.fehler[0], /keine "setup/);
});

test('Ein doppelter Plugin-Name wird abgewiesen', async () => {
  // Sonst wuerde das zweite das erste stillschweigend verdecken.
  schreibe('a.js', GUELTIG);
  const res = await loadExternalPlugins(dir, ['testplugin']);
  assert.equal(res.geladen.length, 0);
  assert.match(res.fehler[0], /bereits vergeben/);
});

test('Zwei Plugins mit demselben Namen: das zweite wird abgewiesen', async () => {
  schreibe('erst.js', GUELTIG);
  schreibe('zweit.js', GUELTIG);
  const res = await loadExternalPlugins(dir);
  assert.equal(res.geladen.length, 1);
  assert.equal(res.fehler.length, 1);
  assert.match(res.fehler[0], /bereits vergeben/);
});

test('Dateien mit _ oder . am Anfang gelten als Hilfsmodule', async () => {
  schreibe('_helfer.js', 'export default { name: "helfer", setup() {} };');
  schreibe('.versteckt.js', GUELTIG);
  const res = await loadExternalPlugins(dir);
  assert.equal(res.geladen.length, 0, 'private Dateien dürfen nicht geladen werden');
  assert.deepEqual(res.fehler, []);
});

test('Nicht-JS-Dateien werden übergangen', async () => {
  schreibe('liesmich.txt', 'kein Plugin');
  schreibe('daten.json', '{}');
  const res = await loadExternalPlugins(dir);
  assert.deepEqual(res.geladen, []);
  assert.deepEqual(res.fehler, [], 'eine Textdatei ist kein Fehler');
});

test('Ordner-Plugins werden über index.js geladen', async () => {
  mkdirSync(join(dir, 'mein-modul'));
  writeFileSync(join(dir, 'mein-modul', 'index.js'), GUELTIG, 'utf8');
  const res = await loadExternalPlugins(dir);
  assert.equal(res.geladen.length, 1);
  assert.equal(res.geladen[0].name, 'testplugin');
});

test('Ein Ordner ohne index.js wird übergangen, nicht gemeldet', async () => {
  mkdirSync(join(dir, 'leer'));
  const res = await loadExternalPlugins(dir);
  assert.deepEqual(res.geladen, []);
  assert.deepEqual(res.fehler, [], 'ein Ordner ohne index.js ist kein harter Fehler');
});

test('validatePlugin benennt das Problem konkret', () => {
  assert.match(validatePlugin({}, 'x.js'), /Standard-Export/);
  assert.match(validatePlugin({ default: {} }, 'x.js'), /name/);
  assert.match(validatePlugin({ default: { name: 'a' } }, 'x.js'), /setup/);
  assert.equal(validatePlugin({ default: { name: 'a', setup() {} } }, 'x.js'), null);
});

test('Ein leerer Name zählt nicht als Name', () => {
  assert.match(validatePlugin({ default: { name: '   ', setup() {} } }, 'x.js'), /name/);
});
