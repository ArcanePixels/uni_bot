import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  startwert,
  startwerte,
  zeilenText,
  istVoll,
  kannSchieben,
  farbwert,
  darstellbareAbschnitte,
  darstellbareFelder,
} from '../src/lib/plugin-ui.js';

/**
 * Die Logik hinter der Plugin-Oberflaeche.
 *
 * Laeuft am Ende gegen das echte Manifest von `plugins/regeln` - so ist
 * geprueft, dass aus einer plugin.json wirklich eine benutzbare Seite wird und
 * nicht nur aus einem im Test erfundenen Idealfall.
 */

// --- Startwerte -----------------------------------------------------------

test('Wahrheitswerte kommen als 0/1 an und werden zu true/false', () => {
  const feld = { key: 'aktiv', type: 'boolean' };
  assert.equal(startwert(feld, { aktiv: 1 }), true);
  assert.equal(startwert(feld, { aktiv: 0 }), false);
  assert.equal(startwert(feld, {}), false, 'nicht gesetzt heisst aus');
});

test('Fehlt ein Wert, greift der Standard aus dem Manifest', () => {
  const feld = { key: 'title', type: 'text', default: 'Serverregeln' };
  assert.equal(startwert(feld, { title: null }), 'Serverregeln');
  assert.equal(startwert(feld, {}), 'Serverregeln');
  assert.equal(startwert(feld, { title: 'Eigenes' }), 'Eigenes', 'Gesetztes gewinnt');
});

test('Ein leerer Text bleibt leer und wird nicht durch den Standard ersetzt', () => {
  // Wer ein Feld absichtlich leert, will es leer haben.
  const feld = { key: 'title', type: 'text', default: 'Standard' };
  assert.equal(startwert(feld, { title: '' }), '');
});

test('startwerte deckt alle Felder ab', () => {
  const werte = startwerte(
    [
      { key: 'a', type: 'text', default: 'A' },
      { key: 'b', type: 'boolean' },
    ],
    { b: 1 },
  );
  assert.deepEqual(werte, { a: 'A', b: true });
});

// --- Listenzeile ----------------------------------------------------------

test('Die Zeile nimmt Symbol, Titel und Zusatztexte', () => {
  const abschnitt = {
    itemLabel: 'title',
    fields: [
      { key: 'icon', type: 'emoji' },
      { key: 'title', type: 'text' },
      { key: 'text', type: 'textarea' },
    ],
  };
  const z = zeilenText(abschnitt, { icon: '🤝', title: 'Respekt', text: 'Freundlich bleiben.' });
  assert.equal(z.icon, '🤝');
  assert.equal(z.titel, 'Respekt');
  assert.deepEqual(z.zusatz, ['Freundlich bleiben.']);
});

test('Ein Eintrag ohne Titel bekommt einen Platzhalter statt einer leeren Zeile', () => {
  const z = zeilenText({ fields: [] }, { title: '   ' });
  assert.equal(z.titel, '(ohne Titel)');
});

test('Ein leeres Symbol wird nicht angezeigt', () => {
  assert.equal(zeilenText({ fields: [] }, { icon: '  ', title: 'X' }).icon, null);
});

test('Das Hauptfeld erscheint nicht doppelt als Zusatz', () => {
  const abschnitt = { itemLabel: 'text', fields: [{ key: 'text', type: 'textarea' }] };
  assert.deepEqual(zeilenText(abschnitt, { text: 'Nur einmal' }).zusatz, []);
});

// --- Grenzen und Pfeile ---------------------------------------------------

test('Die Obergrenze wird erkannt', () => {
  assert.equal(istVoll({ max: 25 }, 24), false);
  assert.equal(istVoll({ max: 25 }, 25), true);
  assert.equal(istVoll({}, 9999), false, 'ohne max gibt es keine Grenze');
});

test('Die Pfeile sind am Rand abgeschaltet', () => {
  assert.equal(kannSchieben(0, 3, 'up'), false, 'der erste kann nicht hoeher');
  assert.equal(kannSchieben(0, 3, 'down'), true);
  assert.equal(kannSchieben(2, 3, 'down'), false, 'der letzte kann nicht tiefer');
  assert.equal(kannSchieben(0, 1, 'up'), false, 'ein einzelner Eintrag geht nirgendwohin');
  assert.equal(kannSchieben(0, 1, 'down'), false);
});

// --- Farbe ----------------------------------------------------------------

test('Der Farbwaehler bekommt immer einen gueltigen Wert', () => {
  assert.equal(farbwert('#7c5cff'), '#7c5cff');
  // Waehrend jemand tippt, steht im Textfeld ein Zwischenstand.
  for (const unfertig of ['#7c5', '', null, undefined, 'knallrot', '7c5cff']) {
    assert.equal(farbwert(unfertig), '#5865f2', `"${unfertig}" braucht den Rueckfall`);
  }
});

// --- Unbekanntes ueberspringen -------------------------------------------

test('Unbekannte Bausteine werden uebersprungen statt zu scheitern', () => {
  // Ein Plugin aus einer neueren Version darf die Seite nicht zerlegen.
  const abschnitte = darstellbareAbschnitte({
    sections: [{ type: 'form', fields: [] }, { type: 'zeitmaschine' }, { type: 'list', key: 'x' }],
  });
  assert.deepEqual(abschnitte.map((a) => a.type), ['form', 'list']);
});

test('Unbekannte Feldtypen werden uebersprungen', () => {
  const felder = darstellbareFelder([
    { key: 'a', type: 'text' },
    { key: 'b', type: 'hologramm' },
    { key: 'c', type: 'color' },
  ]);
  assert.deepEqual(felder.map((f) => f.key), ['a', 'c']);
});

test('Fehlt die Oberflaeche ganz, gibt es einfach nichts', () => {
  assert.deepEqual(darstellbareAbschnitte(undefined), []);
  assert.deepEqual(darstellbareAbschnitte({}), []);
  assert.deepEqual(darstellbareFelder(undefined), []);
});

// --- Gegen das echte Manifest --------------------------------------------

test('Das mitgelieferte Regeln-Plugin ergibt eine vollstaendige Seite', () => {
  const manifest = JSON.parse(
    readFileSync(new URL('../../plugins/regeln/plugin.json', import.meta.url), 'utf8'),
  );

  const abschnitte = darstellbareAbschnitte(manifest.ui);
  assert.deepEqual(
    abschnitte.map((a) => a.type),
    ['list', 'form', 'actions'],
    'alle drei Abschnitte muessen darstellbar sein',
  );

  // Jedes Feld des Manifests muss einen Baustein haben - sonst faellt beim
  // Nutzer stillschweigend etwas weg.
  for (const abschnitt of abschnitte) {
    if (!abschnitt.fields) continue;
    assert.equal(
      darstellbareFelder(abschnitt.fields).length,
      abschnitt.fields.length,
      `im Abschnitt "${abschnitt.title}" fehlt ein Baustein`,
    );
  }

  // Die Darstellung mit echten Daten. Der Regeltext ist das Hauptfeld - eine
  // Ueberschrift ist die Ausnahme, deshalb steht der Text in der Zeile.
  const liste = abschnitte.find((a) => a.type === 'list');
  const nurText = zeilenText(liste, { icon: '🤝', text: 'Freundlich bleiben.' });
  assert.equal(nurText.titel, 'Freundlich bleiben.');
  assert.equal(nurText.icon, '🤝');

  // Die Ueberschrift ist optional - eine Regel ohne darf nicht als
  // "(ohne Titel)" erscheinen.
  const ohne = zeilenText(liste, { text: 'Spam ist nicht erlaubt.' });
  assert.equal(ohne.titel, 'Spam ist nicht erlaubt.');

  assert.equal(istVoll(liste, 25), true, 'die Grenze von Discord muss greifen');

  // Die Standardwerte des Formulars.
  const form = abschnitte.find((a) => a.type === 'form');
  const werte = startwerte(form.fields, {});
  assert.equal(werte.title, 'Serverregeln');
  assert.equal(werte.color, '#5865f2');
  assert.equal(farbwert(werte.color), '#5865f2');
});
