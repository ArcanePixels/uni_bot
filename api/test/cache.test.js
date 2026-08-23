import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { __test__, invalidateGuild } from '../src/discord.js';

const { cache, inFlight, cached, CACHE_MS, clear } = __test__;

beforeEach(() => clear());

test('Ein zweiter Aufruf kommt aus dem Zwischenspeicher', async () => {
  let calls = 0;
  const loader = async () => {
    calls++;
    return ['a'];
  };

  await cached('channels:1', loader);
  await cached('channels:1', loader);
  await cached('channels:1', loader);

  assert.equal(calls, 1, 'Discord darf nur einmal gefragt werden');
});

test('Parallele Aufrufe lösen nur eine Abfrage aus', async () => {
  // Genau der Fall auf jeder Seite: Promise.all fragt mehrere Dinge auf einmal.
  let calls = 0;
  const loader = async () => {
    calls++;
    await new Promise((r) => setTimeout(r, 20));
    return 'wert';
  };

  const results = await Promise.all([
    cached('roles:1', loader),
    cached('roles:1', loader),
    cached('roles:1', loader),
  ]);

  assert.equal(calls, 1, 'drei gleichzeitige Aufrufe, aber nur eine Abfrage');
  assert.deepEqual(results, ['wert', 'wert', 'wert']);
});

test('Verschiedene Server werden getrennt gehalten', async () => {
  let calls = 0;
  const loader = async () => {
    calls++;
    return calls;
  };

  await cached('channels:1', loader);
  await cached('channels:2', loader);
  assert.equal(calls, 2);
});

test('Die Cache-Dauer richtet sich nach der Art der Daten', async () => {
  const loader = async () => 'x';
  await cached('guild:1', loader);
  await cached('members:1', loader);

  const guildTtl = cache.get('guild:1').until - Date.now();
  const memberTtl = cache.get('members:1').until - Date.now();

  assert.ok(guildTtl > memberTtl, 'Serverdaten dürfen länger gelten als Mitgliederlisten');
  assert.ok(guildTtl > 8 * 60_000, `Serverdaten sollten ~10 Min gelten, sind aber ${guildTtl}ms`);
  assert.ok(memberTtl > 60_000, `Mitglieder sollten ~2 Min gelten, sind aber ${memberTtl}ms`);
});

test('Unbekannte Arten bekommen die Standarddauer', async () => {
  await cached('irgendwas:1', async () => 'x');
  const ttl = cache.get('irgendwas:1').until - Date.now();
  assert.ok(ttl > 4 * 60_000, 'sollte auf die Standarddauer fallen');
});

test('Ein Fehler wird nicht zwischengespeichert', async () => {
  let calls = 0;
  const failing = async () => {
    calls++;
    throw new Error('Discord kaputt');
  };

  await assert.rejects(() => cached('channels:9', failing));
  await assert.rejects(() => cached('channels:9', failing));

  assert.equal(calls, 2, 'nach einem Fehler muss erneut versucht werden');
  assert.equal(inFlight.size, 0, 'die laufende Abfrage muss aufgeräumt sein');
});

test('invalidateGuild ohne Einschränkung wirft alles weg', async () => {
  const loader = async () => 'x';
  await cached('channels:5', loader);
  await cached('roles:5', loader);
  await cached('members:5', loader);

  invalidateGuild('5');
  assert.equal(cache.size, 0);
});

test('invalidateGuild kann gezielt nur eine Art verwerfen', async () => {
  const loader = async () => 'x';
  await cached('channels:5', loader);
  await cached('roles:5', loader);
  await cached('members:5', loader);

  invalidateGuild('5', ['members']);

  assert.equal(cache.has('members:5'), false, 'Mitglieder mussten weg');
  assert.equal(cache.has('channels:5'), true, 'Kanäle sind von einem Kick nicht betroffen');
  assert.equal(cache.has('roles:5'), true, 'Rollen ebenso wenig');
});

test('invalidateGuild lässt andere Server unangetastet', async () => {
  const loader = async () => 'x';
  await cached('channels:5', loader);
  await cached('channels:6', loader);

  invalidateGuild('5');
  assert.equal(cache.has('channels:6'), true);
});

test('invalidateGuild erfasst auch die erweiterte Kanalliste', async () => {
  const loader = async () => 'x';
  await cached('channels:all:5', loader);
  invalidateGuild('5', ['channels']);
  assert.equal(cache.has('channels:all:5'), false);
});

test('Abgelaufene Einträge werden neu geholt', async () => {
  let calls = 0;
  const loader = async () => {
    calls++;
    return calls;
  };

  await cached('channels:7', loader);
  // Ablauf vorziehen statt Minuten zu warten.
  cache.get('channels:7').until = Date.now() - 1;
  await cached('channels:7', loader);

  assert.equal(calls, 2);
});

/**
 * Arten, die bewusst kurz zwischengespeichert werden - mit Begruendung.
 *
 * Jede Ausnahme hier muss verdient sein: Zu kurze Dauern waren die Ursache der
 * Drosselung durch Discord.
 */
const KURZ_ERLAUBT = {
  // Rechte werden geprueft, waehrend jemand sie gerade in Discord aendert und
  // im Dashboard nachsieht, ob es gewirkt hat. Bei fuenf Minuten sieht er
  // minutenlang den alten Stand und dreht an Rechten, die laengst passen -
  // genau das ist passiert. Vertretbar, weil die Abfragen nur auf der
  // Plugin-Seite laufen, nicht im Layout und nicht bei jeder Aktion.
  perms: 10_000,
};

test('Alle Arten haben eine Dauer über einer Minute', () => {
  // Zu kurze Dauern waren die Ursache der Drosselung.
  for (const [kind, ms] of Object.entries(CACHE_MS)) {
    if (kind in KURZ_ERLAUBT) continue;
    assert.ok(ms >= 60_000, `${kind} ist mit ${ms}ms zu kurz`);
  }
});

test('Die kurzen Ausnahmen sind genau die dokumentierten', () => {
  // Damit niemand versehentlich eine weitere Art kurz setzt, ohne sie oben
  // zu begruenden.
  const kurz = Object.entries(CACHE_MS)
    .filter(([, ms]) => ms < 60_000)
    .map(([kind]) => kind)
    .sort();
  assert.deepEqual(kurz, Object.keys(KURZ_ERLAUBT).sort());
});

test('Auch die Ausnahmen bleiben ueber einer Sekunde', () => {
  // Sonst waere der Zwischenspeicher wirkungslos und ein Seitenaufbau
  // loeste mehrere Anfragen aus.
  for (const [kind, ms] of Object.entries(KURZ_ERLAUBT)) {
    assert.ok(CACHE_MS[kind] >= 5_000, `${kind} ist mit ${CACHE_MS[kind]}ms zu kurz`);
  }
});
