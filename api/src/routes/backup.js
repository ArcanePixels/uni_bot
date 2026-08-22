import { Router } from 'express';
import { readdirSync, statSync, createReadStream, existsSync } from 'node:fs';
import { join, basename } from 'node:path';
import { createBackup } from '../backup.js';

/**
 * Sicherungen: Übersicht, manuell auslösen, herunterladen.
 *
 * Die automatische Sicherung läuft als Zeitplan im API-Prozess (siehe index.js).
 *
 * **Zugriff bewusst eingeschränkt:** Eine Sicherung enthält die Daten *aller*
 * Server, die diesen Bot nutzen – Einstellungen, Verstöße, Nachrichten-Logs.
 * Wer auf irgendeinem Server Admin ist, dürfte sie sonst herunterladen und
 * käme an fremde Daten. Deshalb entscheidet `ownerIds`, wer das darf; ist die
 * Liste leer, sind die Sicherungen für niemanden über das Dashboard erreichbar.
 */
export function backupRoutes({ databasePath, backupDir, keepDays, ownerIds = [] }) {
  const router = Router();

  /**
   * Der Aufrufer schickt seine Discord-User-ID mit. Das Dashboard setzt sie
   * serverseitig aus der geprüften Sitzung – der Browser kann sie nicht fälschen,
   * weil er das API-Token gar nicht kennt.
   */
  const requireOwner = (req, res) => {
    const actor = String(req.query.actorId ?? req.body?.actorId ?? '');
    if (ownerIds.length === 0) {
      res.status(403).json({
        error:
          'Sicherungen sind über das Dashboard nicht freigegeben. Trage deine Discord-User-ID ' +
          'in OWNER_IDS ein (siehe docs/befehle-und-sicherung.md).',
      });
      return true;
    }
    if (!ownerIds.includes(actor)) {
      res.status(403).json({
        error: 'Sicherungen darf nur der Betreiber dieser Installation abrufen.',
      });
      return true;
    }
    return false;
  };

  const list = () => {
    if (!existsSync(backupDir)) return [];
    return readdirSync(backupDir)
      .filter((n) => n.startsWith('bot-') && n.endsWith('.sqlite'))
      .map((name) => {
        const s = statSync(join(backupDir, name));
        return { name, size: s.size, createdAt: Math.floor(s.mtimeMs / 1000) };
      })
      .sort((a, b) => b.createdAt - a.createdAt);
  };

  router.get('/backups', (req, res) => {
    if (requireOwner(req, res)) return;
    res.json({ backups: list(), keepDays, directory: backupDir });
  });

  router.post('/backups', (req, res, next) => {
    if (requireOwner(req, res)) return;
    try {
      const result = createBackup({ databasePath, targetDir: backupDir, keepDays });
      res.status(201).json({
        file: basename(result.file),
        removed: result.removed,
        backups: list(),
      });
    } catch (err) {
      next(err);
    }
  });

  router.get('/backups/:name', (req, res) => {
    if (requireOwner(req, res)) return;
    // Nur Dateien aus dem Sicherungsverzeichnis - kein Pfad-Ausbruch.
    const name = basename(req.params.name);
    if (!/^bot-[\d-]+_\d{4}\.sqlite$/.test(name)) {
      return res.status(400).json({ error: 'Ungültiger Dateiname' });
    }
    const file = join(backupDir, name);
    if (!existsSync(file)) return res.status(404).json({ error: 'Nicht gefunden' });

    res.setHeader('Content-Type', 'application/octet-stream');
    res.setHeader('Content-Disposition', `attachment; filename="${name}"`);
    createReadStream(file).pipe(res);
  });

  return router;
}
