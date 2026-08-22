import { test } from 'node:test';
import assert from 'node:assert/strict';
import { __test__ } from '../src/plugins/automod.js';
import { resolveEscalation } from '../src/core/infractions.js';

const { hasBadWord, offendingLink, SpamTracker } = __test__;

test('Wortfilter trifft unabhaengig von Gross-/Kleinschreibung', () => {
  assert.equal(hasBadWord('Das ist DUMM hier', ['dumm']), 'dumm');
  assert.equal(hasBadWord('alles gut', ['dumm']), null);
  assert.equal(hasBadWord('irgendwas', []), null);
});

test('Link-Filter laesst Whitelist inkl. Subdomains durch', () => {
  const wl = ['youtube.com', 'arcanepixels.de'];
  assert.equal(offendingLink('schau https://www.youtube.com/watch?v=1 an', wl), null);
  assert.equal(offendingLink('siehe https://arcanepixels.de', wl), null);
  assert.match(offendingLink('klick https://boese.example/x', wl), /boese\.example/);
});

test('Link-Filter faellt nicht auf aehnliche Domains herein', () => {
  // "notyoutube.com" endet zwar auf "youtube.com", ist aber eine andere Domain.
  assert.match(offendingLink('https://notyoutube.com/x', ['youtube.com']), /notyoutube/);
});

test('Nachricht ohne Link ist unauffaellig', () => {
  assert.equal(offendingLink('nur text', ['youtube.com']), null);
});

test('Spam-Tracker zaehlt nur innerhalb des Zeitfensters', () => {
  const t = new SpamTracker();
  const base = 1_000_000;
  for (let i = 0; i < 4; i++) t.push('g:u', 5, base + i * 100);
  assert.equal(t.push('g:u', 5, base + 400), 5);
  // Weit ausserhalb des Fensters -> Zaehler faengt von vorn an.
  assert.equal(t.push('g:u', 5, base + 20_000), 1);
});

test('Eskalation waehlt die hoechste erreichte Stufe', () => {
  const steps = [
    { at: 1, action: 'warn' },
    { at: 3, action: 'timeout', durationMinutes: 10 },
    { at: 5, action: 'kick' },
    { at: 7, action: 'ban' },
  ];
  assert.equal(resolveEscalation(steps, 1).action, 'warn');
  assert.equal(resolveEscalation(steps, 4).action, 'timeout');
  assert.equal(resolveEscalation(steps, 5).action, 'kick');
  assert.equal(resolveEscalation(steps, 99).action, 'ban');
  assert.equal(resolveEscalation(steps, 0), null);
});
