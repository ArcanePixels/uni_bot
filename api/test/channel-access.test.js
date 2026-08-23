import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  effectivePermissions,
  checkChannelAccess,
  PERMISSION_BITS as P,
} from '../src/channel-access.js';

/**
 * Discords Rechte-Berechnung.
 *
 * Heikel und leicht falsch gemacht: Die Reihenfolge der Schritte entscheidet
 * ueber das Ergebnis, und ein Fehler faellt erst auf, wenn der Bot in genau
 * einem Kanal nicht posten kann. Deshalb hier ausfuehrlich.
 */

const EVERYONE = '1'; // gleich der Server-ID
const BOTROLLE = '2';
const ZWEITE = '3';
const BOTUSER = '99';

/** Baut die Rollenliste des Servers. */
const rollen = (everyoneBits, botBits = 0n, zweiteBits = 0n) => [
  { id: EVERYONE, permissions: String(everyoneBits) },
  { id: BOTROLLE, permissions: String(botBits) },
  { id: ZWEITE, permissions: String(zweiteBits) },
];

/** Baut einen Kanal mit Ueberschreibungen. */
const kanal = (...overwrites) => ({ permission_overwrites: overwrites });
const ow = (id, allow = 0n, deny = 0n) => ({ id, allow: String(allow), deny: String(deny) });

const rechne = (channel, roles, memberRoleIds = [BOTROLLE]) =>
  effectivePermissions({
    channel,
    roles,
    memberRoleIds,
    memberId: BOTUSER,
    everyoneId: EVERYONE,
  });

// --- Grundlagen -----------------------------------------------------------

test('Rollenrechte werden aufsummiert', () => {
  const { bits } = rechne(kanal(), rollen(P.VIEW_CHANNEL, P.SEND_MESSAGES));
  assert.ok(bits & P.VIEW_CHANNEL, 'von @everyone');
  assert.ok(bits & P.SEND_MESSAGES, 'von der Bot-Rolle');
});

test('Mehrere Rollen ergaenzen einander', () => {
  const { bits } = rechne(kanal(), rollen(0n, P.SEND_MESSAGES, P.EMBED_LINKS), [BOTROLLE, ZWEITE]);
  assert.ok(bits & P.SEND_MESSAGES);
  assert.ok(bits & P.EMBED_LINKS);
});

test('Administrator schlaegt jede Kanal-Sperre', () => {
  // Sonst wuerde die Oberflaeche einem Admin-Bot faelschlich fehlende Rechte
  // melden - und der Nutzer suchte an der falschen Stelle.
  const gesperrt = kanal(ow(EVERYONE, 0n, P.VIEW_CHANNEL | P.SEND_MESSAGES));
  const { admin } = rechne(gesperrt, rollen(P.ADMINISTRATOR));
  assert.equal(admin, true);

  const r = checkChannelAccess({
    channel: gesperrt,
    roles: rollen(P.ADMINISTRATOR),
    memberRoleIds: [BOTROLLE],
    memberId: BOTUSER,
    everyoneId: EVERYONE,
    benoetigt: ['VIEW_CHANNEL', 'SEND_MESSAGES', 'EMBED_LINKS'],
  });
  assert.equal(r.ok, true);
  assert.deepEqual(r.fehlend, []);
});

// --- Ueberschreibungen im Kanal ------------------------------------------

test('Ein Verbot fuer @everyone entzieht das Recht', () => {
  const { bits } = rechne(
    kanal(ow(EVERYONE, 0n, P.SEND_MESSAGES)),
    rollen(P.VIEW_CHANNEL | P.SEND_MESSAGES),
  );
  assert.ok(bits & P.VIEW_CHANNEL);
  assert.equal(bits & P.SEND_MESSAGES, 0n, 'im Kanal verboten');
});

test('Eine Rollen-Erlaubnis hebt das Verbot fuer @everyone auf', () => {
  // Der haeufigste Fall: Kanal fuer alle gesperrt, Bot-Rolle ausgenommen.
  const { bits } = rechne(
    kanal(ow(EVERYONE, 0n, P.SEND_MESSAGES), ow(BOTROLLE, P.SEND_MESSAGES)),
    rollen(P.VIEW_CHANNEL),
  );
  assert.ok(bits & P.SEND_MESSAGES, 'die Rolle sticht @everyone');
});

test('Verbote der Rollen werden vor den Erlaubnissen verrechnet', () => {
  // Discord sammelt erst alle deny, dann alle allow. Rechnete man Rolle fuer
  // Rolle ab, haenge das Ergebnis an ihrer Reihenfolge.
  const { bits } = rechne(
    kanal(ow(BOTROLLE, 0n, P.SEND_MESSAGES), ow(ZWEITE, P.SEND_MESSAGES)),
    rollen(0n),
    [BOTROLLE, ZWEITE],
  );
  assert.ok(bits & P.SEND_MESSAGES, 'eine Erlaubnis gewinnt gegen ein Verbot');
});

test('Die Reihenfolge der Rollen aendert nichts', () => {
  const c = kanal(ow(BOTROLLE, 0n, P.SEND_MESSAGES), ow(ZWEITE, P.SEND_MESSAGES));
  const a = rechne(c, rollen(0n), [BOTROLLE, ZWEITE]).bits;
  const b = rechne(c, rollen(0n), [ZWEITE, BOTROLLE]).bits;
  assert.equal(a, b);
});

test('Eine Ausnahme fuer den Bot selbst schlaegt die Rollen', () => {
  const { bits } = rechne(
    kanal(ow(BOTROLLE, 0n, P.SEND_MESSAGES), ow(BOTUSER, P.SEND_MESSAGES)),
    rollen(0n),
  );
  assert.ok(bits & P.SEND_MESSAGES, 'die eigene Ausnahme gewinnt');
});

test('Ein Verbot fuer den Bot selbst schlaegt alles andere', () => {
  const { bits } = rechne(
    kanal(ow(BOTROLLE, P.SEND_MESSAGES), ow(BOTUSER, 0n, P.SEND_MESSAGES)),
    rollen(P.SEND_MESSAGES),
  );
  assert.equal(bits & P.SEND_MESSAGES, 0n);
});

// --- Was die Oberflaeche anzeigt -----------------------------------------

const pruefe = (channel, roles, benoetigt = ['VIEW_CHANNEL', 'SEND_MESSAGES', 'EMBED_LINKS']) =>
  checkChannelAccess({
    channel,
    roles,
    memberRoleIds: [BOTROLLE],
    memberId: BOTUSER,
    everyoneId: EVERYONE,
    benoetigt,
  });

test('Alles da: nichts zu melden', () => {
  const r = pruefe(kanal(), rollen(P.VIEW_CHANNEL | P.SEND_MESSAGES | P.EMBED_LINKS));
  assert.equal(r.ok, true);
  assert.deepEqual(r.fehlend, []);
});

test('"Links einbetten" wird beim Namen genannt', () => {
  // Das wird am haeufigsten uebersehen - der Name klingt nicht nach Embeds.
  const r = pruefe(kanal(), rollen(P.VIEW_CHANNEL | P.SEND_MESSAGES));
  assert.equal(r.ok, false);
  assert.equal(r.fehlend.length, 1);
  assert.equal(r.fehlend[0].key, 'EMBED_LINKS');
  assert.equal(r.fehlend[0].label, 'Links einbetten');
});

test('Mehrere fehlende Rechte kommen auf einmal', () => {
  const r = pruefe(kanal(), rollen(P.VIEW_CHANNEL));
  assert.deepEqual(
    r.fehlend.map((f) => f.key),
    ['SEND_MESSAGES', 'EMBED_LINKS'],
  );
});

test('Nur das Gebrauchte wird geprueft', () => {
  // Ein Plugin ohne Embeds soll nicht ueber EMBED_LINKS stolpern.
  const r = pruefe(kanal(), rollen(P.VIEW_CHANNEL | P.SEND_MESSAGES), [
    'VIEW_CHANNEL',
    'SEND_MESSAGES',
  ]);
  assert.equal(r.ok, true);
});

test('Ein im Kanal gesperrter Bot faellt auf', () => {
  const r = pruefe(
    kanal(ow(EVERYONE, 0n, P.VIEW_CHANNEL)),
    rollen(P.VIEW_CHANNEL | P.SEND_MESSAGES | P.EMBED_LINKS),
  );
  assert.equal(r.ok, false);
  assert.equal(r.fehlend[0].key, 'VIEW_CHANNEL');
});

// --- Randfaelle -----------------------------------------------------------

test('Ein Kanal ohne Ueberschreibungen ist in Ordnung', () => {
  const r = pruefe(undefined, rollen(P.VIEW_CHANNEL | P.SEND_MESSAGES | P.EMBED_LINKS));
  assert.equal(r.ok, true, 'kein Kanal-Objekt heisst: keine Sperren');
});

test('Unbekannte Rollen-IDs stoeren nicht', () => {
  const r = checkChannelAccess({
    channel: kanal(),
    roles: rollen(P.VIEW_CHANNEL | P.SEND_MESSAGES | P.EMBED_LINKS),
    memberRoleIds: ['gibtsnicht'],
    memberId: BOTUSER,
    everyoneId: EVERYONE,
    benoetigt: ['VIEW_CHANNEL'],
  });
  assert.equal(r.ok, true, '@everyone reicht schon');
});

test('Sehr grosse Rechte-Bits werden korrekt gelesen', () => {
  // Discord-Rechte liegen als Text vor, weil sie groesser sind als
  // Number.MAX_SAFE_INTEGER.
  const gross = (1n << 50n) | P.VIEW_CHANNEL;
  const { bits } = rechne(kanal(), rollen(gross));
  assert.ok(bits & P.VIEW_CHANNEL);
  assert.ok(bits & (1n << 50n), 'das hohe Bit darf nicht verlorengehen');
});
