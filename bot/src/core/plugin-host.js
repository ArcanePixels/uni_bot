import { createLogger } from './logger.js';

const log = createLogger('plugins');

/**
 * Traegt die geladenen Plugins und reicht Discord-Events an sie weiter.
 * Ein Plugin ist ein Objekt { name, setup(ctx), teardown?() }.
 *
 * Wirft ein Plugin beim Behandeln eines Events, wird das geloggt und die
 * uebrigen Plugins laufen weiter - ein defektes Modul darf den Bot nicht kippen.
 */
export class PluginHost {
  #plugins = [];
  #ctx;

  constructor(ctx) {
    this.#ctx = ctx;
  }

  /**
   * Nimmt ein Plugin in Betrieb.
   *
   * `extra` ergaenzt den gemeinsamen Kontext um Plugin-Eigenes - etwa den
   * eigenen Datenspeicher und ein Log mit dem Plugin-Namen davor.
   */
  async register(plugin, extra = null) {
    if (!plugin?.name || typeof plugin.setup !== 'function') {
      throw new Error('Plugin braucht name und setup()');
    }
    const ctx = extra ? { ...this.#ctx, ...extra } : this.#ctx;
    const handlers = (await plugin.setup(ctx)) ?? {};
    this.#plugins.push({ plugin, handlers });
    log.info(`Plugin geladen: ${plugin.name}`);
  }

  /** Ruft `event` auf allen Plugins auf, die ihn anbieten. */
  async dispatch(event, ...args) {
    for (const { plugin, handlers } of this.#plugins) {
      const fn = handlers[event];
      if (typeof fn !== 'function') continue;
      try {
        await fn(...args);
      } catch (err) {
        log.error(`Plugin ${plugin.name} ist bei "${event}" gescheitert`, err);
      }
    }
  }

  async teardown() {
    for (const { plugin } of this.#plugins) {
      try {
        await plugin.teardown?.();
      } catch (err) {
        log.error(`Teardown von ${plugin.name} gescheitert`, err);
      }
    }
    this.#plugins = [];
  }

  get names() {
    return this.#plugins.map((p) => p.plugin.name);
  }
}
