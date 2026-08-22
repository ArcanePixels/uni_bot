import Database from 'better-sqlite3';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { ensureSchema } from './schema.js';

/**
 * Oeffnet die SQLite-Datei und stellt sicher, dass das Schema steht.
 * Der Ordner wird bei Bedarf angelegt - beim ersten Start im frischen
 * Container existiert /data/ zwar, bei lokalen Laeufen aber nicht immer.
 */
export function openDatabase(path) {
  mkdirSync(dirname(path), { recursive: true });
  const db = new Database(path);
  ensureSchema(db);
  return db;
}

export const now = () => Math.floor(Date.now() / 1000);
