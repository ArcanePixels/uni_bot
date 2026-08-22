import { Router } from 'express';
import { SettingsStore } from '@allrounder/shared/settings';

export function settingsRoutes(db) {
  const router = Router();
  const store = new SettingsStore(db);

  router.get('/:guildId/settings', (req, res) => {
    res.json(store.get(req.params.guildId));
  });

  router.put('/:guildId/settings', (req, res) => {
    if (typeof req.body !== 'object' || req.body === null || Array.isArray(req.body)) {
      return res.status(400).json({ error: 'Body muss ein Objekt sein' });
    }
    res.json(store.set(req.params.guildId, req.body));
  });

  return router;
}
