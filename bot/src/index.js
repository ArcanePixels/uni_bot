import { pathToFileURL } from 'node:url';
import { Client, GatewayIntentBits, Partials } from 'discord.js';
import { openDatabase } from '@allrounder/shared';
import { loadConfig } from './config.js';
import { createLogger } from './core/logger.js';
import { SettingsStore } from '@allrounder/shared/settings';
import { InfractionService } from './core/infractions.js';
import { AuditService } from './core/audit.js';
import { PluginHost } from './core/plugin-host.js';
import { loadExternalPlugins } from './core/plugin-loader.js';
import { starteAufraeumen } from './core/aufraeumen.js';
import { starteUeberwachung } from './core/verwaiste-server.js';
import { discoverPlugins } from '@allrounder/shared/plugin-discovery';
import { createPluginStore } from '@allrounder/shared/plugin-store';

import automod from './plugins/automod.js';
import welcome from './plugins/welcome.js';
import scheduler from './plugins/scheduler.js';
import youtube from './plugins/youtube.js';
import reactionRoles from './plugins/reaction-roles.js';
import antiraid from './plugins/antiraid.js';
import polls from './plugins/polls.js';
import tickets from './plugins/tickets.js';
import commands from './plugins/commands.js';
import customCommands from './plugins/custom-commands.js';
import messageLog from './plugins/message-log.js';

const log = createLogger('bot');

/** Die mitgelieferten Plugins. Eigene kommen aus PLUGIN_DIR dazu. */
const PLUGINS = [
  automod, welcome, scheduler, youtube,
  reactionRoles, antiraid, polls, tickets,
  commands, customCommands, messageLog,
];

const config = loadConfig();
const db = openDatabase(config.databasePath);
log.info(`Datenbank bereit: ${config.databasePath}`);

const settings = new SettingsStore(db);
const infractions = new InfractionService(db);
const audit = new AuditService(db);

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    // Fuer Reaction Roles, Umfragen und Tickets.
    GatewayIntentBits.GuildMessageReactions,
  ],
  // Reaktionen kommen auch fuer Nachrichten, die der Bot nicht zwischen-
  // gespeichert hat - ohne diese Partials wuerden solche Events verschluckt.
  partials: [Partials.GuildMember, Partials.Message, Partials.Reaction, Partials.User],
});

const host = new PluginHost({ client, db, settings, infractions, audit });

// Audit-Log und Verstoesse wuchsen bisher unbegrenzt weiter. Ueber
// AUDIT_KEEP_DAYS und INFRACTION_KEEP_DAYS einstellbar, 0 schaltet ab.
const stoppeAufraeumen = starteAufraeumen({ db, log });

// Server, auf denen der Bot nicht mehr ist: Daten nach einer Schonfrist
// loeschen. Ueber ORPHAN_DELETE_HOURS einstellbar, 0 schaltet das Loeschen ab.
const stoppeUeberwachung = starteUeberwachung({
  db,
  // Frisch bei jedem Durchlauf - waehrend einer Stoerung ist die Liste leer,
  // und darauf reagiert die Ueberwachung von selbst.
  holeAnwesend: () => new Set(client.guilds.cache.map((g) => String(g.id))),
  log,
});

/**
 * Die API schreibt in dieselbe Datei, ohne dass der Bot davon erfaehrt.
 * Statt Cache-Invalidierung ueber einen Kanal zwischen den Containern
 * pollen wir die juengste Aenderung - simpel und ausreichend, weil
 * Settings-Aenderungen selten sind.
 */
let lastSeenUpdate = 0;
const pollSettings = setInterval(() => {
  try {
    const row = db.prepare('SELECT MAX(updated_at) AS ts FROM guild_settings').get();
    if (row?.ts && row.ts > lastSeenUpdate) {
      lastSeenUpdate = row.ts;
      settings.invalidate();
      log.debug('Settings-Cache verworfen (externe Aenderung erkannt)');
    }
  } catch (err) {
    log.warn('Settings-Poll fehlgeschlagen', err);
  }
}, config.settingsPollMs);
pollSettings.unref?.();

client.on('messageCreate', (m) => host.dispatch('messageCreate', m));
client.on('guildMemberAdd', (m) => host.dispatch('guildMemberAdd', m));
client.on('messageReactionAdd', (r, u) => host.dispatch('messageReactionAdd', r, u));
client.on('messageReactionRemove', (r, u) => host.dispatch('messageReactionRemove', r, u));
client.on('interactionCreate', (i) => host.dispatch('interactionCreate', i));
client.on('messageUpdate', (b, a) => host.dispatch('messageUpdate', b, a));
client.on('messageDelete', (m) => host.dispatch('messageDelete', m));

/**
 * Der Bot wurde von einem Server entfernt.
 *
 * Hier wird **nicht** geloescht. Discord feuert dieses Ereignis auch bei einem
 * Ausfall oder waehrend einer Stoerung - die Daten dann wegzuwerfen waere
 * unumkehrbar und im Zweifel falsch.
 *
 * Stattdessen ein Vermerk im Log: Wer aufraeumen will, tut das bewusst ueber
 * das Dashboard oder den Endpunkt.
 */
client.on('guildDelete', (guild) => {
  if (!guild?.available) {
    // available === false heisst: Discord hat gerade eine Stoerung, der
    // Server ist nur voruebergehend weg.
    log.warn(`Server ${guild?.id} voruebergehend nicht erreichbar (Discord-Stoerung)`);
    return;
  }
  log.info(
    `Vom Server "${guild.name}" (${guild.id}) entfernt. ` +
      `Die Daten bleiben zunaechst erhalten - siehe ORPHAN_DELETE_HOURS.`,
  );
});
client.on('error', (err) => log.error('Discord-Client-Fehler', err));
client.on('shardError', (err) => log.error('Gateway-Fehler', err));

client.once('clientReady', async () => {
  log.info(`Angemeldet als ${client.user.tag} auf ${client.guilds.cache.size} Server(n)`);
  await host.dispatch('ready');
});

async function shutdown(signal) {
  log.info(`${signal} empfangen, fahre herunter`);
  clearInterval(pollSettings);
  stoppeAufraeumen();
  stoppeUeberwachung();
  await host.teardown();
  await client.destroy();
  db.close();
  process.exit(0);
}
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

// Ein unbehandelter Fehler soll den Container neu starten lassen, statt den
// Bot in einem halb-toten Zustand weiterlaufen zu lassen.
process.on('unhandledRejection', (err) => {
  log.error('Unbehandelte Promise-Rejection', err);
});

for (const plugin of PLUGINS) await host.register(plugin);

// Eigene Plugins aus dem Erweiterungsverzeichnis. Fehlt das Verzeichnis,
// passiert schlicht nichts.
// Innerhalb von /app, damit Node die Pakete des Bots findet - es sucht
// node_modules nur oberhalb des Modulpfads.
const pluginDir = process.env.PLUGIN_DIR?.trim() || '/app/plugins';
const { geladen, fehler } = await loadExternalPlugins(
  pluginDir,
  PLUGINS.map((p) => p.name),
);
for (const plugin of geladen) {
  try {
    await host.register(plugin);
  } catch (err) {
    // Ein defektes Plugin darf den Bot nicht am Starten hindern.
    fehler.push(`${plugin.name}: ${err.message}`);
  }
}

// Ordner-Plugins: eigener Aufbau mit plugin.json. Die bekommen ihren
// Datenspeicher vom Grundsystem gestellt - passend zu den Feldern, die im
// Manifest stehen. Deshalb braucht so ein Plugin keine eigenen Tabellen mehr.
const { plugins: ordnerPlugins, fehler: ordnerFehler } = discoverPlugins(pluginDir);
fehler.push(...ordnerFehler);
let ordnerAktiv = 0;
for (const p of ordnerPlugins) {
  if (!p.botPath) continue; // Ein Plugin darf auch reine Oberflaeche sein.
  try {
    const mod = await import(pathToFileURL(p.botPath).href);
    const plugin = mod.default;
    if (!plugin?.name || typeof plugin.setup !== 'function') {
      fehler.push(`${p.name}/bot.js: kein gueltiges Plugin (name und setup(ctx) noetig)`);
      continue;
    }
    if (host.names.includes(plugin.name)) {
      fehler.push(`${p.name}: der Name "${plugin.name}" ist bereits vergeben`);
      continue;
    }
    await host.register(plugin, {
      store: createPluginStore(db, p.manifest),
      manifest: p.manifest,
      log: createLogger(`plugin:${p.name}`),
    });
    ordnerAktiv++;
  } catch (err) {
    fehler.push(`${p.name}: ${err.message}`);
  }
}
if (fehler.length) {
  log.error(`${fehler.length} Plugin(s) konnten nicht geladen werden:`);
  for (const f of fehler) log.error(`  - ${f}`);
}
if (geladen.length || ordnerAktiv) {
  log.info(`${geladen.length + ordnerAktiv} externe(s) Plugin(s) aktiv`);
}

try {
  await client.login(config.token);
} catch (err) {
  // Die haeufigsten Startfehler mit klarer Ansage statt rohem Stacktrace -
  // sonst sucht man den Fehler im Code statt in der Konfiguration.
  if (err.code === 'TokenInvalid') {
    log.error(
      'Der DISCORD_TOKEN wird von Discord abgelehnt. Pruefe, ob er vollstaendig ' +
        'und aktuell ist (Developer Portal -> Bot -> Reset Token). Nach einem ' +
        'Reset wird der alte Token sofort ungueltig.',
    );
  } else if (err.code === 'DisallowedIntents') {
    log.error(
      'Discord verweigert die angeforderten Intents. Aktiviere im Developer Portal ' +
        'unter Bot -> Privileged Gateway Intents BEIDE Schalter: ' +
        '"Server Members Intent" und "Message Content Intent".',
    );
  } else {
    log.error('Anmeldung bei Discord fehlgeschlagen', err);
  }
  process.exit(1);
}
