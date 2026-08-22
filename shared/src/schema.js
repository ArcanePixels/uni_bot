// Gemeinsames DB-Schema fuer Bot und API.
// Liegt bewusst nur an EINER Stelle - die Duplikation aus der Vorversion
// hatte zur Folge, dass Schemaaenderungen in zwei Dateien gepflegt werden mussten.

export const SCHEMA_VERSION = 5;

const STATEMENTS = [
  `CREATE TABLE IF NOT EXISTS guild_settings (
     guild_id      TEXT PRIMARY KEY,
     settings_json TEXT NOT NULL DEFAULT '{}',
     updated_at    INTEGER NOT NULL
   )`,

  `CREATE TABLE IF NOT EXISTS infractions (
     id         INTEGER PRIMARY KEY AUTOINCREMENT,
     guild_id   TEXT    NOT NULL,
     user_id    TEXT    NOT NULL,
     moderator  TEXT    NOT NULL DEFAULT 'automod',
     rule       TEXT    NOT NULL,
     action     TEXT    NOT NULL,
     reason     TEXT,
     created_at INTEGER NOT NULL,
     expires_at INTEGER
   )`,
  `CREATE INDEX IF NOT EXISTS idx_infractions_guild_user
     ON infractions (guild_id, user_id, created_at DESC)`,

  `CREATE TABLE IF NOT EXISTS scheduled_posts (
     id           INTEGER PRIMARY KEY AUTOINCREMENT,
     guild_id     TEXT    NOT NULL,
     channel_id   TEXT    NOT NULL,
     content      TEXT    NOT NULL,
     cron         TEXT,
     run_at       INTEGER,
     last_run_at  INTEGER,
     enabled      INTEGER NOT NULL DEFAULT 1,
     created_at   INTEGER NOT NULL
   )`,
  `CREATE INDEX IF NOT EXISTS idx_scheduled_enabled
     ON scheduled_posts (enabled, run_at)`,

  `CREATE TABLE IF NOT EXISTS youtube_feeds (
     id              INTEGER PRIMARY KEY AUTOINCREMENT,
     guild_id        TEXT    NOT NULL,
     channel_id      TEXT    NOT NULL,
     yt_channel_id   TEXT    NOT NULL,
     last_video_id   TEXT,
     last_checked_at INTEGER,
     template        TEXT,
     enabled         INTEGER NOT NULL DEFAULT 1,
     created_at      INTEGER NOT NULL,
     UNIQUE (guild_id, yt_channel_id)
   )`,

  // Reaction Roles: eine Nachricht, an der Emojis fuer Rollen haengen.
  `CREATE TABLE IF NOT EXISTS reaction_role_panels (
     id          INTEGER PRIMARY KEY AUTOINCREMENT,
     guild_id    TEXT    NOT NULL,
     channel_id  TEXT    NOT NULL,
     message_id  TEXT,
     title       TEXT    NOT NULL,
     description TEXT,
     mode        TEXT    NOT NULL DEFAULT 'multi',
     created_at  INTEGER NOT NULL
   )`,
  `CREATE TABLE IF NOT EXISTS reaction_role_options (
     id       INTEGER PRIMARY KEY AUTOINCREMENT,
     panel_id INTEGER NOT NULL,
     emoji    TEXT    NOT NULL,
     role_id  TEXT    NOT NULL,
     label    TEXT,
     position INTEGER NOT NULL DEFAULT 0,
     FOREIGN KEY (panel_id) REFERENCES reaction_role_panels (id) ON DELETE CASCADE
   )`,
  `CREATE INDEX IF NOT EXISTS idx_rr_panel ON reaction_role_options (panel_id)`,

  // Tickets: privater Kanal je Anfrage.
  `CREATE TABLE IF NOT EXISTS tickets (
     id           INTEGER PRIMARY KEY AUTOINCREMENT,
     guild_id     TEXT    NOT NULL,
     channel_id   TEXT    NOT NULL,
     user_id      TEXT    NOT NULL,
     subject      TEXT,
     status       TEXT    NOT NULL DEFAULT 'offen',
     closed_by    TEXT,
     created_at   INTEGER NOT NULL,
     closed_at    INTEGER
   )`,
  `CREATE INDEX IF NOT EXISTS idx_tickets_guild ON tickets (guild_id, status, created_at DESC)`,

  // Umfragen.
  `CREATE TABLE IF NOT EXISTS polls (
     id          INTEGER PRIMARY KEY AUTOINCREMENT,
     guild_id    TEXT    NOT NULL,
     channel_id  TEXT    NOT NULL,
     message_id  TEXT,
     question    TEXT    NOT NULL,
     options     TEXT    NOT NULL,
     multi       INTEGER NOT NULL DEFAULT 0,
     closes_at   INTEGER,
     closed      INTEGER NOT NULL DEFAULT 0,
     created_by  TEXT,
     created_at  INTEGER NOT NULL
   )`,
  `CREATE TABLE IF NOT EXISTS poll_votes (
     poll_id   INTEGER NOT NULL,
     user_id   TEXT    NOT NULL,
     option_ix INTEGER NOT NULL,
     voted_at  INTEGER NOT NULL,
     PRIMARY KEY (poll_id, user_id, option_ix),
     FOREIGN KEY (poll_id) REFERENCES polls (id) ON DELETE CASCADE
   )`,

  // Interessens-Gruppen fuer den Setup-Wizard: ein Icon, eine Rolle,
  // dazu die Kanaele, die es freischaltet.
  `CREATE TABLE IF NOT EXISTS interest_groups (
     id          INTEGER PRIMARY KEY AUTOINCREMENT,
     guild_id    TEXT    NOT NULL,
     emoji       TEXT    NOT NULL,
     label       TEXT    NOT NULL,
     role_id     TEXT    NOT NULL,
     channel_ids TEXT    NOT NULL DEFAULT '[]',
     preset      TEXT    NOT NULL DEFAULT 'write',
     position    INTEGER NOT NULL DEFAULT 0,
     created_at  INTEGER NOT NULL
   )`,
  `CREATE INDEX IF NOT EXISTS idx_interest_guild ON interest_groups (guild_id, position)`,

  // Rechteaenderungen mitschreiben, damit sie rueckgaengig gemacht werden koennen.
  `CREATE TABLE IF NOT EXISTS permission_changes (
     id          INTEGER PRIMARY KEY AUTOINCREMENT,
     guild_id    TEXT    NOT NULL,
     role_id     TEXT    NOT NULL,
     preset      TEXT    NOT NULL,
     snapshot    TEXT    NOT NULL,
     actor_id    TEXT,
     created_at  INTEGER NOT NULL
   )`,
  `CREATE INDEX IF NOT EXISTS idx_permchange_guild
     ON permission_changes (guild_id, created_at DESC)`,

  // Eigene Textbefehle (!regeln und dergleichen).
  // Anforderung einer sofortigen Pruefung. Die API setzt den Zeitstempel,
  // der Bot sieht ihn beim naechsten Tick und prueft ausserhalb der Reihe.
  // Ueber die Datenbank, weil Bot und API getrennte Prozesse sind.
  `CREATE TABLE IF NOT EXISTS check_requests (
     kind         TEXT PRIMARY KEY,
     requested_at INTEGER NOT NULL,
     handled_at   INTEGER
   )`,

  `CREATE TABLE IF NOT EXISTS custom_commands (
     id           INTEGER PRIMARY KEY AUTOINCREMENT,
     guild_id     TEXT    NOT NULL,
     name         TEXT    NOT NULL,
     response     TEXT    NOT NULL,
     role_id      TEXT,
     enabled      INTEGER NOT NULL DEFAULT 1,
     uses         INTEGER NOT NULL DEFAULT 0,
     last_used_at INTEGER,
     created_at   INTEGER NOT NULL,
     UNIQUE (guild_id, name)
   )`,

  // Mitschrift bearbeiteter und geloeschter Nachrichten.
  `CREATE TABLE IF NOT EXISTS message_log (
     id             INTEGER PRIMARY KEY AUTOINCREMENT,
     guild_id       TEXT    NOT NULL,
     channel_id     TEXT    NOT NULL,
     message_id     TEXT    NOT NULL,
     author_id      TEXT    NOT NULL,
     kind           TEXT    NOT NULL,
     content_before TEXT,
     content_after  TEXT,
     created_at     INTEGER NOT NULL
   )`,
  `CREATE INDEX IF NOT EXISTS idx_msglog_guild
     ON message_log (guild_id, created_at DESC)`,
  `CREATE INDEX IF NOT EXISTS idx_msglog_author
     ON message_log (guild_id, author_id, created_at DESC)`,

  `CREATE TABLE IF NOT EXISTS audit_log (
     id         INTEGER PRIMARY KEY AUTOINCREMENT,
     guild_id   TEXT    NOT NULL,
     actor_id   TEXT    NOT NULL,
     action     TEXT    NOT NULL,
     target     TEXT,
     detail     TEXT,
     created_at INTEGER NOT NULL
   )`,
  `CREATE INDEX IF NOT EXISTS idx_audit_guild
     ON audit_log (guild_id, created_at DESC)`,

  `CREATE TABLE IF NOT EXISTS schema_meta (
     key   TEXT PRIMARY KEY,
     value TEXT NOT NULL
   )`,
];

/**
 * Legt das Schema an, falls noch nicht vorhanden. Idempotent - Bot und API
 * rufen das beide beim Start auf, egal wer zuerst hochkommt.
 */
export function ensureSchema(db) {
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  const migrate = db.transaction(() => {
    for (const sql of STATEMENTS) db.exec(sql);
    db.prepare(
      `INSERT INTO schema_meta (key, value) VALUES ('version', ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
    ).run(String(SCHEMA_VERSION));
  });
  migrate();
  return db;
}
