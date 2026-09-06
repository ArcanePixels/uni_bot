import { test } from 'node:test';
import assert from 'node:assert/strict';
import { einladungsLink, rechteSumme, BOT_RECHTE } from '../src/lib/einladung.js';

/**
 * Der Einladungslink.
 *
 * Zwei Dinge zaehlen hier: dass die Rechte stimmen (jedes zusaetzliche ist
 * eine dauerhafte Vollmacht, die der Nutzer bestaetigt) und dass der Link
 * wirklich zu Discord fuehrt - niemand soll aus Versehen woanders landen.
 */

const CLIENT_ID = '123456789';

test('Der Link zeigt auf Discord', () => {
  const url = new URL(einladungsLink({ clientId: CLIENT_ID }));
  assert.equal(url.origin, 'https://discord.com');
  assert.equal(url.pathname, '/oauth2/authorize');
});

test('Client-ID, Rechte und Umfang sind gesetzt', () => {
  const url = new URL(einladungsLink({ clientId: CLIENT_ID }));
  assert.equal(url.searchParams.get('client_id'), CLIENT_ID);
  assert.equal(url.searchParams.get('scope'), 'bot applications.commands');
  assert.ok(url.searchParams.get('permissions'), 'ohne Rechte waere der Bot nutzlos');
});

test('Ohne Client-ID gibt es keinen Link', () => {
  // Besser gar keiner als einer, der ins Leere fuehrt.
  assert.equal(einladungsLink({ clientId: null }), null);
  assert.equal(einladungsLink({ clientId: '' }), null);
  assert.equal(einladungsLink({ clientId: undefined }), null);
});

test('Der Server wird vorausgewählt, bleibt aber änderbar', () => {
  // Wer sich vertut, soll wechseln koennen, statt den Bot auf dem falschen
  // Server zu landen.
  const url = new URL(einladungsLink({ clientId: CLIENT_ID, guildId: '999' }));
  assert.equal(url.searchParams.get('guild_id'), '999');
  assert.equal(url.searchParams.get('disable_guild_select'), 'false');
});

test('Ohne Server-Angabe bleibt die Auswahl offen', () => {
  const url = new URL(einladungsLink({ clientId: CLIENT_ID }));
  assert.equal(url.searchParams.get('guild_id'), null);
});

// --- Die Rechte -----------------------------------------------------------

test('Die Rechtesumme ist eine gültige Zahl', () => {
  const summe = rechteSumme();
  assert.ok(summe > 0n);
  // Discord erwartet sie als Dezimalzahl im Link.
  assert.match(summe.toString(), /^\d+$/);
});

test('Administrator ist NICHT dabei', () => {
  // Der wichtigste Test: Administrator waere bequem, gibt dem Bot aber
  // Vollmacht ueber alles - auch ueber Dinge, die er nie braucht.
  const ADMINISTRATOR = 1n << 3n;
  assert.equal(rechteSumme() & ADMINISTRATOR, 0n, 'Administrator darf nicht enthalten sein');
});

test('Die Rechte, die der Bot wirklich braucht, sind enthalten', () => {
  const summe = rechteSumme();
  const noetig = {
    'Kanal ansehen': 1n << 10n,
    'Nachrichten senden': 1n << 11n,
    'Links einbetten': 1n << 14n,
    Nachrichtenverlauf: 1n << 16n,
    'Nachrichten verwalten': 1n << 13n,
    'Rollen verwalten': 1n << 28n,
    Kicken: 1n << 1n,
    Bannen: 1n << 2n,
    Timeout: 1n << 40n,
  };
  for (const [name, bit] of Object.entries(noetig)) {
    assert.notEqual(summe & bit, 0n, `${name} fehlt`);
  }
});

test('Es sind keine unbekannten Rechte dabei', () => {
  // Jedes Recht muss begruendet sein - sonst schleicht sich mit der Zeit
  // eine Vollmacht ein, die niemand mehr hinterfragt.
  const summe = rechteSumme();
  let bekannt = 0n;
  for (const bit of Object.values(BOT_RECHTE)) bekannt |= bit;
  assert.equal(summe, bekannt);
  assert.equal(Object.keys(BOT_RECHTE).length, 14, 'Anzahl der Rechte hat sich geändert');
});

test('Der fertige Link ist unverändert nutzbar', () => {
  // Ein Kopieren aus der Oberflaeche darf nicht an Sonderzeichen scheitern.
  const link = einladungsLink({ clientId: CLIENT_ID, guildId: '688449226245668912' });
  assert.doesNotThrow(() => new URL(link));
  assert.ok(!link.includes(' '), 'keine Leerzeichen im Link');
});
