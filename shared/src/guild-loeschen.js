/**
 * Loescht alle Daten eines Servers.
 *
 * Zwei Faelle, in denen das gebraucht wird:
 *
 * - Jemand wirft den Bot von seinem Server. Ohne dieses Modul blieben die
 *   Daten still liegen - auf einem Server, den man nie mehr betritt.
 * - Jemand will seine Daten geloescht haben. Sobald Fremde den Bot nutzen,
 *   ist das nicht nur Aufraeumen, sondern eine berechtigte Forderung.
 *
 * Der Kernpunkt: Es muss **jede** Tabelle erfassen, auch die von Plugins, die
 * es zum Zeitpunkt dieser Zeilen noch gar nicht gibt. Deshalb wird nicht eine
 * feste Liste gepflegt, sondern zur Laufzeit gefragt, welche Tabellen eine
 * `guild_id` haben. Eine vergessene Tabelle waere sonst genau die, in der
 * Daten zurueckbleiben.
 */

/**
 * Alle Tabellen, die Daten je Server halten.
 *
 * Fragt die Datenbank selbst - so sind Plugin-Tabellen automatisch dabei.
 */
export function tabellenMitGuildId(db) {
  const tabellen = db
    .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'")
    .all()
    .map((t) => t.name);

  return tabellen.filter((name) => {
    // Der Name kommt aus sqlite_master, ist also bereits ein existierender
    // Tabellenname - trotzdem pruefen, bevor er in SQL landet.
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(name)) return false;
    const spalten = db.prepare(`PRAGMA table_info(${name})`).all();
    return spalten.some((c) => c.name === 'guild_id');
  });
}

/**
 * Zaehlt, was fuer einen Server gespeichert ist.
 *
 * Fuer die Rueckfrage vor dem Loeschen: Wer bestaetigt, soll wissen, was
 * verschwindet.
 */
export function zaehleDaten(db, guildId) {
  const ergebnis = {};
  let gesamt = 0;

  for (const tabelle of tabellenMitGuildId(db)) {
    const { n } = db
      .prepare(`SELECT COUNT(*) AS n FROM ${tabelle} WHERE guild_id = ?`)
      .get(String(guildId));
    if (n > 0) {
      ergebnis[tabelle] = n;
      gesamt += n;
    }
  }

  return { tabellen: ergebnis, gesamt };
}

/**
 * Loescht alle Daten eines Servers.
 *
 * Laeuft als **eine** Transaktion: Entweder ist alles weg oder nichts. Ein
 * Abbruch mittendrin hinterliesse sonst einen halb geloeschten Zustand, der
 * schlimmer waere als gar nicht zu loeschen.
 *
 * Gibt zurueck, was aus welcher Tabelle entfernt wurde.
 */
export function loescheGuild(db, guildId) {
  // Streng pruefen, bevor irgendetwas geloescht wird. `String(null)` ergibt
  // "null" - ohne diese Pruefung wuerde ein versehentliches null oder
  // undefined als gueltige ID durchgehen.
  if (guildId === null || guildId === undefined) {
    throw new Error('Ohne guild_id wird nichts geloescht.');
  }
  const id = String(guildId).trim();
  if (!id) throw new Error('Ohne guild_id wird nichts geloescht.');

  const tabellen = tabellenMitGuildId(db);
  const entfernt = {};

  const alsBlock = db.transaction(() => {
    for (const tabelle of tabellen) {
      const info = db.prepare(`DELETE FROM ${tabelle} WHERE guild_id = ?`).run(id);
      if (info.changes > 0) entfernt[tabelle] = info.changes;
    }
  });
  alsBlock();

  const gesamt = Object.values(entfernt).reduce((a, b) => a + b, 0);
  return { tabellen: entfernt, gesamt, geprueft: tabellen.length };
}
