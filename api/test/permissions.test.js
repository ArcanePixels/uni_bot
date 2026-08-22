import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mergeOverwrite, bitsFrom, PERMISSION_BITS, PRESETS } from '../src/permissions.js';

const VIEW = PERMISSION_BITS.VIEW_CHANNEL;
const SEND = PERMISSION_BITS.SEND_MESSAGES;
const HISTORY = PERMISSION_BITS.READ_MESSAGE_HISTORY;

test('bitsFrom setzt die richtigen Bits', () => {
  assert.equal(bitsFrom(['VIEW_CHANNEL']), VIEW);
  assert.equal(bitsFrom(['VIEW_CHANNEL', 'SEND_MESSAGES']), VIEW | SEND);
  assert.equal(bitsFrom([]), 0n);
});

test('bitsFrom ignoriert unbekannte Namen, statt zu werfen', () => {
  assert.equal(bitsFrom(['VIEW_CHANNEL', 'GIBT_ES_NICHT']), VIEW);
});

test('mergeOverwrite legt Rechte an, wenn noch keine da sind', () => {
  const r = mergeOverwrite(null, VIEW | SEND, 0n);
  assert.equal(BigInt(r.allow), VIEW | SEND);
  assert.equal(BigInt(r.deny), 0n);
});

test('mergeOverwrite erhält fremde Rechte, die nichts mit der Änderung zu tun haben', () => {
  // Bestehend: darf Dateien anhängen. Neu: darf lesen.
  const existing = { allow: String(PERMISSION_BITS.ATTACH_FILES), deny: '0' };
  const r = mergeOverwrite(existing, VIEW, 0n);
  const allow = BigInt(r.allow);
  assert.ok(allow & PERMISSION_BITS.ATTACH_FILES, 'bestehendes Recht wurde gelöscht');
  assert.ok(allow & VIEW, 'neues Recht fehlt');
});

test('Ein Recht zu erlauben nimmt es aus deny heraus', () => {
  // War verboten zu schreiben - jetzt erlaubt.
  const existing = { allow: String(VIEW), deny: String(SEND) };
  const r = mergeOverwrite(existing, SEND, 0n);
  assert.ok(BigInt(r.allow) & SEND, 'muss jetzt erlaubt sein');
  assert.equal(BigInt(r.deny) & SEND, 0n, 'darf nicht mehr verboten sein');
});

test('Ein Recht zu verbieten nimmt es aus allow heraus', () => {
  const existing = { allow: String(VIEW | SEND), deny: '0' };
  const r = mergeOverwrite(existing, 0n, SEND);
  assert.equal(BigInt(r.allow) & SEND, 0n, 'darf nicht mehr erlaubt sein');
  assert.ok(BigInt(r.deny) & SEND, 'muss jetzt verboten sein');
  assert.ok(BigInt(r.allow) & VIEW, 'das andere Recht muss bleiben');
});

test('Dasselbe zweimal anzuwenden ändert nichts mehr', () => {
  const first = mergeOverwrite(null, VIEW | HISTORY, SEND);
  const second = mergeOverwrite(first, VIEW | HISTORY, SEND);
  assert.deepEqual(first, second, 'die Änderung muss idempotent sein');
});

test('Rechte kommen als String zurück - Discord erwartet keine Zahlen', () => {
  const r = mergeOverwrite(null, VIEW, 0n);
  assert.equal(typeof r.allow, 'string');
  assert.equal(typeof r.deny, 'string');
});

test('Sehr hohe Bits überstehen die Umwandlung', () => {
  // Bit 46 sprengt Number - nur mit BigInt korrekt.
  const high = 1n << 46n;
  const r = mergeOverwrite({ allow: String(high), deny: '0' }, VIEW, 0n);
  assert.ok(BigInt(r.allow) & high, 'hohes Bit ging verloren');
  assert.ok(BigInt(r.allow) & VIEW);
});

test('Preset "Lesen" erlaubt Sehen, verbietet Schreiben', () => {
  const p = PRESETS.read;
  assert.ok(p.allow.includes('VIEW_CHANNEL'));
  assert.ok(p.deny.includes('SEND_MESSAGES'));
});

test('Preset "Verbergen" verbietet nur das Sehen', () => {
  const p = PRESETS.hide;
  assert.deepEqual(p.allow, []);
  assert.deepEqual(p.deny, ['VIEW_CHANNEL']);
});

test('Preset "Zurücksetzen" ist als Entfernen gekennzeichnet', () => {
  assert.equal(PRESETS.reset.remove, true);
});

test('Jedes Preset hat Beschriftung und Erklärung', () => {
  for (const [key, p] of Object.entries(PRESETS)) {
    assert.ok(p.label, `${key} hat keine Beschriftung`);
    assert.ok(p.description, `${key} hat keine Erklärung`);
  }
});

test('Verbergen überschreibt ein vorher erlaubtes Sehen', () => {
  const existing = { allow: String(VIEW | SEND), deny: '0' };
  const r = mergeOverwrite(existing, bitsFrom(PRESETS.hide.allow), bitsFrom(PRESETS.hide.deny));
  assert.equal(BigInt(r.allow) & VIEW, 0n, 'Sehen darf nicht mehr erlaubt sein');
  assert.ok(BigInt(r.deny) & VIEW, 'Sehen muss verboten sein');
  assert.ok(BigInt(r.allow) & SEND, 'nicht betroffene Rechte bleiben');
});
