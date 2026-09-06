/**
 * Daten von Servern, auf denen der Bot nicht mehr ist.
 *
 * Wird der Bot entfernt, bleiben seine Daten liegen. Sofort zu loeschen waere
 * falsch: Discord meldet einen Server auch bei einer Stoerung als weg, und die
 * Daten sind dann unwiederbringlich hin.
 *
 * Deshalb eine Schonfrist. Der Ablauf:
 *
 * 1. Der Bot sieht stuendlich nach, auf welchen Servern er ist.
 * 2. Fehlt einer, der Daten hat, beginnt die Frist (Standard 24 Stunden).
 * 3. Taucht er wieder auf, wird die Frist verworfen - als waere nichts gewesen.
 * 4. Ist er nach Ablauf immer noch weg, werden die Daten geloescht.
 *
 * 24 Stunden sind bewusst gewaehlt: Ein Discord-Ausfall dieser Laenge waere
 * ein Ereignis, von dem man aus jeder Zeitung erfaehrt. Wer trotzdem nichts
 * automatisch geloescht haben will, setzt ORPHAN_DELETE_HOURS auf 0.
 */
import { loescheGuild, zaehleDaten } from '@allrounder/shared/guild-loeschen';

/** Voreinstellungen. */
export const STANDARD = {
  fristStunden: 24,
  pruefIntervallMs: 60 * 60_000, // stuendlich
};

/** Legt die Tabelle an, in der die laufenden Fristen stehen. */
export function ensureTabelle(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS verwaiste_server (
      guild_id     TEXT PRIMARY KEY,
      vermisst_seit INTEGER NOT NULL,
      zuletzt_geprueft INTEGER NOT NULL
    );
  `);
}

/** Liest die Frist aus der Umgebung. 0 schaltet das Loeschen ab. */
export function leseFrist(wert, standard = STANDARD.fristStunden) {
  if (wert === undefined || wert === null || String(wert).trim() === '') return standard;
  const n = Number(wert);
  if (!Number.isFinite(n) || n < 0) return standard;
  return n;
}

/**
 * Ein Durchlauf: abgleichen, wer da ist, und wer lange genug weg war.
 *
 * `anwesend` ist die Menge der Server-IDs, auf denen der Bot gerade ist.
 * Bewusst als Parameter statt intern ermittelt - so laesst sich jeder Fall
 * direkt pruefen, ohne Discord.
 */
export function durchlauf({ db, anwesend, fristStunden, jetzt = Date.now(), log = null }) {
  ensureTabelle(db);
  const sekunden = Math.floor(jetzt / 1000);

  // Alle Server, fuer die ueberhaupt Daten da sind.
  const mitDaten = new Set(
    db
      .prepare('SELECT DISTINCT guild_id FROM guild_settings')
      .all()
      .map((r) => String(r.guild_id)),
  );

  const vermerkt = new Map(
    db
      .prepare('SELECT * FROM verwaiste_server')
      .all()
      .map((r) => [String(r.guild_id), r]),
  );

  const neuVermisst = [];
  const zurueck = [];
  const geloescht = [];

  // 1. Wer ist wieder da? Frist verwerfen.
  for (const [guildId] of vermerkt) {
    if (anwesend.has(guildId)) {
      db.prepare('DELETE FROM verwaiste_server WHERE guild_id = ?').run(guildId);
      zurueck.push(guildId);
    }
  }

  // 2. Wer fehlt neu?
  for (const guildId of mitDaten) {
    if (anwesend.has(guildId)) continue;
    if (vermerkt.has(guildId) && !zurueck.includes(guildId)) continue;

    db.prepare(
      `INSERT INTO verwaiste_server (guild_id, vermisst_seit, zuletzt_geprueft)
       VALUES (?, ?, ?)
       ON CONFLICT(guild_id) DO UPDATE SET zuletzt_geprueft = excluded.zuletzt_geprueft`,
    ).run(guildId, sekunden, sekunden);
    if (!vermerkt.has(guildId)) neuVermisst.push(guildId);
  }

  // 3. Wessen Frist ist abgelaufen?
  // Bei 0 Stunden wird nie geloescht - dann dient die Tabelle nur der Uebersicht.
  if (fristStunden > 0) {
    const grenze = sekunden - Math.round(fristStunden * 3600);
    const faellig = db
      .prepare('SELECT guild_id FROM verwaiste_server WHERE vermisst_seit <= ?')
      .all(grenze)
      .map((r) => String(r.guild_id))
      // Doppelt absichern: Wer gerade anwesend ist, wird nie geloescht -
      // auch wenn ein alter Eintrag noch herumliegt.
      .filter((id) => !anwesend.has(id));

    for (const guildId of faellig) {
      const vorher = zaehleDaten(db, guildId).gesamt;
      const bericht = loescheGuild(db, guildId);
      db.prepare('DELETE FROM verwaiste_server WHERE guild_id = ?').run(guildId);
      geloescht.push({ guildId, eintraege: bericht.gesamt || vorher });
      log?.warn(
        `Daten von Server ${guildId} geloescht: seit ${fristStunden} Stunden nicht mehr ` +
          `erreichbar (${bericht.gesamt} Eintraege).`,
      );
    }
  }

  // 4. Alle Zeitstempel auffrischen, damit die Uebersicht stimmt.
  db.prepare('UPDATE verwaiste_server SET zuletzt_geprueft = ?').run(sekunden);

  for (const id of neuVermisst) {
    log?.warn(
      `Server ${id} nicht mehr erreichbar. Die Daten werden in ${fristStunden} Stunden ` +
        `geloescht, falls er nicht zurueckkehrt.`,
    );
  }
  for (const id of zurueck) {
    log?.info(`Server ${id} ist wieder da - die Loeschfrist wurde verworfen.`);
  }

  return { neuVermisst, zurueck, geloescht };
}

/** Was steht gerade unter Frist? Fuer die Anzeige im Dashboard. */
export function offeneFristen(db, fristStunden = STANDARD.fristStunden, jetzt = Date.now()) {
  ensureTabelle(db);
  const sekunden = Math.floor(jetzt / 1000);
  return db
    .prepare('SELECT * FROM verwaiste_server ORDER BY vermisst_seit')
    .all()
    .map((r) => ({
      guildId: String(r.guild_id),
      vermisstSeit: r.vermisst_seit,
      stundenVerbleibend:
        fristStunden > 0
          ? Math.max(0, fristStunden - (sekunden - r.vermisst_seit) / 3600)
          : null,
    }));
}

/**
 * Startet die regelmaessige Pruefung.
 *
 * `holeAnwesend` liefert die Server-IDs, auf denen der Bot ist - als Funktion,
 * damit sie bei jedem Durchlauf frisch abgefragt wird.
 */
export function starteUeberwachung({ db, holeAnwesend, log, env = process.env }) {
  const fristStunden = leseFrist(env.ORPHAN_DELETE_HOURS);
  ensureTabelle(db);

  const tick = () => {
    try {
      const anwesend = holeAnwesend();
      // Eine leere Liste heisst fast immer: Die Verbindung steht gerade nicht.
      // Dann alles als verwaist zu werten, waere der schlimmste Fehler.
      if (!anwesend || anwesend.size === 0) {
        log?.debug?.('Keine Server sichtbar - Pruefung uebersprungen.');
        return;
      }
      durchlauf({ db, anwesend, fristStunden, log });
    } catch (err) {
      log?.warn(`Pruefung auf verwaiste Server fehlgeschlagen: ${err.message}`);
    }
  };

  if (fristStunden === 0) {
    log?.info('Verwaiste Server werden nur vermerkt, nicht geloescht (ORPHAN_DELETE_HOURS=0).');
  } else {
    log?.info(
      `Verwaiste Server: Daten werden nach ${fristStunden} Stunden ohne Erreichbarkeit geloescht.`,
    );
  }

  // Erst nach fuenf Minuten: Beim Start ist die Serverliste noch nicht
  // vollstaendig, und ein zu frueher Durchlauf wuerde alles als weg werten.
  const ersterLauf = setTimeout(tick, 5 * 60_000);
  ersterLauf.unref?.();

  const timer = setInterval(tick, STANDARD.pruefIntervallMs);
  timer.unref?.();

  return () => {
    clearTimeout(ersterLauf);
    clearInterval(timer);
  };
}
