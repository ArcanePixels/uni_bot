import { Cron } from 'croner';
import { openDatabase } from '@allrounder/shared';
import { createApp } from './app.js';
import { createBackup } from './backup.js';

const databasePath = process.env.DATABASE_PATH?.trim() || '/data/bot.sqlite';
const port = Number(process.env.API_PORT ?? 8080);
const token = process.env.API_TOKEN?.trim();

/**
 * Wer darf Sicherungen abrufen? Eine Sicherung enthaelt die Daten aller Server,
 * die diesen Bot nutzen - deshalb nur der Betreiber, nicht jeder Server-Admin.
 * Kommagetrennte Discord-User-IDs.
 */
const ownerIds = (process.env.OWNER_IDS ?? '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

const backupConfig = {
  databasePath,
  backupDir: process.env.BACKUP_DIR?.trim() || '/data/backups',
  keepDays: Number(process.env.BACKUP_KEEP_DAYS ?? 14),
  ownerIds,
};
// Standard: taeglich um 4 Uhr. Leer setzen schaltet die automatische Sicherung ab.
const backupCron = process.env.BACKUP_CRON ?? '0 4 * * *';

if (!token) {
  console.error('[api] API_TOKEN fehlt. Trage ihn in die .env ein (siehe docs/setup.md).');
  process.exit(1);
}

// Optional: mit Bot-Token kann die API Kanal- und Rollenlisten fuer das
// Dashboard liefern. Fehlt er, laufen alle uebrigen Endpunkte normal weiter.
const botToken = process.env.DISCORD_TOKEN?.trim() || null;
if (!botToken) {
  console.warn('[api] Kein DISCORD_TOKEN gesetzt - Kanal-/Rollenlisten stehen nicht bereit.');
}
if (ownerIds.length === 0) {
  console.warn(
    '[api] OWNER_IDS ist leer - Sicherungen sind ueber das Dashboard nicht abrufbar. ' +
      'Die automatische Sicherung laeuft trotzdem.',
  );
}

// Beide Prozesse legen das Schema selbst an - so ist es egal, wer zuerst startet.
const db = openDatabase(databasePath);
const server = createApp(db, token, botToken, backupConfig).listen(port, () => {
  console.log(`[api] Lauscht auf Port ${port}`);
});

// Automatische Sicherung. Laeuft im API-Prozess, weil der ohnehin schon
// lesenden Zugriff auf die Datenbank hat.
let backupJob = null;
if (backupCron.trim()) {
  try {
    backupJob = new Cron(backupCron, () => {
      try {
        const r = createBackup(backupConfig);
        console.log(
          `[api] Sicherung erstellt: ${r.file}` +
            (r.removed.length ? ` (${r.removed.length} alte entfernt)` : ''),
        );
      } catch (err) {
        console.error('[api] Sicherung fehlgeschlagen', err);
      }
    });
    console.log(
      `[api] Automatische Sicherung: ${backupCron} nach ${backupConfig.backupDir}, ` +
        `${backupConfig.keepDays} Tage Aufbewahrung`,
    );
  } catch (err) {
    console.error(`[api] Ungueltiger BACKUP_CRON "${backupCron}" - keine automatische Sicherung`, err);
  }
} else {
  console.warn('[api] Automatische Sicherung ist abgeschaltet (BACKUP_CRON leer).');
}

function shutdown(signal) {
  console.log(`[api] ${signal} empfangen, fahre herunter`);
  backupJob?.stop();
  server.close(() => {
    db.close();
    process.exit(0);
  });
}
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
