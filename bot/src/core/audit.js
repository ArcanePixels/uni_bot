import { now } from '@allrounder/shared';

/** Schreibt nachvollziehbar mit, wer was ausgeloest hat. */
export class AuditService {
  #stmt;

  constructor(db) {
    this.#stmt = db.prepare(
      `INSERT INTO audit_log (guild_id, actor_id, action, target, detail, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
    );
  }

  record({ guildId, actorId, action, target = null, detail = null }) {
    this.#stmt.run(guildId, actorId, action, target, detail, now());
  }
}
