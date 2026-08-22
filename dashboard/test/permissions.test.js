import { test } from 'node:test';
import assert from 'node:assert/strict';
import { canManageGuild, manageableGuilds, PERMISSION } from '../src/lib/permissions.js';
import { getPath, setPath, isFieldVisible } from '@allrounder/shared/settings-schema';

const ADMIN = String(PERMISSION.ADMINISTRATOR);
const MANAGE = String(PERMISSION.MANAGE_GUILD);
const SEND_MESSAGES = String(1n << 11n); // harmlose Berechtigung

test('Administrator darf verwalten', () => {
  assert.equal(canManageGuild({ permissions: ADMIN }), true);
});

test('"Server verwalten" darf verwalten', () => {
  assert.equal(canManageGuild({ permissions: MANAGE }), true);
});

test('Owner darf immer verwalten', () => {
  assert.equal(canManageGuild({ owner: true, permissions: '0' }), true);
});

test('Normales Mitglied darf nicht verwalten', () => {
  assert.equal(canManageGuild({ permissions: SEND_MESSAGES }), false);
  assert.equal(canManageGuild({ permissions: '0' }), false);
});

test('Fehlende oder kaputte Berechtigungen gelten als "nicht erlaubt"', () => {
  assert.equal(canManageGuild({}), false);
  assert.equal(canManageGuild(null), false);
  assert.equal(canManageGuild({ permissions: 'keine-zahl' }), false);
  // Zahl statt String (falsches Format aus einer alten API) darf nicht durchrutschen.
  assert.equal(canManageGuild({ permissions: 8 }), false);
});

test('Sehr grosse Permission-Bits werden korrekt gelesen', () => {
  // Kombination aus Admin und vielen weiteren Rechten - sprengt Number.
  const combined = String(PERMISSION.ADMINISTRATOR | (1n << 46n));
  assert.equal(canManageGuild({ permissions: combined }), true);
});

test('manageableGuilds filtert korrekt', () => {
  const list = [
    { id: '1', permissions: ADMIN },
    { id: '2', permissions: SEND_MESSAGES },
    { id: '3', owner: true, permissions: '0' },
  ];
  assert.deepEqual(manageableGuilds(list).map((g) => g.id), ['1', '3']);
});

test('manageableGuilds vertraegt Unsinn als Eingabe', () => {
  assert.deepEqual(manageableGuilds(null), []);
  assert.deepEqual(manageableGuilds(undefined), []);
});

test('getPath liest verschachtelte Werte', () => {
  const o = { a: { b: { c: 5 } } };
  assert.equal(getPath(o, 'a.b.c'), 5);
  assert.equal(getPath(o, 'a.x.c'), undefined);
});

test('setPath aendert das Original nicht', () => {
  const o = { spam: { enabled: true, max: 5 } };
  const next = setPath(o, 'spam.max', 9);
  assert.equal(next.spam.max, 9);
  assert.equal(o.spam.max, 5, 'Original muss unveraendert bleiben');
  assert.equal(next.spam.enabled, true, 'Nachbarwerte bleiben erhalten');
});

test('isFieldVisible folgt dependsOn', () => {
  const values = { links: { enabled: false }, spam: { enabled: true } };
  assert.equal(isFieldVisible({ dependsOn: 'links.enabled' }, values), false);
  assert.equal(isFieldVisible({ dependsOn: 'spam.enabled' }, values), true);
  assert.equal(isFieldVisible({}, values), true, 'ohne dependsOn immer sichtbar');
});
