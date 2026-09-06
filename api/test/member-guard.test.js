import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  hoechsteRolle,
  pruefeMitglied,
  reichereMitgliederAn,
  darfAktion,
} from '../src/member-guard.js';

/**
 * Der Schutz in der Mitgliederliste.
 *
 * Vorher konnte man sich selbst bannen und es beim Server-Gruender versuchen.
 * Discords Rangfolge ist die Grundlage - ein Fehler hier heisst entweder,
 * dass jemand sich selbst raushaut, oder dass ein Knopf nur eine
 * Fehlermeldung von Discord bringt.
 */

const OWNER = '1000';
const ICH = '2000';
const BOT_ROLLE = 'r-bot';

const ROLLEN = [
  { id: 'r-admin', name: 'Admin', position: 90, color: 0xff0000 },
  { id: BOT_ROLLE, name: 'Bot', position: 50, color: 0 },
  { id: 'r-mod', name: 'Moderator', position: 40, color: 0x00ff00 },
  { id: 'r-member', name: 'Mitglied', position: 10, color: 0 },
];
const rollenMap = new Map(ROLLEN.map((r) => [r.id, r]));

const mitglied = (id, roles = ['r-member'], extra = {}) => ({
  id,
  name: `Nutzer ${id}`,
  roles,
  bot: false,
  ...extra,
});

const pruefe = (member) =>
  pruefeMitglied({
    member,
    rollen: rollenMap,
    ownerId: OWNER,
    botRoleIds: [BOT_ROLLE],
    actorId: ICH,
  });

// --- Rangfolge ------------------------------------------------------------

test('Die hoechste Rolle wird richtig bestimmt', () => {
  assert.equal(hoechsteRolle(['r-member', 'r-mod'], rollenMap).name, 'Moderator');
  assert.equal(hoechsteRolle(['r-admin', 'r-member'], rollenMap).name, 'Admin');
});

test('Ohne Rolle zaehlt @everyone', () => {
  assert.equal(hoechsteRolle([], rollenMap).position, 0);
  assert.equal(hoechsteRolle(undefined, rollenMap).position, 0);
});

test('Unbekannte Rollen-IDs werden uebergangen', () => {
  // Eine Rolle kann geloescht worden sein, waehrend die Liste im Cache lag.
  assert.equal(hoechsteRolle(['gibtsnicht', 'r-mod'], rollenMap).name, 'Moderator');
});

test('Bei gleicher Position gewinnt die aeltere Rolle', () => {
  // So macht es Discord: kleinere ID zuerst.
  const gleich = new Map([
    ['100', { id: '100', name: 'Alt', position: 5 }],
    ['200', { id: '200', name: 'Neu', position: 5 }],
  ]);
  assert.equal(hoechsteRolle(['200', '100'], gleich).name, 'Alt');
  assert.equal(hoechsteRolle(['100', '200'], gleich).name, 'Alt', 'Reihenfolge egal');
});

// --- Der Gruender ---------------------------------------------------------

test('Gegen den Server-Gruender geht gar nichts', () => {
  // Der wichtigste Fall: Discord laesst es nicht zu, also darf die
  // Oberflaeche es auch nicht anbieten.
  const p = pruefe(mitglied(OWNER, ['r-member']));
  assert.equal(p.istGruender, true);
  assert.equal(p.kannEingreifen, false);
  assert.equal(p.kannVerwarnen, false);
  assert.match(p.grund, /Gründer/);
});

test('Der Gruender ist auch ohne hohe Rolle geschuetzt', () => {
  // Der Gruender braucht keine Admin-Rolle - er steht ueber allem.
  assert.equal(pruefe(mitglied(OWNER, [])).kannEingreifen, false);
});

// --- Man selbst -----------------------------------------------------------

test('Man kann sich nicht selbst bannen', () => {
  // Genau der gemeldete Fall.
  const p = pruefe(mitglied(ICH, ['r-mod']));
  assert.equal(p.istSelbst, true);
  assert.equal(p.kannEingreifen, false);
  assert.match(p.grund, /selbst/);
});

test('Ohne bekannten Aufrufer greift der Selbstschutz nicht', () => {
  // Ohne actorId laesst sich nicht sagen, wer "selbst" ist - dann bleibt
  // nur die Rangfolge. Besser als faelschlich jemanden zu schuetzen.
  const p = pruefeMitglied({
    member: mitglied(ICH, ['r-mod']),
    rollen: rollenMap,
    ownerId: OWNER,
    botRoleIds: [BOT_ROLLE],
    actorId: null,
  });
  assert.equal(p.istSelbst, false);
  assert.equal(p.kannEingreifen, true);
});

// --- Rangfolge gegenueber dem Bot ----------------------------------------

test('Gegen hoehere Rollen kann der Bot nichts ausrichten', () => {
  const p = pruefe(mitglied('3000', ['r-admin']));
  assert.equal(p.kannEingreifen, false);
  assert.match(p.grund, /Admin/);
  assert.match(p.grund, /höher/, 'die Meldung soll sagen, was zu tun ist');
});

test('Gegen niedrigere Rollen geht es', () => {
  assert.equal(pruefe(mitglied('3000', ['r-mod'])).kannEingreifen, true);
  assert.equal(pruefe(mitglied('3000', ['r-member'])).kannEingreifen, true);
  assert.equal(pruefe(mitglied('3000', [])).kannEingreifen, true);
});

test('Gleichstand reicht Discord nicht', () => {
  // Der Bot muss echt hoeher stehen - egal ob es dieselbe Rolle ist oder
  // eine andere auf gleicher Position.
  assert.equal(pruefe(mitglied('3000', [BOT_ROLLE])).kannEingreifen, false, 'dieselbe Rolle');

  const gleichRang = new Map([
    ...rollenMap,
    ['r-gleich', { id: 'r-gleich', name: 'Gleichrangig', position: 50, color: 0 }],
  ]);
  const p = pruefeMitglied({
    member: mitglied('3000', ['r-gleich']),
    rollen: gleichRang,
    ownerId: OWNER,
    botRoleIds: [BOT_ROLLE],
    actorId: ICH,
  });
  assert.equal(p.kannEingreifen, false, 'andere Rolle, gleiche Position');
});

test('Steht der Bot ganz unten, geht bei niemandem etwas', () => {
  const p = pruefeMitglied({
    member: mitglied('3000', ['r-member']),
    rollen: rollenMap,
    ownerId: OWNER,
    botRoleIds: [],
    actorId: ICH,
  });
  assert.equal(p.kannEingreifen, false);
});

// --- Bots -----------------------------------------------------------------

test('Gegen andere Bots wird nichts angeboten', () => {
  const p = pruefe(mitglied('4000', ['r-member'], { bot: true }));
  assert.equal(p.kannEingreifen, false);
  assert.match(p.grund, /Bot/);
});

// --- Verwarnen bleibt moeglich -------------------------------------------

test('Verwarnen geht auch bei hoeheren Rollen', () => {
  // Verwarnen greift niemanden an, es notiert nur etwas.
  const p = pruefe(mitglied('3000', ['r-admin']));
  assert.equal(p.kannEingreifen, false, 'bannen nicht');
  assert.equal(p.kannVerwarnen, true, 'verwarnen schon');
});

// --- Die angereicherte Liste ---------------------------------------------

test('Die Liste enthaelt Rollen im Klartext statt roher IDs', () => {
  const [m] = reichereMitgliederAn({
    members: [mitglied('3000', ['r-member', 'r-mod'])],
    roles: ROLLEN,
    ownerId: OWNER,
    botRoleIds: [BOT_ROLLE],
    actorId: ICH,
  });

  assert.deepEqual(m.roleNames.map((r) => r.name), ['Moderator', 'Mitglied'], 'hoechste zuerst');
  assert.equal(m.topRolle, 'Moderator');
  assert.ok(m.roleNames[0].color !== undefined, 'die Farbe gehoert dazu');
});

test('Gruender und man selbst sind in der Liste markiert', () => {
  const liste = reichereMitgliederAn({
    members: [mitglied(OWNER), mitglied(ICH), mitglied('3000')],
    roles: ROLLEN,
    ownerId: OWNER,
    botRoleIds: [BOT_ROLLE],
    actorId: ICH,
  });

  assert.equal(liste[0].istGruender, true);
  assert.equal(liste[1].istSelbst, true);
  assert.equal(liste[2].istGruender, false);
  assert.equal(liste[2].istSelbst, false);

  // Und die Knoepfe sind entsprechend gesperrt.
  assert.equal(liste[0].kannEingreifen, false);
  assert.equal(liste[1].kannEingreifen, false);
  assert.equal(liste[2].kannEingreifen, true);
});

test('Jeder gesperrte Eintrag nennt einen Grund', () => {
  const liste = reichereMitgliederAn({
    members: [mitglied(OWNER), mitglied(ICH), mitglied('3000', ['r-admin'])],
    roles: ROLLEN,
    ownerId: OWNER,
    botRoleIds: [BOT_ROLLE],
    actorId: ICH,
  });
  for (const m of liste.filter((x) => !x.kannEingreifen)) {
    assert.ok(m.schutzGrund?.length > 0, `${m.id} ohne Begruendung`);
  }
});

// --- Die letzte Instanz ---------------------------------------------------

test('darfAktion sperrt dieselben Faelle', () => {
  const args = { rollen: rollenMap, ownerId: OWNER, botRoleIds: [BOT_ROLLE], actorId: ICH };

  assert.match(darfAktion({ action: 'ban', member: mitglied(OWNER), ...args }), /Gründer/);
  assert.match(darfAktion({ action: 'ban', member: mitglied(ICH), ...args }), /selbst/);
  assert.match(darfAktion({ action: 'kick', member: mitglied('3', ['r-admin']), ...args }), /Admin/);
  assert.equal(darfAktion({ action: 'ban', member: mitglied('3', ['r-mod']), ...args }), null);
});

test('Verwarnen ist auch bei hoeherer Rolle erlaubt', () => {
  const args = { rollen: rollenMap, ownerId: OWNER, botRoleIds: [BOT_ROLLE], actorId: ICH };
  assert.equal(darfAktion({ action: 'warn', member: mitglied('3', ['r-admin']), ...args }), null);
  assert.match(darfAktion({ action: 'warn', member: mitglied(OWNER), ...args }), /Gründer/);
});

test('Alle Eingriffe werden gleich behandelt', () => {
  const args = { rollen: rollenMap, ownerId: OWNER, botRoleIds: [BOT_ROLLE], actorId: ICH };
  for (const action of ['timeout', 'kick', 'ban']) {
    assert.ok(
      darfAktion({ action, member: mitglied(ICH), ...args }),
      `${action} gegen sich selbst muss gesperrt sein`,
    );
  }
});
