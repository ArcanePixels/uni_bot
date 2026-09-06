import express from 'express';
import { bearerAuth } from './auth.js';
import { settingsRoutes } from './routes/settings.js';
import { infractionRoutes } from './routes/infractions.js';
import { scheduledRoutes } from './routes/scheduled.js';
import { youtubeRoutes } from './routes/youtube.js';
import { auditRoutes } from './routes/audit.js';
import { guildMetaRoutes } from './routes/guild-meta.js';
import { moderationRoutes } from './routes/moderation.js';
import { featureRoutes } from './routes/features.js';
import { wizardRoutes } from './routes/wizard.js';
import { backupRoutes } from './routes/backup.js';
import { commandRoutes } from './routes/commands.js';
import { pluginRoutes } from './routes/plugins.js';
import { guildDatenRoutes } from './routes/guild-daten.js';
import { twitchWebhookRoutes, ensureTwitchEventTable } from './routes/twitch-webhook.js';

/**
 * Baut die API.
 *
 * `plugins` sind die von `discoverPlugins` gefundenen Ordner, `pluginRouters`
 * die von deren optionalen `api.js` gelieferten Zusatz-Router. Beides ist
 * optional - ohne Plugins laeuft alles wie zuvor.
 */
export function createApp(
  db,
  apiToken,
  botToken = null,
  backupConfig = null,
  plugins = [],
  pluginRouters = new Map(),
  twitchWebhookSecret = null,
) {
  const app = express();

  // Der Twitch-Webhook MUSS vor express.json() stehen: Die Signatur wird ueber
  // den unveraenderten Text der Anfrage gebildet. Waere der schon geparst und
  // wieder zusammengesetzt, stimmte sie nicht mehr.
  //
  // Er liegt ausserdem bewusst ausserhalb der Token-Pruefung - Twitch kennt
  // unser API-Token nicht und weist sich stattdessen per Signatur aus.
  if (twitchWebhookSecret) {
    ensureTwitchEventTable(db);
    app.use('/twitch/webhook', twitchWebhookRoutes(db, { secret: twitchWebhookSecret }));
  }

  app.use(express.json({ limit: '256kb' }));

  // Healthcheck bewusst ohne Auth, damit Docker den Container pruefen kann.
  app.get('/health', (_req, res) => res.json({ ok: true }));

  // Sicherungen betreffen den ganzen Dienst, nicht einen einzelnen Server -
  // deshalb ausserhalb von /api/guilds, aber ebenso mit Token geschuetzt.
  if (backupConfig) {
    const sys = express.Router();
    sys.use(bearerAuth(apiToken));
    sys.use(backupRoutes(backupConfig));
    app.use('/api/system', sys);
  }

  const guilds = express.Router();
  guilds.use(bearerAuth(apiToken));
  guilds.use(settingsRoutes(db));
  guilds.use(infractionRoutes(db));
  guilds.use(scheduledRoutes(db));
  guilds.use(youtubeRoutes(db));
  guilds.use(auditRoutes(db));
  guilds.use(guildMetaRoutes(botToken));
  guilds.use(moderationRoutes(db, botToken));
  guilds.use(featureRoutes(db, botToken));
  guilds.use(wizardRoutes(db, botToken));
  guilds.use(commandRoutes(db));
  guilds.use(guildDatenRoutes(db));

  // Plugins: eine Route fuer beliebig viele Erweiterungen. Steht bewusst am
  // Ende, damit ein Plugin keinen Endpunkt des Grundsystems verdecken kann.
  const { router: pluginRouter } = pluginRoutes(db, plugins, pluginRouters, botToken);
  guilds.use(pluginRouter);

  app.use('/api/guilds', guilds);

  app.use((_req, res) => res.status(404).json({ error: 'Unbekannter Endpunkt' }));

  // Zentrale Fehlerbehandlung: nie einen Stacktrace nach aussen geben.
  app.use((err, _req, res, _next) => {
    // Erwartbare Client-Fehler sind keine Stoerung des Dienstes - die wuerden
    // das Log sonst bei jedem fehlerhaften Aufruf mit Stacktraces fluten.
    if (err.type === 'entity.parse.failed') {
      return res.status(400).json({ error: 'Ungueltiges JSON' });
    }
    if (err.type === 'entity.too.large') {
      return res.status(413).json({ error: 'Body zu gross' });
    }
    console.error('[api] Unbehandelter Fehler', err);
    res.status(500).json({ error: 'Interner Fehler' });
  });

  return app;
}
