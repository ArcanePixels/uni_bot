/**
 * Findet Plugin-Ordner und liest deren Manifeste.
 *
 * Bot, API und Dashboard schauen alle in denselben Ordner, brauchen aber
 * unterschiedliche Teile daraus. Damit sie sich nicht widersprechen, liest
 * dieses Modul die Ordner fuer alle drei ein.
 *
 * Grundsatz wie beim Bot-Plugin-Lader: Ein kaputtes Plugin darf den Start nicht
 * verhindern. Es wird uebersprungen und der Grund gemeldet.
 */
import { readdirSync, existsSync, readFileSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { validateManifest } from './plugin-manifest.js';

/** Standardort der Plugins. Innerhalb von /app, damit Node die Pakete findet. */
export const DEFAULT_PLUGIN_DIR = process.env.PLUGIN_DIR || '/app/plugins';

/**
 * Liest alle Plugin-Ordner unter `dir`.
 *
 * Gibt `{ plugins, fehler }` zurueck. Jedes Plugin enthaelt das Manifest sowie
 * die Pfade zu `bot.js` und `api.js`, sofern vorhanden.
 */
export function discoverPlugins(dir = DEFAULT_PLUGIN_DIR) {
  const plugins = [];
  const fehler = [];

  const abs = resolve(dir);
  if (!existsSync(abs)) return { plugins, fehler };

  let eintraege;
  try {
    eintraege = readdirSync(abs).sort();
  } catch (err) {
    return { plugins, fehler: [`Plugin-Ordner nicht lesbar: ${err.message}`] };
  }

  const belegt = new Set();

  for (const ordner of eintraege) {
    // _ und . am Anfang gelten als privat - so lassen sich Plugins abschalten,
    // ohne sie zu loeschen.
    if (ordner.startsWith('_') || ordner.startsWith('.')) continue;

    const voll = join(abs, ordner);
    try {
      if (!statSync(voll).isDirectory()) continue;
    } catch {
      continue;
    }

    const manifestPfad = join(voll, 'plugin.json');
    if (!existsSync(manifestPfad)) {
      // Einzelne .js-Dateien im Plugin-Ordner sind der alte Weg und werden
      // weiterhin vom Bot geladen - hier ist nur der neue Ordner-Aufbau gemeint.
      fehler.push(`${ordner}: keine plugin.json gefunden`);
      continue;
    }

    let manifest;
    try {
      manifest = JSON.parse(readFileSync(manifestPfad, 'utf8'));
    } catch (err) {
      fehler.push(`${ordner}/plugin.json ist kein gueltiges JSON: ${err.message}`);
      continue;
    }

    const { ok, fehler: probleme } = validateManifest(manifest);
    if (!ok) {
      fehler.push(`${ordner}/plugin.json: ${probleme.join('; ')}`);
      continue;
    }

    if (manifest.name !== ordner) {
      // Sonst waere unklar, welcher Name in der URL steht.
      fehler.push(`${ordner}: der Name im Manifest ist "${manifest.name}" - beides muss gleich sein`);
      continue;
    }

    if (belegt.has(manifest.name)) {
      fehler.push(`${ordner}: der Name "${manifest.name}" ist bereits vergeben`);
      continue;
    }
    belegt.add(manifest.name);

    const botPfad = join(voll, 'bot.js');
    const apiPfad = join(voll, 'api.js');
    plugins.push({
      name: manifest.name,
      dir: voll,
      manifest,
      botPath: existsSync(botPfad) ? botPfad : null,
      apiPath: existsSync(apiPfad) ? apiPfad : null,
    });
  }

  return { plugins, fehler };
}

/**
 * Nur das, was das Dashboard braucht: Name, Beschriftung, Symbol, Oberflaeche.
 *
 * Absichtlich ohne Dateipfade - die gehen den Browser nichts an.
 */
export function publicManifests(plugins) {
  return plugins
    .filter((p) => p.manifest.ui)
    .map((p) => ({
      name: p.manifest.name,
      label: p.manifest.label,
      icon: p.manifest.icon ?? null,
      description: p.manifest.description ?? null,
      ui: p.manifest.ui,
    }));
}
