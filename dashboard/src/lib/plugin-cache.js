import { api } from './api.js';

/**
 * Zwischenspeicher der Plugin-Liste.
 *
 * Die Liste steht bei jedem Seitenaufruf in den Reitern - ohne Speicher waere
 * das eine API-Anfrage pro Aufruf UND pro Server-Action. Genau daran hing schon
 * einmal die Drosselung.
 *
 * Die Liste aendert sich nur beim Neustart des Bots (dann werden die Ordner neu
 * eingelesen), deshalb darf sie deutlich laenger stehenbleiben als die
 * Discord-Daten. Fuenf Minuten heisst: Nach dem Ablegen eines neuen Plugins und
 * einem Neustart ist der Reiter spaetestens dann da.
 */
const CACHE_MS = 5 * 60_000;

let cache = null; // { zeit, plugins }
let laufend = null; // laufende Anfrage, damit parallele Aufrufe sich anhaengen

/** Nur fuer Tests - wirft den Speicher weg. */
export function resetPluginCache() {
  cache = null;
  laufend = null;
}

/**
 * Die Plugins fuer die Reiter. Faellt die API aus, gibt es eine leere Liste
 * statt eines Fehlers - ohne Plugins ist das Dashboard voll benutzbar, und ein
 * kaputter Reiter waere die schlechtere Antwort.
 */
export async function getPluginList() {
  if (cache && Date.now() - cache.zeit < CACHE_MS) return cache.plugins;

  // Mehrere Aufrufe gleichzeitig (Layout und Seite) sollen sich eine Anfrage
  // teilen, statt jeweils eine eigene zu stellen.
  if (laufend) return laufend;

  laufend = (async () => {
    try {
      const antwort = await api.getPlugins();
      const plugins = antwort?.plugins ?? [];
      cache = { zeit: Date.now(), plugins };
      return plugins;
    } catch {
      // Alte Liste weiterverwenden, wenn es eine gibt.
      return cache?.plugins ?? [];
    } finally {
      laufend = null;
    }
  })();

  return laufend;
}
