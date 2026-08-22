import { test } from 'node:test';
import assert from 'node:assert/strict';
import { COMMANDS, findMismatch } from '../src/plugins/commands.js';
import { SLASH_COMMANDS } from '@allrounder/shared/slash-commands';
import { parseCommand, renderResponse, buildOverview, OVERVIEW_NAMES } from '../src/plugins/custom-commands.js';
import { truncate, shouldLog } from '../src/plugins/message-log.js';

// --- Slash-Commands --------------------------------------------------------

test('Jeder Befehl hat Namen und Beschreibung', () => {
  for (const c of COMMANDS) {
    assert.match(c.name, /^[a-z][a-z0-9_-]{0,31}$/, `ungültiger Name: ${c.name}`);
    assert.ok(c.description?.length > 0, `${c.name} hat keine Beschreibung`);
  }
});

test('Moderationsbefehle sind auf Berechtigungen beschränkt', () => {
  // /befehle ist bewusst offen - es zeigt nur, was ohnehin nutzbar ist.
  const offen = ['befehle'];
  for (const c of COMMANDS.filter((x) => !offen.includes(x.name))) {
    assert.ok(c.default_member_permissions, `${c.name} wäre für jeden sichtbar`);
  }
});

test('Befehlsnamen sind eindeutig', () => {
  const names = COMMANDS.map((c) => c.name);
  assert.equal(new Set(names).size, names.length);
});

test('Pflichtoptionen stehen vor optionalen', () => {
  // Discord weist die Anmeldung sonst ab.
  for (const c of COMMANDS) {
    const opts = c.options ?? [];
    let seenOptional = false;
    for (const o of opts) {
      if (!o.required) seenOptional = true;
      else if (seenOptional) assert.fail(`${c.name}: "${o.name}" steht nach einer optionalen Option`);
    }
  }
});

test('Timeout hält sich an Discords Grenzen', () => {
  const t = COMMANDS.find((c) => c.name === 'timeout');
  const minutes = t.options.find((o) => o.name === 'minuten');
  assert.equal(minutes.min_value, 1);
  assert.equal(minutes.max_value, 40320, 'Discord erlaubt höchstens 28 Tage');
});

test('Clear bleibt bei 100 Nachrichten', () => {
  const c = COMMANDS.find((x) => x.name === 'clear');
  const n = c.options.find((o) => o.name === 'anzahl');
  assert.equal(n.max_value, 100, 'bulkDelete kann nicht mehr auf einmal');
});

test('Die Beschreibung in shared passt zu den angemeldeten Befehlen', () => {
  // Sonst zeigt das Dashboard etwas anderes an, als der Bot tatsaechlich kann.
  const m = findMismatch(COMMANDS, SLASH_COMMANDS);
  assert.equal(
    m,
    null,
    m
      ? `Nicht beschrieben: [${m.fehlt.join(', ')}], beschrieben aber nicht vorhanden: [${m.zuviel.join(', ')}]`
      : '',
  );
});

test('findMismatch erkennt Abweichungen in beide Richtungen', () => {
  assert.deepEqual(findMismatch([{ name: 'a' }], [{ name: 'a' }]), null);
  assert.deepEqual(findMismatch([{ name: 'a' }, { name: 'b' }], [{ name: 'a' }]), {
    fehlt: ['b'],
    zuviel: [],
  });
  assert.deepEqual(findMismatch([{ name: 'a' }], [{ name: 'a' }, { name: 'x' }]), {
    fehlt: [],
    zuviel: ['x'],
  });
});

test('Jeder beschriebene Befehl hat Bedienung und Rechteangabe', () => {
  for (const c of SLASH_COMMANDS) {
    assert.ok(c.usage?.startsWith('/'), `${c.name}: usage fehlt oder beginnt nicht mit /`);
    assert.ok(c.description?.length > 0, `${c.name}: keine Beschreibung`);
    assert.ok(c.permissionLabel, `${c.name}: keine Angabe, wer den Befehl nutzen darf`);
  }
});

// --- Eigene Textbefehle ----------------------------------------------------

test('parseCommand erkennt einen Befehl', () => {
  assert.equal(parseCommand('!regeln', '!'), 'regeln');
  assert.equal(parseCommand('!regeln bitte', '!'), 'regeln');
  assert.equal(parseCommand('!REGELN', '!'), 'regeln', 'Groß-/Kleinschreibung egal');
});

test('parseCommand ignoriert Nachrichten ohne Präfix', () => {
  assert.equal(parseCommand('regeln', '!'), null);
  assert.equal(parseCommand('hallo !regeln', '!'), null, 'nur am Anfang zählt');
});

test('parseCommand verkraftet leere Eingaben', () => {
  assert.equal(parseCommand('!', '!'), null);
  assert.equal(parseCommand('!   ', '!'), null);
  assert.equal(parseCommand('', '!'), null);
  assert.equal(parseCommand('!regeln', ''), null, 'ohne Präfix kein Befehl');
});

test('parseCommand weist unsinnige Namen ab', () => {
  assert.equal(parseCommand('!@everyone', '!'), null);
  assert.equal(parseCommand('!' + 'x'.repeat(40), '!'), null, 'zu lang');
});

test('parseCommand arbeitet mit anderen Präfixen', () => {
  assert.equal(parseCommand('?hilfe', '?'), 'hilfe');
  assert.equal(parseCommand('!hilfe', '?'), null);
});

test('renderResponse ersetzt die Platzhalter', () => {
  const out = renderResponse('Hallo {user}, willkommen auf {server}! ({count} Mitglieder)', {
    member: { id: '42', user: { username: 'Micha' } },
    guild: { name: 'ArcanePixels', memberCount: 7 },
    channel: { id: '99' },
  });
  assert.equal(out, 'Hallo <@42>, willkommen auf ArcanePixels! (7 Mitglieder)');
});

test('renderResponse verkraftet fehlenden Text', () => {
  const ctx = { member: { id: '1', user: { username: 'x' } }, guild: { name: 'g', memberCount: 1 }, channel: { id: '2' } };
  assert.equal(renderResponse(null, ctx), '');
  assert.equal(renderResponse(undefined, ctx), '');
});

// --- Befehlsuebersicht -----------------------------------------------------

test('buildOverview listet die nutzbaren Befehle mit Präfix', () => {
  const out = buildOverview(
    [{ name: 'regeln', role_id: null }, { name: 'discord', role_id: null }],
    () => false,
    '!!',
  );
  assert.match(out, /`!!regeln`/);
  assert.match(out, /`!!discord`/);
});

test('buildOverview blendet Befehle aus, die einer fremden Rolle gehören', () => {
  const rows = [
    { name: 'regeln', role_id: null },
    { name: 'intern', role_id: 'r-mod' },
  ];
  const out = buildOverview(rows, () => false, '!');
  assert.match(out, /`!regeln`/);
  assert.doesNotMatch(out, /intern/, 'ein fremder Befehl darf nicht auftauchen');
  assert.match(out, /1 weitere/, 'aber der Hinweis auf die Anzahl');
});

test('buildOverview zeigt rollengebundene Befehle, wenn man die Rolle hat', () => {
  const rows = [{ name: 'intern', role_id: 'r-mod' }];
  const out = buildOverview(rows, (id) => id === 'r-mod', '!');
  assert.match(out, /`!intern`/);
  assert.doesNotMatch(out, /weitere sind an eine Rolle/);
});

test('buildOverview unterscheidet "nichts angelegt" von "nichts für dich"', () => {
  assert.match(buildOverview([], () => true, '!'), /noch kein eigener Befehl angelegt/);
  assert.match(
    buildOverview([{ name: 'x', role_id: 'r1' }], () => false, '!'),
    /kein Befehl freigeschaltet/,
  );
});

test('Die Übersicht ist unter mehreren Namen erreichbar', () => {
  for (const n of ['befehle', 'hilfe', 'help', 'commands']) {
    assert.ok(OVERVIEW_NAMES.includes(n), `"${n}" fehlt`);
  }
});

test('Der Slash-Command /befehle ist für alle nutzbar', () => {
  const c = COMMANDS.find((x) => x.name === 'befehle');
  assert.ok(c, '/befehle fehlt');
  assert.equal(
    c.default_member_permissions,
    undefined,
    'die Übersicht zeigt nur, was ohnehin nutzbar ist - keine Rechteschranke nötig',
  );
});

// --- Nachrichten-Log -------------------------------------------------------

test('truncate kürzt lange Texte mit Auslassungszeichen', () => {
  assert.equal(truncate('kurz', 100), 'kurz');
  const long = 'x'.repeat(300);
  const out = truncate(long, 100);
  assert.equal(out.length, 101, '100 Zeichen plus Auslassung');
  assert.ok(out.endsWith('…'));
});

test('truncate verkraftet null', () => {
  assert.equal(truncate(null), '');
  assert.equal(truncate(undefined), '');
});

test('shouldLog folgt dem Hauptschalter', () => {
  assert.equal(shouldLog({ enabled: false }, { channelId: 'c', authorIsBot: false }), false);
  assert.equal(shouldLog(null, { channelId: 'c', authorIsBot: false }), false);
  assert.equal(shouldLog({ enabled: true }, { channelId: 'c', authorIsBot: false }), true);
});

test('shouldLog überspringt Bots, sofern nicht gewünscht', () => {
  const cfg = { enabled: true, includeBots: false };
  assert.equal(shouldLog(cfg, { channelId: 'c', authorIsBot: true }), false);
  assert.equal(shouldLog({ ...cfg, includeBots: true }, { channelId: 'c', authorIsBot: true }), true);
});

test('shouldLog achtet auf ausgenommene Kanäle', () => {
  const cfg = { enabled: true, ignoredChannelIds: ['geheim'] };
  assert.equal(shouldLog(cfg, { channelId: 'geheim', authorIsBot: false }), false);
  assert.equal(shouldLog(cfg, { channelId: 'offen', authorIsBot: false }), true);
});

test('shouldLog nimmt auch ganze Kategorien aus', () => {
  const cfg = { enabled: true, ignoredChannelIds: ['kat1'] };
  assert.equal(
    shouldLog(cfg, { channelId: 'c1', authorIsBot: false, categoryId: 'kat1' }),
    false,
    'ein Kanal in einer ausgenommenen Kategorie darf nicht mitgeschrieben werden',
  );
});
