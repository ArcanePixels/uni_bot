import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import Database from 'better-sqlite3';
import { createPluginStore } from '@allrounder/shared/plugin-store';
import plugin, {
  buildEmbed,
  parseColor,
  pruefeGroesse,
  fehlendeRechte,
} from '../../plugins/regeln/bot.js';

/**
 * Das mitgelieferte Regeln-Plugin.
 *
 * Zeigt nebenbei, wie sich ein eigenes Plugin testen laesst: Attrappe fuer
 * `client`, Datenbank im Arbeitsspeicher, Speicher aus dem echten Manifest,
 * und `setup` direkt aufrufen. Eigene Tabellen legt das Plugin nicht mehr an -
 * das macht das Grundsystem nach dem Manifest.
 */

const MANIFEST = JSON.parse(
  readFileSync(new URL('../../plugins/regeln/plugin.json', import.meta.url), 'utf8'),
);

function aufbau({ channelFetch = async () => null, messageFetch = async () => null } = {}) {
  const db = new Database(':memory:');
  const store = createPluginStore(db, MANIFEST);
  const gesendet = [];
  const bearbeitet = [];

  const client = {
    on() {},
    channels: {
      fetch: async (id) => {
        const ch = await channelFetch(id);
        if (!ch) return null;
        return {
          send: async (payload) => {
            gesendet.push(payload);
            return { id: 'neue-nachricht-id' };
          },
          messages: {
            fetch: async (mid) => {
              const m = await messageFetch(mid);
              if (!m) return null;
              return {
                edit: async (payload) => {
                  bearbeitet.push(payload);
                },
              };
            },
          },
          ...ch,
        };
      },
    },
  };

  return { db, store, client, gesendet, bearbeitet, log: { info() {}, error() {} } };
}

/** Wartet, bis der Timer des Plugins einmal gelaufen ist. */
const einDurchlauf = () => new Promise((r) => setTimeout(r, 6500));

// --- Farben ---------------------------------------------------------------

test('parseColor wandelt Hex-Werte um', () => {
  assert.equal(parseColor('#7c5cff'), 0x7c5cff);
  assert.equal(parseColor('7c5cff'), 0x7c5cff, 'auch ohne Raute');
  assert.equal(parseColor('#FFFFFF'), 0xffffff);
});

test('parseColor faellt bei Unsinn auf Discord-Blau zurueck', () => {
  for (const v of ['knallrot', '', null, undefined, '#12345', '#gggggg']) {
    assert.equal(parseColor(v), 0x5865f2, `"${v}" haette den Rueckfall nehmen muessen`);
  }
});

// --- Embed: der Normalfall ohne Ueberschriften ----------------------------

test('Regeln ohne Ueberschrift werden eine schlichte Aufzaehlung', () => {
  // Der haeufigste Fall: ein Satz je Regel, keine Zwischenueberschriften.
  // Discord verlangt fuer jedes Embed-Feld einen Namen - deshalb darf das
  // hier gar nicht ueber Felder laufen.
  const d = buildEmbed({
    title: 'RULES',
    rules: [
      { text: 'Seien Sie cool, freundlich und respektvoll zueinander.' },
      { text: 'Halten Sie Ihr Discord-Profil angemessen.' },
      { text: 'Spam ist nicht erlaubt.' },
    ],
  }).toJSON();

  assert.equal(d.fields?.length ?? 0, 0, 'keine Felder, sonst braeuchte es Namen');
  assert.match(d.description, /\*\*1\.\*\* Seien Sie cool/);
  assert.match(d.description, /\*\*3\.\*\* Spam ist nicht erlaubt\./);
  assert.equal(d.description.split('\n').length, 3, 'eine Zeile je Regel');
});

test('Symbole erscheinen vor der Nummer', () => {
  const d = buildEmbed({
    rules: [{ icon: '🤝', text: 'Respektvoll bleiben.' }, { text: 'Ohne Symbol.' }],
  }).toJSON();
  assert.match(d.description, /^🤝 \*\*1\.\*\* Respektvoll bleiben\./m);
  assert.match(d.description, /^\*\*2\.\*\* Ohne Symbol\./m, 'ohne Symbol nur die Nummer');
});

test('Die Einleitung steht mit Abstand ueber der Aufzaehlung', () => {
  const d = buildEmbed({
    description: 'Bitte lesen.',
    footer: 'ArcanePixels',
    rules: [{ text: 'Erste Regel.' }],
  }).toJSON();
  assert.match(d.description, /^Bitte lesen\.\n\n\*\*1\.\*\* Erste Regel\./);
  assert.equal(d.footer.text, 'ArcanePixels');
});

test('Viele Regeln ohne Ueberschrift sind kein Problem', () => {
  // Die Grenze von 25 gilt nur fuer Felder - eine Aufzaehlung kennt sie nicht.
  const rules = Array.from({ length: 40 }, (_, i) => ({ text: `Regel ${i + 1}.` }));
  const d = buildEmbed({ rules }).toJSON();
  assert.equal(d.fields?.length ?? 0, 0);
  assert.match(d.description, /\*\*40\.\*\* Regel 40\./, 'auch die 40. muss dabei sein');
});

// --- Embed: mit Ueberschriften --------------------------------------------

test('Mit Ueberschriften wird je Regel ein Feld gebaut', () => {
  const d = buildEmbed({
    title: 'Regeln',
    color: '#7c5cff',
    rules: [
      { icon: '🤝', title: 'Respekt', text: 'Freundlich bleiben.' },
      { icon: null, title: 'Ohne Symbol', text: 'Auch ok.' },
    ],
  }).toJSON();

  assert.equal(d.fields.length, 2);
  assert.match(d.fields[0].name, /🤝\s+1\. Respekt/);
  assert.equal(d.fields[1].name, '2. Ohne Symbol', 'ohne Symbol nur die Nummer');
  assert.equal(d.color, 0x7c5cff);
});

test('Eine einzige Ueberschrift schaltet auf Felder um', () => {
  // Sonst ginge die Ueberschrift unter.
  const d = buildEmbed({
    rules: [{ text: 'Ohne.' }, { title: 'Mit Ueberschrift', text: 'Dazu ein Text.' }],
  }).toJSON();
  assert.equal(d.fields.length, 2);
  // Die Regel ohne Ueberschrift braucht trotzdem einen Feldnamen.
  assert.ok(d.fields[0].name.length > 0);
  assert.ok(d.fields[0].value.length > 0, 'ein leerer Wert waere ungueltig');
});

test('Bei Ueberschriften bleibt es bei 25 Feldern', () => {
  // Discords Grenze - mehr wuerde die Nachricht ungueltig machen.
  const rules = Array.from({ length: 40 }, (_, i) => ({ title: `Regel ${i}` }));
  assert.equal(buildEmbed({ rules }).toJSON().fields.length, 25);
});

test('buildEmbed nutzt einen Standardtitel', () => {
  assert.equal(buildEmbed({ title: '   ', rules: [{ text: 'X' }] }).toJSON().title, 'Serverregeln');
});

// --- Groessengrenzen ------------------------------------------------------

test('Zu lange Aufzaehlungen werden vorher gemeldet', () => {
  // Lieber eine klare Meldung als ein von Discord abgelehnter Post.
  const rules = Array.from({ length: 60 }, () => ({ text: 'x'.repeat(100) }));
  const problem = pruefeGroesse({}, rules);
  assert.ok(problem, 'das muesste auffallen');
  assert.match(problem, /4096/);
});

test('Normale Regelwerke gehen glatt durch', () => {
  const rules = Array.from({ length: 15 }, (_, i) => ({ text: `Regel ${i + 1} mit etwas Text.` }));
  assert.equal(pruefeGroesse({}, rules), null);
});

test('Zu viele Regeln mit Ueberschrift werden gemeldet', () => {
  const rules = Array.from({ length: 30 }, (_, i) => ({ title: `R${i}`, text: 'x' }));
  assert.match(pruefeGroesse({}, rules), /25/);
});

// --- Rechte ---------------------------------------------------------------

/** Baut einen Kanal, der die genannten Rechte hat. */
function kanalMit(bits) {
  return {
    name: 'regeln',
    permissionsFor: () => ({ has: (bit) => bits.includes(bit) }),
  };
}

test('Fehlende Rechte werden im Klartext benannt', async () => {
  // Discord meldet nur "Missing Permissions" - das schickt einen auf die
  // falsche Faehrte, naemlich in den Code statt in die Kanaleinstellungen.
  const { PermissionFlagsBits } = await import('discord.js');
  const alle = [
    PermissionFlagsBits.ViewChannel,
    PermissionFlagsBits.SendMessages,
    PermissionFlagsBits.EmbedLinks,
    PermissionFlagsBits.ReadMessageHistory,
  ];

  assert.equal(fehlendeRechte(kanalMit(alle), 'bot'), null, 'mit allen Rechten: kein Problem');

  // "Links einbetten" wird am haeufigsten uebersehen - der Name klingt nicht
  // nach Embeds, ist aber genau dafuer noetig.
  const ohneEmbed = alle.filter((b) => b !== PermissionFlagsBits.EmbedLinks);
  assert.match(fehlendeRechte(kanalMit(ohneEmbed), 'bot'), /Links einbetten/);

  // Ohne Nachrichtenverlauf findet der Bot seine alte Nachricht nicht wieder
  // und postet bei jeder Aenderung eine neue.
  const ohneVerlauf = alle.filter((b) => b !== PermissionFlagsBits.ReadMessageHistory);
  assert.match(fehlendeRechte(kanalMit(ohneVerlauf), 'bot'), /Nachrichtenverlauf/);

  const nurAnsehen = [PermissionFlagsBits.ViewChannel];
  const meldung = fehlendeRechte(kanalMit(nurAnsehen), 'bot');
  assert.match(meldung, /Nachrichten senden/);
  assert.match(meldung, /Links einbetten/);
  assert.match(meldung, /Nachrichtenverlauf/, 'alle fehlenden auf einmal nennen');
});

test('Bot und Dashboard fordern dieselben Rechte', async () => {
  // Sonst meldet die Oberflaeche "alles gut", waehrend der Bot blockiert -
  // genau das war der Fall, als das Manifest ein Recht weniger nannte.
  const { PermissionFlagsBits } = await import('discord.js');
  const imManifest = MANIFEST.ui.sections
    .flatMap((s) => s.fields ?? [])
    .find((f) => f.type === 'channel').requiresPermissions;

  const nameZuBit = {
    VIEW_CHANNEL: PermissionFlagsBits.ViewChannel,
    SEND_MESSAGES: PermissionFlagsBits.SendMessages,
    EMBED_LINKS: PermissionFlagsBits.EmbedLinks,
    READ_MESSAGE_HISTORY: PermissionFlagsBits.ReadMessageHistory,
  };

  // Mit genau den Rechten aus dem Manifest darf der Bot nichts vermissen.
  const bits = imManifest.map((n) => nameZuBit[n]);
  assert.ok(
    bits.every(Boolean),
    `unbekanntes Recht im Manifest: ${imManifest.join(', ')}`,
  );
  assert.equal(
    fehlendeRechte(kanalMit(bits), 'bot'),
    null,
    'der Bot verlangt mehr, als im Manifest steht',
  );
});

test('Laesst sich das Recht nicht pruefen, wird nicht blockiert', () => {
  // Lieber Discord antworten lassen, als faelschlich abzulehnen.
  assert.equal(fehlendeRechte({ name: 'x' }, 'bot'), null, 'ohne permissionsFor');
  assert.equal(fehlendeRechte(kanalMit([]), null), null, 'ohne Bot-ID');
  assert.equal(fehlendeRechte({ permissionsFor: () => null }, 'bot'), null, 'ohne Ergebnis');
});

test('Der Bot nennt den Kanal beim Namen', async () => {
  const { db, store, client, gesendet, log } = aufbau({
    channelFetch: async () => ({
      name: 'serverregeln',
      permissionsFor: () => ({ has: () => false }),
    }),
  });
  client.user = { id: 'botid' };
  const meldungen = [];
  await plugin.setup.call(plugin, {
    client,
    store,
    log: { info: (m) => meldungen.push(m), error: (m) => meldungen.push(m) },
  });

  store.addItem('r', 'items', { text: 'Eine Regel.' });
  store.saveConfig('r', { channel_id: 'c1' });
  await einDurchlauf();

  assert.equal(gesendet.length, 0, 'ohne Rechte darf nichts gesendet werden');
  const treffer = meldungen.find((m) => m.includes('serverregeln'));
  assert.ok(treffer, `der Kanalname muss in der Meldung stehen: ${meldungen.join(' | ')}`);
  assert.match(treffer, /fehlt/);

  plugin.teardown.call(plugin);
  db.close();
});

// --- Rueckmeldung ans Dashboard -------------------------------------------

test('Der Bot merkt sich, was er zuletzt gemacht hat', async () => {
  // Ohne das sagt die Oberflaeche nur "erledigt" - auch wenn in Discord
  // nichts passiert ist. Genau das war einmal der Fall.
  const { db, store, client, log } = aufbau({ channelFetch: async () => ({}) });
  await plugin.setup.call(plugin, { client, store, log });

  store.addItem('m', 'items', { text: 'Eine Regel.' });
  store.saveConfig('m', { channel_id: 'c1' });
  await einDurchlauf();

  const merk = store.getState('m');
  assert.match(merk.letztesErgebnis, /gepostet/);
  assert.ok(merk.letzterLauf > 0, 'auch der Zeitpunkt gehoert dazu');

  plugin.teardown.call(plugin);
  db.close();
});

test('Auch ein Fehlschlag wird gemeldet', async () => {
  const { db, store, client, log } = aufbau({ channelFetch: async () => null });
  await plugin.setup.call(plugin, { client, store, log });

  store.addItem('n', 'items', { text: 'Eine Regel.' });
  store.saveConfig('n', { channel_id: 'gibtsnicht' });
  await einDurchlauf();

  assert.match(store.getState('n').letztesErgebnis, /nicht erreichbar/);

  plugin.teardown.call(plugin);
  db.close();
});

// --- Zusammenspiel mit dem Speicher --------------------------------------

test('Der Speicher entsteht aus dem Manifest, nicht aus Plugin-Code', () => {
  const { db } = aufbau();
  const tabellen = db
    .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name LIKE 'plugin_regeln%'")
    .all()
    .map((t) => t.name);
  assert.ok(tabellen.includes('plugin_regeln_config'));
  assert.ok(tabellen.includes('plugin_regeln_items'));
  db.close();
});

test('Bei erreichbarem Kanal wird die Nachricht gesendet und die ID gemerkt', async () => {
  const { db, store, client, gesendet, log } = aufbau({ channelFetch: async () => ({}) });
  await plugin.setup.call(plugin, { client, store, log });

  store.addItem('7', 'items', { icon: '📜', text: 'Respektvoll bleiben.' });
  store.saveConfig('7', { channel_id: 'c1', title: 'Hausordnung' });

  await einDurchlauf();

  assert.equal(gesendet.length, 1, 'genau eine Nachricht');
  const embed = gesendet[0].embeds[0].toJSON();
  assert.equal(embed.title, 'Hausordnung');
  assert.match(embed.description, /📜 \*\*1\.\*\* Respektvoll bleiben\./);

  // Ohne gemerkte ID wuerde beim naechsten Mal eine zweite Nachricht entstehen.
  assert.equal(store.getState('7').messageId, 'neue-nachricht-id');
  assert.equal(store.pendingGuilds().length, 0, 'der Auftrag muss abgehakt sein');

  plugin.teardown.call(plugin);
  db.close();
});

test('Beim zweiten Mal wird bearbeitet statt neu gepostet', async () => {
  const { db, store, client, gesendet, bearbeitet, log } = aufbau({
    channelFetch: async () => ({}),
    messageFetch: async () => ({}), // die Nachricht gibt es noch
  });
  await plugin.setup.call(plugin, { client, store, log });

  store.addItem('7', 'items', { text: 'Respektvoll bleiben.' });
  store.saveConfig('7', { channel_id: 'c1' });
  await einDurchlauf();
  assert.equal(gesendet.length, 1);

  // Zweite Aenderung.
  store.addItem('7', 'items', { text: 'Kein Spam.' });
  await einDurchlauf();

  assert.equal(gesendet.length, 1, 'es darf keine zweite Nachricht geben');
  assert.equal(bearbeitet.length, 1, 'die bestehende muss bearbeitet werden');
  assert.equal(bearbeitet[0].embeds[0].toJSON().description.split('\n').length, 2);

  plugin.teardown.call(plugin);
  db.close();
});

test('Wurde die Nachricht in Discord geloescht, entsteht eine neue', async () => {
  const { db, store, client, gesendet, log } = aufbau({
    channelFetch: async () => ({}),
    messageFetch: async () => null, // geloescht
  });
  await plugin.setup.call(plugin, { client, store, log });

  store.addItem('7', 'items', { text: 'Respektvoll bleiben.' });
  store.saveConfig('7', { channel_id: 'c1' });
  await einDurchlauf();

  store.setState('7', { messageId: 'laengst-geloescht' });
  store.markDirty('7');
  await einDurchlauf();

  assert.equal(gesendet.length, 2, 'eine neue Nachricht muss entstehen');
  plugin.teardown.call(plugin);
  db.close();
});

test('Der Auftrag wird auch bei unerreichbarem Kanal abgehakt', async () => {
  // Ohne das wuerde es endlos weiterversuchen und das Log fluten.
  const { db, store, client, log } = aufbau({ channelFetch: async () => null });
  await plugin.setup.call(plugin, { client, store, log });

  store.addItem('42', 'items', { text: 'Respektvoll bleiben.' });
  store.saveConfig('42', { channel_id: 'gibtsnicht' });

  await einDurchlauf();

  assert.equal(store.pendingGuilds().length, 0, 'die Markierung muss zurueckgesetzt sein');
  plugin.teardown.call(plugin);
  db.close();
});

test('Ohne Regeln wird nichts gepostet', async () => {
  const { db, store, client, gesendet, log } = aufbau({ channelFetch: async () => ({}) });
  await plugin.setup.call(plugin, { client, store, log });

  store.saveConfig('8', { channel_id: 'c1' });
  await einDurchlauf();

  assert.equal(gesendet.length, 0, 'eine leere Regel-Nachricht waere sinnlos');
  plugin.teardown.call(plugin);
  db.close();
});

test('Server sehen einander nicht', async () => {
  const { db, store, client, gesendet, log } = aufbau({ channelFetch: async () => ({}) });
  await plugin.setup.call(plugin, { client, store, log });

  store.addItem('a', 'items', { text: 'Nur bei A' });
  store.saveConfig('a', { channel_id: 'c1' });
  store.addItem('b', 'items', { text: 'Nur bei B' });
  store.saveConfig('b', { channel_id: 'c1' });

  await einDurchlauf();

  assert.equal(gesendet.length, 2, 'jeder Server bekommt seine eigene Nachricht');
  const texte = gesendet.map((g) => g.embeds[0].toJSON().description);
  assert.ok(texte.some((t) => t.includes('Nur bei A')));
  assert.ok(texte.some((t) => t.includes('Nur bei B')));
  assert.ok(
    !texte.some((t) => t.includes('Nur bei A') && t.includes('Nur bei B')),
    'keine Nachricht darf die Regeln beider Server enthalten',
  );

  plugin.teardown.call(plugin);
  db.close();
});
