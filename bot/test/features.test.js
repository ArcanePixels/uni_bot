import { test } from 'node:test';
import assert from 'node:assert/strict';
import { renderPoll, NUMBER_EMOJI } from '../src/plugins/polls.js';
import { emojiKey } from '../src/plugins/reaction-roles.js';
import { JoinTracker } from '../src/plugins/antiraid.js';

// --- Umfragen --------------------------------------------------------------

test('renderPoll zeigt Prozente und Balken', () => {
  const text = renderPoll({
    question: 'Pizza oder Pasta?',
    options: ['Pizza', 'Pasta'],
    counts: [3, 1],
    closed: false,
    multi: false,
  });
  assert.match(text, /Pizza oder Pasta/);
  assert.match(text, /75% \(3\)/);
  assert.match(text, /25% \(1\)/);
  assert.match(text, /4 Stimmen/);
  assert.match(text, /eine Stimme pro Person/);
});

test('renderPoll verkraftet null Stimmen ohne Division durch null', () => {
  const text = renderPoll({
    question: 'Noch niemand da?',
    options: ['A', 'B'],
    counts: [0, 0],
    closed: false,
    multi: false,
  });
  assert.match(text, /0% \(0\)/);
  assert.match(text, /0 Stimmen/);
  assert.doesNotMatch(text, /NaN/);
});

test('renderPoll kennzeichnet beendete Umfragen', () => {
  const text = renderPoll({
    question: 'Vorbei?',
    options: ['Ja'],
    counts: [2],
    closed: true,
    multi: false,
  });
  assert.match(text, /beendet/);
  assert.match(text, /Endergebnis/);
});

test('renderPoll weist auf Mehrfachauswahl hin', () => {
  const text = renderPoll({
    question: 'Was magst du?',
    options: ['A', 'B'],
    counts: [1, 1],
    closed: false,
    multi: true,
  });
  assert.match(text, /Mehrfachauswahl erlaubt/);
});

test('renderPoll nummeriert die Antworten durch', () => {
  const text = renderPoll({
    question: 'Test',
    options: ['A', 'B', 'C'],
    counts: [0, 0, 0],
    closed: false,
    multi: false,
  });
  for (const e of NUMBER_EMOJI.slice(0, 3)) assert.ok(text.includes(e), `${e} fehlt`);
  assert.ok(!text.includes(NUMBER_EMOJI[3]), 'nicht genutzte Nummer darf nicht auftauchen');
});

test('Einzelstimme wird korrekt als Singular ausgewiesen', () => {
  const text = renderPoll({
    question: 'x',
    options: ['A'],
    counts: [1],
    closed: false,
    multi: false,
  });
  assert.match(text, /1 Stimme ·/);
});

// --- Reaction Roles --------------------------------------------------------

test('emojiKey unterscheidet Unicode und benutzerdefinierte Emojis', () => {
  assert.equal(emojiKey({ id: null, name: '🎮' }), '🎮');
  // Benutzerdefinierte haben eine ID - die ist eindeutig, der Name nicht.
  assert.equal(emojiKey({ id: '123456789', name: 'arcane' }), '123456789');
});

// --- Anti-Raid -------------------------------------------------------------

test('JoinTracker zählt nur innerhalb des Zeitfensters', () => {
  const t = new JoinTracker();
  const base = 1_000_000;
  for (let i = 0; i < 5; i++) t.push('g1', 60, base + i * 1000);
  assert.equal(t.push('g1', 60, base + 5000), 6);
  // Weit außerhalb -> Zähler beginnt von vorn.
  assert.equal(t.push('g1', 60, base + 500_000), 1);
});

test('JoinTracker hält Server auseinander', () => {
  const t = new JoinTracker();
  const base = 1_000_000;
  t.push('g1', 60, base);
  t.push('g1', 60, base + 100);
  assert.equal(t.push('g2', 60, base + 200), 1, 'anderer Server zählt eigenständig');
});

test('JoinTracker lässt sich zurücksetzen', () => {
  const t = new JoinTracker();
  t.push('g1', 60, 1000);
  t.push('g1', 60, 2000);
  t.clear('g1');
  assert.equal(t.push('g1', 60, 3000), 1);
});
