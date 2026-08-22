import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildOverview, collectWarnings, nextRun } from '../src/lib/overview.js';

const NOW = 1_800_000_000_000; // fester Zeitpunkt, damit Tests reproduzierbar sind
const nowSec = Math.floor(NOW / 1000);

const baseSettings = {
  automod: { enabled: true, badWords: ['dumm'], spam: { enabled: true }, links: { enabled: false, whitelist: [] } },
  welcome: { enabled: false, autoroleIds: [] },
};

const empty = { settings: baseSettings, infractions: [], scheduled: [], feeds: [], now: NOW };

test('Zählt Verstöße der letzten Woche und von heute getrennt', () => {
  const infractions = [
    { user_id: 'a', rule: 'spam', created_at: nowSec - 3600 },        // heute
    { user_id: 'a', rule: 'spam', created_at: nowSec - 3 * 86400 },   // diese Woche
    { user_id: 'b', rule: 'link', created_at: nowSec - 20 * 86400 },  // zu alt
  ];
  const o = buildOverview({ ...empty, infractions });
  assert.equal(o.infractionsWeek, 2);
  assert.equal(o.infractionsToday, 1);
  assert.deepEqual(o.byRule, { spam: 2 });
});

test('Erkennt Wiederholungstäter', () => {
  const infractions = [
    { user_id: 'a', rule: 'spam', created_at: nowSec - 100 },
    { user_id: 'a', rule: 'spam', created_at: nowSec - 200 },
    { user_id: 'a', rule: 'link', created_at: nowSec - 300 },
    { user_id: 'b', rule: 'spam', created_at: nowSec - 400 },
  ];
  const o = buildOverview({ ...empty, infractions });
  assert.equal(o.repeatOffenders, 1, 'nur "a" ist mehrfach auffällig');
  assert.deepEqual(o.topOffender, ['a', 3]);
});

test('Findet den nächsten geplanten Post', () => {
  const scheduled = [
    { id: 1, enabled: 1, cron: null, run_at: nowSec + 7200 },
    { id: 2, enabled: 1, cron: null, run_at: nowSec + 600 },
    { id: 3, enabled: 0, cron: null, run_at: nowSec + 60 }, // deaktiviert
  ];
  const o = buildOverview({ ...empty, scheduled });
  assert.equal(o.activePosts, 2);
  assert.equal(o.nextPost.post.id, 2, 'der frühere aktive Post gewinnt');
});

test('Vergangene Einmal-Posts zählen nicht als nächster', () => {
  const scheduled = [{ id: 1, enabled: 1, cron: null, run_at: nowSec - 3600 }];
  const o = buildOverview({ ...empty, scheduled });
  assert.equal(o.nextPost, null);
});

test('nextRun rechnet Cron-Ausdrücke aus', () => {
  const at = nextRun({ cron: '0 * * * *', run_at: null }, nowSec);
  assert.ok(at > nowSec, 'muss in der Zukunft liegen');
  assert.ok(at - nowSec <= 3600, 'stündlich heißt höchstens eine Stunde entfernt');
});

test('nextRun verkraftet kaputte Cron-Ausdrücke', () => {
  assert.equal(nextRun({ cron: 'voelliger unsinn', run_at: null }, nowSec), null);
});

test('Warnt, wenn Automod an ist aber keine Regel greift', () => {
  const w = collectWarnings({
    settings: { automod: { enabled: true, badWords: [], spam: { enabled: false }, links: { enabled: false } }, welcome: {} },
    scheduled: [],
    feeds: [],
  });
  assert.ok(w.some((x) => x.includes('keine einzige Regel')), w.join(' | '));
});

test('Warnt bei leerer Link-Whitelist - das loescht sonst jeden Link', () => {
  const w = collectWarnings({
    settings: { automod: { enabled: true, badWords: ['x'], links: { enabled: true, whitelist: [] } }, welcome: {} },
    scheduled: [],
    feeds: [],
  });
  assert.ok(w.some((x) => x.includes('JEDER Link')), w.join(' | '));
});

test('Warnt bei Willkommen ohne Kanal und ohne Rolle', () => {
  const w = collectWarnings({
    settings: { automod: {}, welcome: { enabled: true, channelId: null, autoroleIds: [] } },
    scheduled: [],
    feeds: [],
  });
  assert.ok(w.some((x) => x.includes('weder Kanal noch Rolle')), w.join(' | '));
});

test('Warnt bei automatisch deaktivierten Posts', () => {
  const w = collectWarnings({
    settings: { automod: {}, welcome: {} },
    scheduled: [{ enabled: 0, last_run_at: 123 }],
    feeds: [],
  });
  assert.ok(w.some((x) => x.includes('deaktiviert')), w.join(' | '));
});

test('Keine Warnung bei sauberer Konfiguration', () => {
  const w = collectWarnings({
    settings: {
      automod: { enabled: true, badWords: ['x'], spam: { enabled: true }, links: { enabled: true, whitelist: ['youtube.com'] } },
      welcome: { enabled: true, channelId: '1', autoroleIds: ['2'] },
    },
    scheduled: [],
    feeds: [],
  });
  assert.deepEqual(w, []);
});

test('Verträgt fehlende Abschnitte in den Einstellungen', () => {
  const o = buildOverview({ ...empty, settings: {} });
  assert.equal(o.automodOn, false);
  assert.equal(o.badWordCount, 0);
  assert.equal(o.autoroleCount, 0);
});
