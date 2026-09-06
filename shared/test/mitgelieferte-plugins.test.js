import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readdirSync, existsSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateManifest } from '../src/plugin-manifest.js';

/**
 * Wacht ueber die mitgelieferten Plugins.
 *
 * Hintergrund: `.gitignore` schliesst `plugins/*` aus, damit die eigenen
 * Plugins einer Installation nicht im Repo landen. Jedes mitgelieferte Plugin
 * braucht deshalb eine eigene Ausnahme - fehlt sie, ist das Plugin **nicht im
 * Repo** und fehlt auf jedem Server, ohne dass es beim Bauen auffaellt.
 *
 * Genau das ist mit `plugins/twitch/` passiert: Alles andere war da, nur der
 * Plugin-Ordner nicht. Im Log stand dann "1 Plugin(s): regeln", und die
 * Ursache lag an einer Stelle, an der niemand sucht.
 */

const WURZEL = fileURLToPath(new URL('../..', import.meta.url));
const PLUGINS = join(WURZEL, 'plugins');

/** Alle Plugin-Ordner (nicht die losen Beispieldateien). */
function pluginOrdner() {
  return readdirSync(PLUGINS)
    .filter((name) => !name.startsWith('_') && !name.startsWith('.'))
    .filter((name) => {
      try {
        return statSync(join(PLUGINS, name)).isDirectory();
      } catch {
        return false;
      }
    });
}

/** Ist git verfuegbar und sind wir in einem Repo? */
function imRepo() {
  try {
    execFileSync('git', ['rev-parse', '--git-dir'], { cwd: WURZEL, stdio: 'pipe' });
    return true;
  } catch {
    return false;
  }
}

test('Jedes mitgelieferte Plugin liegt wirklich im Repo', { skip: !imRepo() }, () => {
  const imGit = new Set(
    execFileSync('git', ['ls-files', 'plugins/'], { cwd: WURZEL, encoding: 'utf8' })
      .split('\n')
      .filter(Boolean)
      .map((pfad) => pfad.split('/')[1]),
  );

  const fehlend = pluginOrdner().filter((name) => !imGit.has(name));

  assert.deepEqual(
    fehlend,
    [],
    `Diese Plugins fehlen im Repo und damit auf jedem Server. ` +
      `In .gitignore je eine Zeile ergaenzen: ${fehlend.map((n) => `!plugins/${n}/`).join(' ')}`,
  );
});

test('Jedes mitgelieferte Plugin hat ein gueltiges Manifest', () => {
  for (const name of pluginOrdner()) {
    const pfad = join(PLUGINS, name, 'plugin.json');
    assert.ok(existsSync(pfad), `${name}: plugin.json fehlt`);

    const manifest = JSON.parse(
      execFileSync(process.execPath, ['-e', `process.stdout.write(require('fs').readFileSync(${JSON.stringify(pfad)}, 'utf8'))`], {
        encoding: 'utf8',
      }),
    );
    const { ok, fehler } = validateManifest(manifest);
    assert.ok(ok, `${name}: ${fehler.join('; ')}`);

    // Der Ordnername muss dem Namen im Manifest entsprechen - sonst wird das
    // Plugin beim Einlesen uebersprungen.
    assert.equal(manifest.name, name, `${name}: Name im Manifest weicht ab`);
  }
});

test('Es gibt ueberhaupt mitgelieferte Plugins', () => {
  // Falls die Ordner mal versehentlich verschwinden, faellt es hier auf.
  const ordner = pluginOrdner();
  assert.ok(ordner.length >= 2, `erwartet mindestens zwei, gefunden: ${ordner.join(', ')}`);
  assert.ok(ordner.includes('regeln'));
  assert.ok(ordner.includes('twitch'));
});
