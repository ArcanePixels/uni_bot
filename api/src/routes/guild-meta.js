import { Router } from 'express';
import { SETTINGS_SCHEMA } from '@allrounder/shared/settings-schema';
import { getGuildChannels, getGuildRoles, getGuild, DiscordError } from '../discord.js';
import { guildAccentColor } from '../icon-color.js';

/**
 * Liefert dem Dashboard alles, was es zum Aufbau der Oberflaeche braucht:
 * die Feldbeschreibung sowie die echten Kanaele und Rollen des Servers.
 */
export function guildMetaRoutes(botToken) {
  const router = Router();

  // Das Schema kommt aus dem Code, nicht aus Discord - kein Token noetig.
  router.get('/schema', (_req, res) => res.json(SETTINGS_SCHEMA));

  /**
   * Nur die Akzentfarbe. Das Layout braucht sonst nichts, wuerde ueber /meta
   * aber Kanaele und Rollen mitladen - drei Discord-Abfragen je Seitenaufruf
   * zusaetzlich, obwohl die Seite darunter dieselben Daten ohnehin holt.
   */
  router.get('/:guildId/accent', async (req, res, next) => {
    if (!botToken) return res.json({ accent: null });
    try {
      const guild = await getGuild(req.params.guildId, botToken);
      res.json({ accent: await guildAccentColor(guild.id, guild.icon) });
    } catch (err) {
      // Die Farbe ist Beiwerk - lieber ohne als mit Fehlerseite.
      if (err instanceof DiscordError) return res.json({ accent: null });
      next(err);
    }
  });

  router.get('/:guildId/meta', async (req, res, next) => {
    if (!botToken) {
      return res.status(503).json({
        error: 'DISCORD_TOKEN ist der API nicht bekannt - Kanaele und Rollen koennen nicht geladen werden.',
      });
    }
    try {
      // Parallel, damit die Seite nicht drei Roundtrips nacheinander wartet.
      const [guild, channels, roles] = await Promise.all([
        getGuild(req.params.guildId, botToken),
        getGuildChannels(req.params.guildId, botToken),
        getGuildRoles(req.params.guildId, botToken),
      ]);
      // Akzentfarbe aus dem Server-Icon. Schlaegt das fehl, bleibt sie null
      // und die Oberflaeche nutzt ihre Standardfarbe.
      const accent = await guildAccentColor(guild.id, guild.icon);
      res.json({ guild: { ...guild, accent }, channels, roles });
    } catch (err) {
      if (err instanceof DiscordError) {
        return res.status(err.status).json({ error: err.message });
      }
      next(err);
    }
  });

  return router;
}
