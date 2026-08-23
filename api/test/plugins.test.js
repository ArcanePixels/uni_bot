import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';
import { ensureSchema } from '@allrounder/shared/schema';
import { createApp } from '../src/app.js';

/**
 * Die generischen Plugin-Endpunkte.
 *
 * Das ist der wichtigste Test des Plugin-Systems: Was hier funktioniert,
 * funktioniert fuer jedes Plugin - ohne dass jemand dafuer API-Code schreibt.
 * Deshalb laeuft das hier gegen ein erfundenes Test-Plugin und nicht gegen
 * "Regeln": Es soll sich nichts einschleichen, was nur fuer das eine Plugin gilt.
 */

const TOKEN = 'plugin-test-token';
let server, base;
const db = new Database(':memory:');

/** Ein Test-Plugin, das moeglichst viele Bausteine benutzt. */
const TESTPLUGIN = {
  name: 'demo',
  dir: '/nicht/vorhanden',
  botPath: null,
  apiPath: null,
  manifest: {
    name: 'demo',
    label: 'Demo',
    ui: {
      sections: [
        {
          type: 'form',
          title: 'Einstellungen',
          fields: [
            { key: 'channel_id', label: 'Kanal', type: 'channel' },
            { key: 'title', label: 'Titel', type: 'text', default: 'Standard', maxLength: 50 },
            { key: 'color', label: 'Farbe', type: 'color', default: '#5865f2' },
            { key: 'anzahl', label: 'Anzahl', type: 'number', min: 1, max: 10 },
            { key: 'aktiv', label: 'Aktiv', type: 'boolean' },
            {
              key: 'modus',
              label: 'Modus',
              type: 'select',
              options: [
                { value: 'a', label: 'A' },
                { value: 'b', label: 'B' },
              ],
            },
          ],
        },
        {
          type: 'list',
          key: 'items',
          title: 'Eintraege',
          max: 3,
          fields: [
            { key: 'icon', label: 'Symbol', type: 'emoji' },
            { key: 'title', label: 'Ueberschrift', type: 'text', required: true },
          ],
        },
        {
          type: 'actions',
          actions: [
            {
              key: 'publish',
              label: 'Posten',
              requires: ['channel_id'],
              requiresList: 'items',
            },
          ],
        },
      ],
    },
  },
};

before(async () => {
  ensureSchema(db);
  server = createApp(db, TOKEN, null, null, [TESTPLUGIN]).listen(0);
  await new Promise((r) => server.once('listening', r));
  base = `http://127.0.0.1:${server.address().port}`;
});

after(() => {
  server.close();
  db.close();
});

const auth = () => ({ Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' });
const get = (p) => fetch(base + p, { headers: auth() });
const post = (p, b) =>
  fetch(base + p, { method: 'POST', headers: auth(), body: JSON.stringify(b ?? {}) });
const put = (p, b) =>
  fetch(base + p, { method: 'PUT', headers: auth(), body: JSON.stringify(b) });
const del = (p) => fetch(base + p, { method: 'DELETE', headers: auth() });

// --- Auflistung -----------------------------------------------------------

test('Die Plugin-Liste nennt das Plugin samt Oberflaeche', async () => {
  const { plugins } = await (await get('/api/guilds/plugins')).json();
  assert.equal(plugins.length, 1);
  assert.equal(plugins[0].name, 'demo');
  assert.equal(plugins[0].label, 'Demo');
  assert.ok(plugins[0].ui.sections.length === 3, 'die Oberflaeche muss mitkommen');
});

test('Die Liste verraet keine Dateipfade', async () => {
  const roh = await (await get('/api/guilds/plugins')).text();
  // Der Browser hat mit dem Dateisystem des Servers nichts zu tun.
  assert.ok(!roh.includes('/nicht/vorhanden'), 'Pfade duerfen nicht nach aussen');
  assert.ok(!roh.includes('botPath'));
});

test('Ein unbekanntes Plugin ergibt 404', async () => {
  assert.equal((await get('/api/guilds/g1/p/gibtsnicht')).status, 404);
  assert.equal((await put('/api/guilds/g1/p/gibtsnicht/config', {})).status, 404);
});

// --- Einstellungen --------------------------------------------------------

test('Die Einstellungen entstehen mit den Standardwerten', async () => {
  const res = await get('/api/guilds/g1/p/demo');
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.config.title, 'Standard');
  assert.equal(body.config.color, '#5865f2');
  assert.deepEqual(body.lists.items, []);
});

test('Einstellungen speichern und wieder lesen', async () => {
  assert.equal(
    (await put('/api/guilds/g1/p/demo/config', { title: 'Meins', anzahl: 5, aktiv: true })).status,
    200,
  );
  const { config } = await (await get('/api/guilds/g1/p/demo')).json();
  assert.equal(config.title, 'Meins');
  assert.equal(config.anzahl, 5);
  assert.equal(config.aktiv, 1, 'Wahrheitswerte liegen als 0/1 in der Datenbank');
});

test('Werte werden gegen das Manifest geprueft', async () => {
  const faelle = [
    [{ color: 'knallrot' }, /Hex/],
    [{ anzahl: 99 }, /groesster Wert/],
    [{ anzahl: 0 }, /kleinster Wert/],
    [{ anzahl: 'viele' }, /Zahl/],
    [{ modus: 'z' }, /Auswahl/],
    [{ title: 'x'.repeat(60) }, /50 Zeichen/],
  ];
  for (const [koerper, muster] of faelle) {
    const res = await put('/api/guilds/g1/p/demo/config', koerper);
    assert.equal(res.status, 400, `${JSON.stringify(koerper)} haette abgewiesen werden muessen`);
    assert.match((await res.json()).error, muster);
  }
});

test('Ein unbekanntes Feld wird abgewiesen statt still verworfen', async () => {
  // Sonst waere der Wert weg und niemand wuesste warum.
  const res = await put('/api/guilds/g1/p/demo/config', { gibtsnicht: 'x' });
  assert.equal(res.status, 400);
  assert.match((await res.json()).error, /Unbekannte Felder/);
});

// --- Listen ---------------------------------------------------------------

test('Eintrag anlegen, aendern, loeschen', async () => {
  const angelegt = await post('/api/guilds/g2/p/demo/list/items', { icon: '📜', title: 'Erster' });
  assert.equal(angelegt.status, 201);
  const { id } = await angelegt.json();

  let { lists } = await (await get('/api/guilds/g2/p/demo')).json();
  assert.equal(lists.items.length, 1);
  assert.equal(lists.items[0].icon, '📜');

  assert.equal((await put(`/api/guilds/g2/p/demo/list/items/${id}`, { title: 'Neu' })).status, 200);
  ({ lists } = await (await get('/api/guilds/g2/p/demo')).json());
  assert.equal(lists.items[0].title, 'Neu');
  assert.equal(lists.items[0].icon, '📜', 'nicht mitgeschickte Felder bleiben');

  assert.equal((await del(`/api/guilds/g2/p/demo/list/items/${id}`)).status, 204);
});

test('Pflichtfelder werden erzwungen', async () => {
  const res = await post('/api/guilds/g2/p/demo/list/items', { icon: '📜' });
  assert.equal(res.status, 400);
  assert.match((await res.json()).error, /Pflichtfeld/);
});

test('Die Obergrenze einer Liste gilt', async () => {
  for (let i = 0; i < 3; i++) {
    assert.equal(
      (await post('/api/guilds/g3/p/demo/list/items', { title: `Nr ${i}` })).status,
      201,
    );
  }
  const zuviel = await post('/api/guilds/g3/p/demo/list/items', { title: 'Einer zuviel' });
  assert.equal(zuviel.status, 400);
  assert.match((await zuviel.json()).error, /3/);
});

test('Eine unbekannte Liste ergibt 400', async () => {
  const res = await post('/api/guilds/g3/p/demo/list/gibtsnicht', { title: 'X' });
  assert.equal(res.status, 400);
});

test('Sortieren nach oben und unten', async () => {
  for (const t of ['A', 'B', 'C']) await post('/api/guilds/g4/p/demo/list/items', { title: t });
  const titel = async () =>
    (await (await get('/api/guilds/g4/p/demo')).json()).lists.items.map((r) => r.title);
  assert.deepEqual(await titel(), ['A', 'B', 'C']);

  const { lists } = await (await get('/api/guilds/g4/p/demo')).json();
  const idC = lists.items[2].id;
  await post(`/api/guilds/g4/p/demo/list/items/${idC}/move`, { direction: 'up' });
  assert.deepEqual(await titel(), ['A', 'C', 'B']);

  await post(`/api/guilds/g4/p/demo/list/items/${idC}/move`, { direction: 'down' });
  assert.deepEqual(await titel(), ['A', 'B', 'C'], 'wieder wie vorher');
});

test('Ueber den Rand hinaus sortieren aendert nichts', async () => {
  const { lists } = await (await get('/api/guilds/g4/p/demo')).json();
  const res = await post(`/api/guilds/g4/p/demo/list/items/${lists.items[0].id}/move`, {
    direction: 'up',
  });
  assert.equal(res.status, 200);
  assert.equal((await res.json()).unveraendert, true);
});

test('Sortieren braucht eine gueltige Richtung', async () => {
  const { lists } = await (await get('/api/guilds/g4/p/demo')).json();
  const res = await post(`/api/guilds/g4/p/demo/list/items/${lists.items[0].id}/move`, {
    direction: 'seitwaerts',
  });
  assert.equal(res.status, 400);
});

// --- Trennung der Server --------------------------------------------------

test('Ein fremder Eintrag ist nicht erreichbar', async () => {
  const { id } = await (
    await post('/api/guilds/g5/p/demo/list/items', { title: 'Geheim' })
  ).json();

  // Weder aendern noch loeschen, auch wenn man die id kennt.
  assert.equal((await put(`/api/guilds/g6/p/demo/list/items/${id}`, { title: 'X' })).status, 404);
  assert.equal((await del(`/api/guilds/g6/p/demo/list/items/${id}`)).status, 404);
  assert.equal(
    (await post(`/api/guilds/g6/p/demo/list/items/${id}/move`, { direction: 'up' })).status,
    404,
  );

  const { lists } = await (await get('/api/guilds/g5/p/demo')).json();
  assert.equal(lists.items[0].title, 'Geheim', 'der Eintrag muss unveraendert sein');
});

test('Einstellungen sind je Server getrennt', async () => {
  await put('/api/guilds/g7/p/demo/config', { title: 'Sieben' });
  const acht = await (await get('/api/guilds/g8/p/demo')).json();
  assert.equal(acht.config.title, 'Standard', 'g8 darf nichts von g7 sehen');
});

// --- Aktionen -------------------------------------------------------------

test('Eine Aktion prueft ihre Voraussetzungen', async () => {
  const ohneKanal = await post('/api/guilds/g9/p/demo/action/publish');
  assert.equal(ohneKanal.status, 400);
  assert.match((await ohneKanal.json()).error, /Kanal/);

  await put('/api/guilds/g9/p/demo/config', { channelId: undefined, channel_id: '123' });
  const ohneEintrag = await post('/api/guilds/g9/p/demo/action/publish');
  assert.equal(ohneEintrag.status, 400);
  assert.match((await ohneEintrag.json()).error, /kein Eintrag/);
});

test('Eine erfuellte Aktion markiert den Server fuer den Bot', async () => {
  await post('/api/guilds/g9/p/demo/list/items', { title: 'Da' });
  db.prepare("UPDATE plugin_demo_config SET dirty = 0 WHERE guild_id = 'g9'").run();

  const res = await post('/api/guilds/g9/p/demo/action/publish');
  assert.equal(res.status, 200);
  assert.equal(
    db.prepare("SELECT dirty FROM plugin_demo_config WHERE guild_id = 'g9'").get().dirty,
    1,
    'der Bot muss taetig werden',
  );
});

test('Eine unbekannte Aktion ergibt 404', async () => {
  assert.equal((await post('/api/guilds/g9/p/demo/action/gibtsnicht')).status, 404);
});

// --- Zugriffsschutz -------------------------------------------------------

test('Alle Plugin-Endpunkte brauchen den Token', async () => {
  const ohne = [
    ['GET', '/api/guilds/plugins'],
    ['GET', '/api/guilds/g1/p/demo'],
    ['PUT', '/api/guilds/g1/p/demo/config'],
    ['POST', '/api/guilds/g1/p/demo/list/items'],
    ['DELETE', '/api/guilds/g1/p/demo/list/items/1'],
    ['POST', '/api/guilds/g1/p/demo/action/publish'],
  ];
  for (const [method, pfad] of ohne) {
    const res = await fetch(base + pfad, { method });
    assert.equal(res.status, 401, `${method} ${pfad} war ungeschuetzt`);
  }
});

// --- Ohne Plugins ---------------------------------------------------------

// --- Rechte-Anzeige -------------------------------------------------------

test('Ohne Bot-Token gibt es keinen Rechte-Status', async () => {
  // Die Seite muss trotzdem laden - der Status ist Beiwerk.
  const body = await (await get('/api/guilds/g1/p/demo')).json();
  assert.equal(body.rechte, null);
  assert.ok(body.config, 'die Daten muessen trotzdem kommen');
});

test('Ohne Bot-Token bleibt die Seite benutzbar', async () => {
  // Regressionsschutz: Faellt die Rechtepruefung aus, darf sie nicht die
  // ganze Seite mitreissen.
  const res = await get('/api/guilds/g1/p/demo');
  assert.equal(res.status, 200);
});

test('Ohne Plugins laeuft die API normal weiter', async () => {
  const leer = new Database(':memory:');
  ensureSchema(leer);
  const srv = createApp(leer, TOKEN, null).listen(0);
  await new Promise((r) => srv.once('listening', r));
  const url = `http://127.0.0.1:${srv.address().port}`;

  const res = await fetch(`${url}/api/guilds/plugins`, { headers: auth() });
  assert.equal(res.status, 200);
  assert.deepEqual((await res.json()).plugins, []);

  assert.equal((await fetch(`${url}/health`)).status, 200, 'der Rest muss weiterlaufen');
  srv.close();
  leer.close();
});
