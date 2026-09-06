/**
 * Raeumt alte Eintraege aus der Datenbank.
 *
 * Ohne das wachsen zwei Tabellen unbegrenzt weiter:
 *
 * - `audit_log`  — jede Moderationsmassnahme, jede Aenderung im Dashboard
 * - `infractions` — jeder Verstoss, auch laengst verjaehrte
 *
 * Beides waechst langsam, aber es hoert nie auf. Auf einem Server, der Jahre
 * laeuft, summiert sich das - und niemand denkt daran, bis die Platte voll ist
 * oder das Dashboard traege wird.
 *
 * Der Nachrichten-Log raeumt sich schon selbst auf (siehe plugins/message-log.js),
 * weil er die groessten Datenmengen erzeugt.
 */

/** Voreinstellungen in Tagen. Ueber die .env aenderbar. */
export const STANDARD = {
  auditDays: 180,
  // Deutlich laenger als die Verjaehrung im Automod (Standard 30 Tage):
  // Die Historie im Dashboard soll auch aeltere Faelle noch zeigen.
  infractionDays: 365,
};

/** Liest eine Tagesangabe aus der Umgebung. 0 schaltet das Aufraeumen ab. */
export function leseTage(wert, standard) {
  if (wert === undefined || wert === null || String(wert).trim() === '') return standard;
  const n = Number(wert);
  if (!Number.isFinite(n) || n < 0) return standard;
  return Math.floor(n);
}

/**
 * Entfernt Eintraege, die aelter als `tage` sind.
 * Gibt die Anzahl zurueck; 0 Tage heisst: nichts tun.
 */
export function raeumeTabelle(db, tabelle, tage, jetzt = Date.now()) {
  if (!tage || tage <= 0) return 0;
  // Der Tabellenname kommt ausschliesslich aus diesem Modul, nie von aussen.
  if (!/^[a-z_]+$/.test(tabelle)) throw new Error(`Unerlaubter Tabellenname: ${tabelle}`);

  const grenze = Math.floor(jetzt / 1000) - tage * 86400;
  const info = db.prepare(`DELETE FROM ${tabelle} WHERE created_at < ?`).run(grenze);
  return info.changes ?? 0;
}

/**
 * Startet das taegliche Aufraeumen.
 *
 * Gibt eine Funktion zum Beenden zurueck.
 */
export function starteAufraeumen({ db, log, env = process.env }) {
  const auditDays = leseTage(env.AUDIT_KEEP_DAYS, STANDARD.auditDays);
  const infractionDays = leseTage(env.INFRACTION_KEEP_DAYS, STANDARD.infractionDays);

  const durchlauf = () => {
    try {
      const audit = raeumeTabelle(db, 'audit_log', auditDays);
      const verstoesse = raeumeTabelle(db, 'infractions', infractionDays);
      if (audit || verstoesse) {
        log?.info(
          `Aufgeraeumt: ${audit} Audit-Eintraege, ${verstoesse} Verstoesse ` +
            `(aelter als ${auditDays} bzw. ${infractionDays} Tage)`,
        );
      }
    } catch (err) {
      // Ein Fehler beim Aufraeumen darf den Bot nicht stoeren.
      log?.warn(`Aufraeumen fehlgeschlagen: ${err.message}`);
    }
  };

  if (auditDays === 0 && infractionDays === 0) {
    log?.info('Automatisches Aufraeumen ist abgeschaltet.');
    return () => {};
  }

  log?.info(
    `Aufraeumen aktiv: Audit-Log ${auditDays || 'unbegrenzt'} Tage, ` +
      `Verstoesse ${infractionDays || 'unbegrenzt'} Tage`,
  );

  // Einmal kurz nach dem Start, damit ein lange gewachsener Bestand nicht
  // erst nach 24 Stunden schrumpft.
  const ersterLauf = setTimeout(durchlauf, 60_000);
  ersterLauf.unref?.();

  const timer = setInterval(durchlauf, 24 * 3600_000);
  timer.unref?.();

  return () => {
    clearTimeout(ersterLauf);
    clearInterval(timer);
  };
}
