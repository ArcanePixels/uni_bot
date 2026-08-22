import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { getUserGuildsCached, invalidateUserGuilds, __test__ } from '../src/lib/guild-cache.js';

const { guildCache, inFlight, GUILD_CACHE_MS, clear } = __test__;

const realFetch = globalThis.fetch;
let calls;

beforeEach(() => {
  clear();
  calls = 0;
});

afterEach(() => {
  globalThis.fetch = realFetch;
});

/** Tut so, als käme die Antwort von Discord. */
function mockDiscord(guilds = [{ id: '1', name: 'Server', permissions: '8' }]) {
  globalThis.fetch = async () => {
    calls++;
    return new Response(JSON.stringify(guilds), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  };
}

test('Ein zweiter Aufruf kommt aus dem Zwischenspeicher', async () => {
  mockDiscord();
  await getUserGuildsCached('user1', 'token');
  await getUserGuildsCached('user1', 'token');
  await getUserGuildsCached('user1', 'token');
  assert.equal(calls, 1, 'Discord darf nur einmal gefragt werden');
});

test('Parallele Aufrufe lösen nur eine Abfrage aus', async () => {
  // Genau der Fall beim Speichern: Action und Seitenaufbau fragen gleichzeitig.
  globalThis.fetch = async () => {
    calls++;
    await new Promise((r) => setTimeout(r, 20));
    return new Response(JSON.stringify([{ id: '1', permissions: '8' }]), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  };

  await Promise.all([
    getUserGuildsCached('user1', 'token'),
    getUserGuildsCached('user1', 'token'),
    getUserGuildsCached('user1', 'token'),
  ]);
  assert.equal(calls, 1);
});

test('Nutzer werden strikt getrennt', async () => {
  // Sicherheitskritisch: Der Eintrag eines Nutzers darf niemals für einen
  // anderen gelten, sonst würde jemand fremde Rechte erben.
  globalThis.fetch = async () => {
    calls++;
    return new Response(JSON.stringify([{ id: `guild-${calls}`, permissions: '8' }]), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  };

  const a = await getUserGuildsCached('userA', 'tokenA');
  const b = await getUserGuildsCached('userB', 'tokenB');

  assert.equal(calls, 2, 'für jeden Nutzer muss einzeln gefragt werden');
  assert.notDeepEqual(a, b, 'die Listen dürfen sich nicht vermischen');
});

test('Die Aufbewahrung ist kurz genug, damit entzogene Rechte greifen', () => {
  assert.ok(
    GUILD_CACHE_MS <= 120_000,
    `Rechte dürfen höchstens zwei Minuten nachwirken, sind aber ${GUILD_CACHE_MS}ms`,
  );
});

test('Abgelaufene Einträge werden neu geholt', async () => {
  mockDiscord();
  await getUserGuildsCached('user1', 'token');
  guildCache.get('user1').until = Date.now() - 1;
  await getUserGuildsCached('user1', 'token');
  assert.equal(calls, 2);
});

test('invalidateUserGuilds verwirft gezielt einen Nutzer', async () => {
  mockDiscord();
  await getUserGuildsCached('userA', 'token');
  await getUserGuildsCached('userB', 'token');

  invalidateUserGuilds('userA');
  assert.equal(guildCache.has('userA'), false);
  assert.equal(guildCache.has('userB'), true, 'der andere Nutzer bleibt');
});

test('invalidateUserGuilds ohne Angabe verwirft alles', async () => {
  mockDiscord();
  await getUserGuildsCached('userA', 'token');
  await getUserGuildsCached('userB', 'token');
  invalidateUserGuilds();
  assert.equal(guildCache.size, 0);
});

test('Ein Fehler wird nicht zwischengespeichert', async () => {
  globalThis.fetch = async () => {
    calls++;
    return new Response('{}', { status: 500 });
  };

  await assert.rejects(() => getUserGuildsCached('user1', 'token'));
  await assert.rejects(() => getUserGuildsCached('user1', 'token'));

  assert.equal(calls, 2, 'nach einem Fehler muss erneut versucht werden');
  assert.equal(inFlight.size, 0, 'die laufende Abfrage muss aufgeräumt sein');
  assert.equal(guildCache.size, 0, 'nichts darf gespeichert worden sein');
});

test('Bei Drosselung nennt die Meldung die Wartezeit', async () => {
  globalThis.fetch = async () =>
    new Response('{}', { status: 429, headers: { 'retry-after': '7' } });

  await assert.rejects(
    () => getUserGuildsCached('user1', 'token'),
    (err) => {
      assert.equal(err.status, 429);
      assert.match(err.message, /7 Sekunden/);
      return true;
    },
  );
});

test('Eine abgelaufene Sitzung wird als solche gemeldet', async () => {
  globalThis.fetch = async () => new Response('{}', { status: 401 });
  await assert.rejects(
    () => getUserGuildsCached('user1', 'token'),
    (err) => {
      assert.equal(err.status, 401);
      assert.match(err.message, /neu anmelden/);
      return true;
    },
  );
});
