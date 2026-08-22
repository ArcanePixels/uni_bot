import { test } from 'node:test';
import assert from 'node:assert/strict';
import { checkConsistency, checkPlausibility } from '../src/lib/consistency.js';

const channels = [
  { id: 'c1', name: 'willkommen' },
  { id: 'c2', name: 'mod-log' },
  { id: 'c3', name: 'allgemein' },
];
const roles = [
  { id: 'r1', name: 'Moderator' },
  { id: 'r2', name: 'Mitglied' },
];

const clean = {
  settings: {
    automod: { logChannelId: 'c2', exemptRoles: ['r1'] },
    welcome: { channelId: 'c1', autoroleIds: ['r2'] },
  },
  channels,
  roles,
};

test('Saubere Konfiguration ergibt keinen Befund', () => {
  assert.deepEqual(checkConsistency(clean), []);
});

test('Findet gelöschten Mod-Log-Kanal', () => {
  const r = checkConsistency({
    ...clean,
    settings: { ...clean.settings, automod: { logChannelId: 'weg', exemptRoles: [] } },
  });
  assert.equal(r.length, 1);
  assert.match(r[0].where, /Mod-Log/);
  assert.match(r[0].message, /existiert nicht mehr/);
});

test('Findet gelöschte Rolle', () => {
  const r = checkConsistency({
    ...clean,
    settings: { ...clean.settings, welcome: { channelId: 'c1', autoroleIds: ['r2', 'weg'] } },
  });
  assert.equal(r.length, 1);
  assert.match(r[0].where, /Beitritt/);
});

test('Zählt mehrere fehlende Rollen zusammen', () => {
  const r = checkConsistency({
    ...clean,
    settings: { ...clean.settings, welcome: { channelId: 'c1', autoroleIds: ['x', 'y'] } },
  });
  assert.match(r[0].message, /2 verknüpfte Rollen/);
});

test('Findet Zielkanal eines geplanten Posts, der weg ist', () => {
  const r = checkConsistency({
    ...clean,
    scheduled: [{ id: 7, enabled: 1, channel_id: 'weg' }],
  });
  assert.equal(r.length, 1);
  assert.match(r[0].where, /#7/);
});

test('Deaktivierte Posts werden nicht bemängelt', () => {
  const r = checkConsistency({
    ...clean,
    scheduled: [{ id: 7, enabled: 0, channel_id: 'weg' }],
  });
  assert.deepEqual(r, []);
});

test('Findet Zielkanal eines YouTube-Feeds, der weg ist', () => {
  const r = checkConsistency({
    ...clean,
    feeds: [{ id: 1, enabled: 1, channel_id: 'weg', yt_channel_id: 'UCtest' }],
  });
  assert.equal(r.length, 1);
  assert.match(r[0].where, /UCtest/);
});

test('Nicht gesetzte Verknüpfungen sind kein Fehler', () => {
  const r = checkConsistency({
    settings: { automod: { logChannelId: null, exemptRoles: [] }, welcome: { channelId: null, autoroleIds: [] } },
    channels,
    roles,
  });
  assert.deepEqual(r, []);
});

test('Verträgt fehlende Abschnitte', () => {
  assert.doesNotThrow(() => checkConsistency({ settings: {}, channels, roles }));
});

// --- Plausibilität ---------------------------------------------------------

test('Warnt, wenn die Begrüßung in einen Log-Kanal geht', () => {
  const r = checkPlausibility({
    settings: { welcome: { channelId: 'c2' }, automod: {} },
    channels,
  });
  assert.equal(r.length, 1);
  assert.match(r[0].message, /mod-log/);
});

test('Warnt, wenn Automod-Meldungen öffentlich landen', () => {
  const r = checkPlausibility({
    settings: { welcome: {}, automod: { logChannelId: 'c3' } },
    channels,
  });
  assert.equal(r.length, 1);
  assert.match(r[0].hint, /sichtbar/);
});

test('Warnt, wenn beide denselben Kanal nutzen', () => {
  const r = checkPlausibility({
    settings: { welcome: { channelId: 'c1' }, automod: { logChannelId: 'c1' } },
    channels,
  });
  assert.ok(r.some((x) => x.where.includes('Willkommen & Automod')), JSON.stringify(r));
});

test('Sinnvolle Zuordnung erzeugt keine Warnung', () => {
  assert.deepEqual(
    checkPlausibility({
      settings: { welcome: { channelId: 'c1' }, automod: { logChannelId: 'c2' } },
      channels,
    }),
    [],
  );
});
