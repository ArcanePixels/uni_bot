import { test } from 'node:test';
import assert from 'node:assert/strict';
import { baueTabs, aktiveGruppe, istAktiv, GRUPPEN } from '../src/lib/tabs.js';

/**
 * Die Einteilung der Reiter.
 *
 * Wichtig vor allem: Ein Plugin muss ohne Zutun in einer Gruppe landen.
 * Faellt eines durch, waere sein Reiter unerreichbar - und niemand merkt es,
 * weil die Seite selbst weiter existiert.
 */

const G = 'guild123';

test('Die Übersicht steht allein', () => {
  const { uebersicht } = baueTabs(G);
  assert.equal(uebersicht.href, `/guild/${G}`);
});

test('Jeder Reiter des Grundsystems liegt in einer Gruppe', () => {
  const { gruppen } = baueTabs(G);
  const slugs = gruppen.flatMap((g) => g.tabs.map((t) => t.slug));

  // Das sind die Seiten, die es unter guild/[guildId]/ gibt.
  for (const erwartet of [
    'settings',
    'posts',
    'youtube',
    'wizard',
    'rechte',
    'funktionen',
    'mitglieder',
    'infractions',
    'befehle',
    'audit',
  ]) {
    assert.ok(slugs.includes(erwartet), `"${erwartet}" liegt in keiner Gruppe`);
  }
});

test('Kein Reiter taucht doppelt auf', () => {
  const { gruppen } = baueTabs(G);
  const slugs = gruppen.flatMap((g) => g.tabs.map((t) => t.slug));
  assert.equal(new Set(slugs).size, slugs.length);
});

test('Alle Adressen zeigen auf den richtigen Server', () => {
  const { gruppen } = baueTabs(G);
  for (const g of gruppen) {
    for (const t of g.tabs) {
      assert.ok(t.href.startsWith(`/guild/${G}/`), `${t.slug}: ${t.href}`);
    }
  }
});

// --- Plugins --------------------------------------------------------------

test('Ein Plugin landet ohne Zutun in einer Gruppe', () => {
  // Der wichtigste Fall: Ohne Zuordnung waere der Reiter unerreichbar.
  const { gruppen } = baueTabs(G, [{ name: 'twitch', label: 'Twitch', icon: 'play' }]);
  const alle = gruppen.flatMap((g) => g.tabs);
  const twitch = alle.find((t) => t.slug === 'p/twitch');

  assert.ok(twitch, 'das Plugin fehlt in allen Gruppen');
  assert.equal(twitch.href, `/guild/${G}/p/twitch`);
  assert.equal(twitch.label, 'Twitch');
});

test('Plugins landen bei den Inhalten - dort passen sie hin', () => {
  const { gruppen } = baueTabs(G, [
    { name: 'twitch', label: 'Twitch' },
    { name: 'regeln', label: 'Regeln' },
  ]);
  const inhalte = gruppen.find((g) => g.key === 'inhalte');
  const slugs = inhalte.tabs.map((t) => t.slug);

  assert.ok(slugs.includes('p/twitch'));
  assert.ok(slugs.includes('p/regeln'));
  // Und zwar neben YouTube, das thematisch dasselbe ist.
  assert.ok(slugs.includes('youtube'));
});

test('Ein Plugin darf seine Gruppe selbst wählen', () => {
  const { gruppen } = baueTabs(G, [{ name: 'xyz', label: 'XYZ', group: 'moderation' }]);
  const moderation = gruppen.find((g) => g.key === 'moderation');
  assert.ok(moderation.tabs.some((t) => t.slug === 'p/xyz'));
});

test('Eine unbekannte Gruppe lässt das Plugin nicht verschwinden', () => {
  // Ein Tippfehler in der plugin.json darf nicht dazu führen, dass der
  // Reiter nirgends auftaucht.
  const { gruppen } = baueTabs(G, [{ name: 'xyz', label: 'XYZ', group: 'gibtsnicht' }]);
  const alle = gruppen.flatMap((g) => g.tabs);
  assert.ok(alle.some((t) => t.slug === 'p/xyz'), 'das Plugin ist verschwunden');
});

test('Ohne Plugins bleiben die Gruppen wie sie sind', () => {
  const ohne = baueTabs(G);
  const anzahl = ohne.gruppen.map((g) => g.tabs.length);
  assert.deepEqual(
    anzahl,
    GRUPPEN.map((g) => g.tabs.length),
  );
});

test('Ein Plugin ohne Symbol bekommt trotzdem eines', () => {
  const { gruppen } = baueTabs(G, [{ name: 'xyz', label: 'XYZ' }]);
  const tab = gruppen.flatMap((g) => g.tabs).find((t) => t.slug === 'p/xyz');
  assert.ok(tab.icon, 'ohne Symbol bliebe die Stelle leer');
});

// --- Welche Gruppe ist offen? --------------------------------------------

test('Die Gruppe der aktuellen Seite wird erkannt', () => {
  const { gruppen } = baueTabs(G, [{ name: 'twitch', label: 'Twitch' }]);

  assert.equal(aktiveGruppe(`/guild/${G}/mitglieder`, gruppen), 'moderation');
  assert.equal(aktiveGruppe(`/guild/${G}/youtube`, gruppen), 'inhalte');
  assert.equal(aktiveGruppe(`/guild/${G}/rechte`, gruppen), 'server');
  assert.equal(aktiveGruppe(`/guild/${G}/p/twitch`, gruppen), 'inhalte', 'auch für Plugins');
});

test('Auf der Übersicht ist keine Gruppe offen', () => {
  const { gruppen } = baueTabs(G);
  assert.equal(aktiveGruppe(`/guild/${G}`, gruppen), null);
});

test('Ein unbekannter Pfad öffnet keine Gruppe', () => {
  const { gruppen } = baueTabs(G);
  assert.equal(aktiveGruppe(`/guild/${G}/gibtsnicht`, gruppen), null);
});

test('Der aktive Reiter wird genau erkannt', () => {
  assert.equal(istAktiv(`/guild/${G}/posts`, `/guild/${G}/posts`), true);
  // Kein Teiltreffer: /posts darf nicht auf /postsxyz anspringen.
  assert.equal(istAktiv(`/guild/${G}/posts`, `/guild/${G}/postsxyz`), false);
  assert.equal(istAktiv(`/guild/${G}`, `/guild/${G}/posts`), false);
});

// --- Sortierung -----------------------------------------------------------

test('Innerhalb einer Gruppe wird alphabetisch sortiert', () => {
  const { gruppen } = baueTabs(G);
  for (const g of gruppen) {
    const labels = g.tabs.map((t) => t.label);
    const sortiert = [...labels].sort((a, b) => a.localeCompare(b, 'de'));
    assert.deepEqual(labels, sortiert, `Gruppe "${g.label}" ist nicht sortiert`);
  }
});

test('Plugins reihen sich alphabetisch ein, nicht hinten an', () => {
  // Vorher hing die Reihenfolge davon ab, wie die Ordner gelesen wurden.
  const { gruppen } = baueTabs(G, [
    { name: 'twitch', label: 'Twitch' },
    { name: 'aaa', label: 'AAA-Plugin' },
  ]);
  const inhalte = gruppen.find((g) => g.key === 'inhalte');
  const labels = inhalte.tabs.map((t) => t.label);

  assert.equal(labels[0], 'AAA-Plugin', 'ein Plugin darf auch vorne stehen');
  assert.deepEqual(labels, [...labels].sort((a, b) => a.localeCompare(b, 'de')));
});

test('Die Reihenfolge hängt nicht davon ab, wie die Plugins ankommen', () => {
  // Sonst sähe die Leiste nach jedem Neustart anders aus.
  const a = baueTabs(G, [{ name: 'twitch', label: 'Twitch' }, { name: 'regeln', label: 'Regeln' }]);
  const b = baueTabs(G, [{ name: 'regeln', label: 'Regeln' }, { name: 'twitch', label: 'Twitch' }]);

  const labels = (r) => r.gruppen.flatMap((g) => g.tabs.map((t) => t.label));
  assert.deepEqual(labels(a), labels(b));
});

test('Umlaute werden richtig einsortiert', () => {
  // "Verstöße" muss zwischen V und W landen, nicht am Ende.
  const { gruppen } = baueTabs(G);
  const moderation = gruppen.find((g) => g.key === 'moderation');
  const labels = moderation.tabs.map((t) => t.label);
  assert.ok(labels.includes('Verstöße'));
  assert.deepEqual(labels, [...labels].sort((a, b) => a.localeCompare(b, 'de')));
});

