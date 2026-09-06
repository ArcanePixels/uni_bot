import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { FUNKTIONEN, UNTERSCHIEDE, allePunkte } from '../src/lib/vorteile.js';

/**
 * Was die Startseite verspricht.
 *
 * Der Kern dieser Tests: **Jede genannte Funktion muss es wirklich geben.**
 * Eine Übersichtsseite, die etwas aufzählt, das nie gebaut wurde, ist
 * schlimmer als gar keine - sie kostet Vertrauen, sobald es jemand merkt.
 *
 * Deshalb nennt jeder Punkt die Datei, in der die Funktion steckt, und hier
 * wird geprüft, dass es sie gibt.
 */

const WURZEL = fileURLToPath(new URL('../..', import.meta.url));

test('Jede genannte Funktion existiert wirklich', () => {
  for (const punkt of allePunkte()) {
    assert.ok(punkt.pruefbar, `"${punkt.text}" nennt keine Datei`);
    const pfad = join(WURZEL, punkt.pruefbar);
    assert.ok(existsSync(pfad), `"${punkt.text}" verweist auf ${punkt.pruefbar} – gibt es nicht`);
  }
});

test('Kein Punkt ist ohne Text', () => {
  for (const punkt of allePunkte()) {
    assert.ok(punkt.text?.trim().length > 10, `zu kurz: "${punkt.text}"`);
  }
});

test('Kein Punkt taucht doppelt auf', () => {
  const texte = allePunkte().map((p) => p.text);
  assert.equal(new Set(texte).size, texte.length);
});

test('Jede Gruppe hat einen Namen und Punkte', () => {
  for (const g of FUNKTIONEN) {
    assert.ok(g.gruppe?.trim(), 'Gruppe ohne Namen');
    assert.ok(g.punkte.length >= 3, `"${g.gruppe}" hat nur ${g.punkte.length} Punkte`);
    assert.ok(g.icon, `"${g.gruppe}" hat kein Symbol`);
  }
});

test('Die Symbole der Gruppen gibt es auch', () => {
  // Ein unbekanntes Symbol bliebe als Lücke stehen.
  const erlaubt = ['shield', 'wave', 'clock', 'play', 'list', 'users', 'gavel', 'plus', 'hash', 'scroll', 'plug'];
  for (const g of FUNKTIONEN) {
    assert.ok(erlaubt.includes(g.icon), `"${g.icon}" ist kein bekanntes Symbol`);
  }
});

// --- Die Unterschiede -----------------------------------------------------

test('Jeder Unterschied hat Titel und Erklärung', () => {
  for (const u of UNTERSCHIEDE) {
    assert.ok(u.titel?.trim().length > 5, `Titel zu kurz: "${u.titel}"`);
    assert.ok(u.text?.trim().length > 40, `Erklärung zu knapp bei "${u.titel}"`);
  }
});

test('Die Aussagen bleiben bei dem, was nachprüfbar ist', () => {
  // Werbefloskeln haben hier nichts zu suchen - jede Aussage muss stimmen.
  const alles = UNTERSCHIEDE.map((u) => `${u.titel} ${u.text}`).join(' ').toLowerCase();
  for (const wort of ['beste', 'perfekt', 'revolutionär', 'einzigartig', 'unschlagbar']) {
    assert.ok(!alles.includes(wort), `"${wort}" ist eine Behauptung, keine Tatsache`);
  }
});

test('Es sind genug Punkte, um den Umfang zu zeigen', () => {
  assert.ok(allePunkte().length >= 15, `nur ${allePunkte().length} Punkte`);
  assert.ok(FUNKTIONEN.length >= 3, 'zu wenige Gruppen');
});
