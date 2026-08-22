import { readdirSync, existsSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createLogger } from './logger.js';

const log = createLogger('plugin-loader');

/**
 * Laedt zusaetzliche Plugins aus einem Verzeichnis.
 *
 * Damit lassen sich Erweiterungen einbinden, ohne den Bot-Code anzufassen:
 * Datei nach `plugins/` legen, Bot neu starten, fertig.
 *
 * Zwei Grundsaetze:
 * 1. Ein defektes Plugin darf den Bot nicht am Starten hindern - es wird
 *    uebersprungen und der Grund geloggt.
 * 2. Wer ein Plugin ablegt, gibt ihm volle Bot-Rechte. Das laesst sich
 *    technisch nicht einschraenken, deshalb steht es klar in der Anleitung.
 */

/** Ist der Eintrag eine ladbare Plugin-Datei oder ein Plugin-Ordner? */
function candidates(dir) {
  const out = [];
  for (const name of readdirSync(dir).sort()) {
    // Dateien mit _ oder . am Anfang gelten als privat (Hilfsmodule).
    if (name.startsWith('_') || name.startsWith('.')) continue;

    const full = join(dir, name);
    if (statSync(full).isDirectory()) {
      // Ordner-Plugin: index.js darin.
      const entry = join(full, 'index.js');
      if (existsSync(entry)) out.push({ name, path: entry });
      else log.warn(`Ordner "${name}" enthaelt keine index.js - uebersprungen`);
      continue;
    }
    if (name.endsWith('.js') || name.endsWith('.mjs')) out.push({ name, path: full });
  }
  return out;
}

/** Prueft, ob das Geladene wirklich ein Plugin ist. */
export function validatePlugin(mod, quelle) {
  const plugin = mod?.default;
  if (!plugin) return `${quelle}: kein Standard-Export (export default { ... })`;
  if (typeof plugin.name !== 'string' || !plugin.name.trim()) {
    return `${quelle}: das Plugin hat keinen "name"`;
  }
  if (typeof plugin.setup !== 'function') {
    return `${quelle}: das Plugin hat keine "setup(ctx)"-Funktion`;
  }
  return null;
}

/**
 * Laedt alle Plugins aus `dir`. Gibt die geladenen Plugins zurueck sowie eine
 * Liste dessen, was nicht geklappt hat - damit der Aufrufer das melden kann.
 */
export async function loadExternalPlugins(dir, knownNames = []) {
  const geladen = [];
  const fehler = [];

  const abs = resolve(dir);
  if (!existsSync(abs)) {
    log.debug(`Kein Plugin-Verzeichnis unter ${abs} - nichts zu laden`);
    return { geladen, fehler };
  }

  const belegt = new Set(knownNames);

  for (const { name, path } of candidates(abs)) {
    try {
      // Als Datei-URL importieren, sonst scheitert es unter Windows.
      const mod = await import(pathToFileURL(path).href);
      const problem = validatePlugin(mod, name);
      if (problem) {
        fehler.push(problem);
        continue;
      }

      const plugin = mod.default;
      if (belegt.has(plugin.name)) {
        // Zwei Plugins mit demselben Namen waeren im Log nicht auseinander-
        // zuhalten, und das zweite wuerde das erste stillschweigend verdecken.
        fehler.push(`${name}: der Plugin-Name "${plugin.name}" ist bereits vergeben`);
        continue;
      }

      belegt.add(plugin.name);
      geladen.push(plugin);
      log.info(`Externes Plugin gefunden: ${plugin.name} (${name})`);
    } catch (err) {
      // Ein kaputtes Plugin darf den Start nicht verhindern.
      fehler.push(`${name}: ${err.message}`);
    }
  }

  return { geladen, fehler };
}
