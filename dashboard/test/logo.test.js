import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

/**
 * Das Logo liegt als erzeugte Datei im Repo - erzeugt aus logo-original.svg
 * von tools/logo-bauen.mjs.
 *
 * Zwei Dinge koennen dabei schiefgehen, und beide faellt man erst im Browser
 * auf: Jemand bessert in logo.svg von Hand nach (und der naechste Lauf des
 * Skripts wirft es weg), oder die Vorlage wird getauscht und die erzeugten
 * Dateien bleiben alt. Der Test laesst das Skript laufen und vergleicht.
 */
const wurzel = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const lies = (p) => readFileSync(join(wurzel, p), 'utf8');

const ERZEUGT = [
  'dashboard/public/logo.svg',
  'dashboard/public/logo-mark.svg',
  'dashboard/src/app/icon.svg',
];

test('Die erzeugten Logo-Dateien passen zur Vorlage', () => {
  const vorher = ERZEUGT.map(lies);
  execFileSync(process.execPath, ['tools/logo-bauen.mjs'], { cwd: wurzel });
  const nachher = ERZEUGT.map(lies);

  for (const [i, datei] of ERZEUGT.entries()) {
    assert.equal(
      nachher[i],
      vorher[i],
      `${datei} weicht von der Vorlage ab. Nicht von Hand aendern - ` +
        'stattdessen logo-quelle/logo-original.svg tauschen und `node tools/logo-bauen.mjs` laufen lassen.',
    );
  }
});

test('Das Logo laesst sich per CSS einfaerben', () => {
  for (const datei of ['dashboard/public/logo.svg', 'dashboard/public/logo-mark.svg']) {
    assert.match(lies(datei), /fill="currentColor"/, `${datei} braucht currentColor`);
  }
});

test('Das Favicon hat eine feste Farbe', () => {
  // Eine Datei im Browser-Tab erbt kein CSS - currentColor waere dort schwarz.
  const icon = lies('dashboard/src/app/icon.svg');
  assert.doesNotMatch(icon, /currentColor/);
  assert.match(icon, /fill="#ff9f20"/);
});

test('Der Bildausschnitt der Figur laesst den Schriftzug weg', () => {
  // Volles Logo und Figur unterscheiden sich nur in der viewBox - die Pfade
  // bleiben unangetastet, weil sie relativ zueinander liegen.
  const voll = lies('dashboard/public/logo.svg');
  const mark = lies('dashboard/public/logo-mark.svg');
  assert.match(voll, /viewBox="0 0 1024 1024"/);
  assert.match(mark, /viewBox="120 60 800 600"/);

  const pfade = (s) => s.match(/<path d="[^"]*"\/>/g);
  assert.deepEqual(pfade(mark), pfade(voll), 'Die Pfade muessen identisch bleiben');
});

test('Die Markenfarbe im CSS passt zum Favicon', () => {
  const css = lies('dashboard/src/app/globals.css');
  assert.match(css, /--marke:\s*#ff9f20;/);
});

test('Der Serverakzent faerbt das Logo nicht um', () => {
  // AccentStyle setzt --accent pro Server neu. Das Logo haengt bewusst an
  // --marke, sonst wechselt es auf jedem Server die Farbe.
  const css = lies('dashboard/src/app/globals.css');
  const markeBlock = css.slice(css.indexOf('.brand-mark'), css.indexOf('}', css.indexOf('.brand-mark')));
  assert.match(markeBlock, /var\(--marke\)/);
  assert.doesNotMatch(markeBlock, /var\(--accent\)/);

  // Kommentare ausklammern - gemeint ist, was AccentStyle wirklich setzt.
  const accentStyle = lies('dashboard/src/components/AccentStyle.js')
    .replace(/\/\*[\s\S]*?\*\//g, '');
  assert.doesNotMatch(accentStyle, /--marke/, 'AccentStyle darf --marke nicht setzen');
});

test('Text auf der Akzentfarbe bleibt lesbar', async () => {
  const { textAufFarbe } = await import('../src/lib/kontrast.js');
  // Extremwerte zuerst - daran faellt ein verdrehtes Vorzeichen sofort auf.
  assert.equal(textAufFarbe('#000000'), '#ffffff');
  assert.equal(textAufFarbe('#ffffff'), '#1a1206');
  // Das Markenorange ist hell, braucht also dunkle Schrift.
  assert.equal(textAufFarbe('#ff9f20'), '#1a1206');
  // Discord-Blurple ist dunkel genug fuer weisse Schrift.
  assert.equal(textAufFarbe('#5865f2'), '#ffffff');
});

test('In public/ liegen keine schweren Vorlagen', () => {
  // Alles unter public/ wird an jeden Besucher ausgeliefert. Die Vorlagen
  // (u.a. ein knapp 1 MB grosses PNG) gehoeren daher nach logo-quelle/.
  const ordner = join(wurzel, 'dashboard/public');
  const zuGross = readdirSync(ordner)
    .map((name) => [name, statSync(join(ordner, name)).size])
    .filter(([, groesse]) => groesse > 100 * 1024);

  assert.deepEqual(
    zuGross,
    [],
    'Datei(en) ueber 100 KB in public/ - Vorlagen gehoeren nach dashboard/logo-quelle/',
  );
});
