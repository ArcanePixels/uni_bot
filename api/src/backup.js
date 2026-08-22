import { mkdirSync, readdirSync, statSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import Database from 'better-sqlite3';

/**
 * Sicherung der Datenbank.
 *
 * Bewusst ueber SQLites eigene Backup-Funktion statt die Datei zu kopieren:
 * Waehrend der Bot schreibt, waere eine Dateikopie moeglicherweise unbrauchbar
 * (halb geschriebene Seiten, WAL nicht eingearbeitet). `VACUUM INTO` erzeugt
 * dagegen eine in sich stimmige, bereits aufgeraeumte Kopie.
 */

/** Erzeugt einen Dateinamen aus dem Zeitpunkt: bot-2026-08-22_1510.sqlite */
export function backupName(date) {
  const p = (n) => String(n).padStart(2, '0');
  return `bot-${date.getFullYear()}-${p(date.getMonth() + 1)}-${p(date.getDate())}_${p(date.getHours())}${p(date.getMinutes())}.sqlite`;
}

/**
 * Bestimmt, welche Sicherungen weg dürfen.
 * Behalten wird die jüngste je Tag, und davon die letzten `keepDays` Tage.
 */
export function selectExpired(files, keepDays, now = new Date()) {
  const cutoff = now.getTime() - keepDays * 86400_000;
  const newestPerDay = new Map();

  for (const f of files) {
    const day = f.name.slice(4, 14); // "2026-08-22"
    const prev = newestPerDay.get(day);
    if (!prev || f.mtime > prev.mtime) newestPerDay.set(day, f);
  }
  const keep = new Set([...newestPerDay.values()].filter((f) => f.mtime >= cutoff).map((f) => f.name));

  // Die jüngste Sicherung bleibt in jedem Fall stehen. Ohne diese Regel wäre
  // nach längerer Auszeit des Dienstes irgendwann gar keine mehr da.
  if (keep.size === 0 && files.length > 0) {
    const newest = files.reduce((a, b) => (b.mtime > a.mtime ? b : a));
    keep.add(newest.name);
  }

  return files.filter((f) => !keep.has(f.name)).map((f) => f.name);
}

/**
 * Legt eine Sicherung an und räumt alte weg. Gibt den Pfad zurück.
 *
 * Das Zielverzeichnis heißt `targetDir` oder `backupDir` – die Konfiguration
 * des Dienstes nutzt den zweiten Namen. Beides zu akzeptieren erspart eine
 * Umbenennung an jeder Aufrufstelle; genau die war zuvor an einer Stelle
 * vergessen worden, wodurch die automatische Sicherung stillschweigend scheiterte.
 */
export function createBackup({
  databasePath,
  targetDir,
  backupDir,
  keepDays = 14,
  now = new Date(),
}) {
  const dir = targetDir ?? backupDir;
  if (!dir) throw new Error('Kein Zielverzeichnis angegeben (targetDir oder backupDir).');
  mkdirSync(dir, { recursive: true });
  const target = join(dir, backupName(now));

  const db = new Database(databasePath, { readonly: true });
  try {
    // VACUUM INTO braucht einen Pfad ohne Anführungszeichen-Probleme; da der
    // Name aus dem Zeitstempel entsteht, ist er unkritisch.
    db.exec(`VACUUM INTO '${target.replace(/'/g, "''")}'`);
  } finally {
    db.close();
  }

  const existing = readdirSync(dir)
    .filter((n) => n.startsWith('bot-') && n.endsWith('.sqlite'))
    .map((name) => ({ name, mtime: statSync(join(dir, name)).mtimeMs }));

  const removed = [];
  for (const name of selectExpired(existing, keepDays, now)) {
    try {
      unlinkSync(join(dir, name));
      removed.push(name);
    } catch {
      // Nicht schlimm - beim nächsten Lauf erneut versuchen.
    }
  }

  return { file: target, removed, kept: existing.length - removed.length };
}
