/**
 * Speicher fuer Plugin-Daten - nach Manifest, ohne eigenen Code im Plugin.
 *
 * Ein Plugin beschreibt in seiner `ui`, welche Felder und Listen es hat. Daraus
 * entstehen hier die Tabellen und der Zugriff darauf. So braucht ein Plugin fuer
 * den Normalfall gar keine `api.js` mehr.
 *
 * Sicherheit: Feldnamen stammen aus dem Manifest und werden in SQL eingesetzt.
 * Deshalb laesst `validateManifest` nur Buchstaben, Ziffern und _ als key zu -
 * und hier wird zusaetzlich geprueft. Werte gehen immer als Parameter, nie
 * in den SQL-Text.
 */
import { tableName } from './plugin-manifest.js';

/** Doppelte Absicherung - der einzige Ort, an dem Namen in SQL landen. */
function sicherName(name) {
  if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(name)) {
    throw new Error(`Unerlaubter Bezeichner: ${name}`);
  }
  return name;
}

/** SQLite-Spaltentyp fuer einen Feldtyp aus dem Manifest. */
function spaltenTyp(feldTyp) {
  return feldTyp === 'number' || feldTyp === 'boolean' ? 'INTEGER' : 'TEXT';
}

/** Wandelt einen Wert aus dem Browser in etwas, das SQLite speichern kann. */
export function normalisiere(feld, wert) {
  if (wert === undefined || wert === null || wert === '') {
    return feld.type === 'boolean' ? 0 : null;
  }
  if (feld.type === 'boolean') return wert === true || wert === 'true' || wert === 1 ? 1 : 0;
  if (feld.type === 'number') {
    const n = Number(wert);
    return Number.isFinite(n) ? n : null;
  }
  return String(wert);
}

/**
 * Prueft einen eingehenden Wert gegen das Manifest.
 * Gibt eine Fehlermeldung zurueck oder null.
 */
export function pruefeWert(feld, wert) {
  if (wert === undefined || wert === null || wert === '') {
    return feld.required ? `"${feld.label}" ist ein Pflichtfeld.` : null;
  }
  if (feld.type === 'number') {
    const n = Number(wert);
    if (!Number.isFinite(n)) return `"${feld.label}" muss eine Zahl sein.`;
    if (feld.min !== undefined && n < feld.min) return `"${feld.label}": kleinster Wert ${feld.min}.`;
    if (feld.max !== undefined && n > feld.max) return `"${feld.label}": groesster Wert ${feld.max}.`;
    return null;
  }
  if (feld.type === 'color') {
    if (!/^#?[0-9a-f]{6}$/i.test(String(wert).trim())) {
      return `"${feld.label}" muss ein Hex-Wert sein, etwa #7c5cff.`;
    }
    return null;
  }
  if (feld.type === 'select') {
    const erlaubt = (feld.options ?? []).map((o) => String(o.value));
    if (!erlaubt.includes(String(wert))) return `"${feld.label}": unzulaessige Auswahl.`;
    return null;
  }
  const max = feld.maxLength ?? (feld.type === 'textarea' ? 2000 : 500);
  if (String(wert).length > max) return `"${feld.label}" darf hoechstens ${max} Zeichen haben.`;
  return null;
}

/** Alle Formularfelder eines Manifests (also alles ausserhalb von Listen). */
function formFelder(ui) {
  return (ui?.sections ?? []).filter((s) => s.type === 'form').flatMap((s) => s.fields ?? []);
}

/** Alle Listen eines Manifests. */
function listen(ui) {
  return (ui?.sections ?? []).filter((s) => s.type === 'list');
}

/**
 * Legt die Tabellen eines Plugins an und liefert die Zugriffsfunktionen.
 *
 * Wird von API und Bot aufgerufen. Beide legen an, weil sie unabhaengig starten
 * und keiner auf eine fehlende Tabelle laufen darf.
 */
export function createPluginStore(db, manifest) {
  const name = manifest.name;
  const ui = manifest.ui ?? { sections: [] };
  const felder = formFelder(ui);
  const listenDefs = listen(ui);

  const configTabelle = sicherName(tableName(name));

  // --- Tabellen anlegen ---------------------------------------------------
  const configSpalten = felder
    .map((f) => `${sicherName(f.key)} ${spaltenTyp(f.type)}`)
    .join(',\n      ');

  db.exec(`
    CREATE TABLE IF NOT EXISTS ${configTabelle} (
      guild_id TEXT PRIMARY KEY${configSpalten ? ',\n      ' + configSpalten : ''},
      dirty    INTEGER NOT NULL DEFAULT 0
    );
  `);

  // Spalten nachtragen, wenn das Plugin neue Felder bekommen hat. Ohne das
  // muesste bei jeder Plugin-Aenderung die Datenbank von Hand angefasst werden.
  const vorhanden = new Set(
    db.prepare(`PRAGMA table_info(${configTabelle})`).all().map((c) => c.name),
  );
  for (const f of felder) {
    if (!vorhanden.has(f.key)) {
      db.exec(`ALTER TABLE ${configTabelle} ADD COLUMN ${sicherName(f.key)} ${spaltenTyp(f.type)}`);
    }
  }
  if (!vorhanden.has('state')) {
    db.exec(`ALTER TABLE ${configTabelle} ADD COLUMN state TEXT`);
  }

  const listenTabellen = new Map();
  for (const liste of listenDefs) {
    const tab = sicherName(tableName(name, liste.key));
    const spalten = (liste.fields ?? [])
      .map((f) => `${sicherName(f.key)} ${spaltenTyp(f.type)}`)
      .join(',\n        ');
    db.exec(`
      CREATE TABLE IF NOT EXISTS ${tab} (
        id         INTEGER PRIMARY KEY AUTOINCREMENT,
        guild_id   TEXT NOT NULL,
        ${spalten ? spalten + ',' : ''}
        position   INTEGER NOT NULL DEFAULT 0,
        created_at INTEGER NOT NULL DEFAULT 0
      );
      CREATE INDEX IF NOT EXISTS idx_${tab}_guild ON ${tab} (guild_id, position);
    `);
    const da = new Set(db.prepare(`PRAGMA table_info(${tab})`).all().map((c) => c.name));
    for (const f of liste.fields ?? []) {
      if (!da.has(f.key)) {
        db.exec(`ALTER TABLE ${tab} ADD COLUMN ${sicherName(f.key)} ${spaltenTyp(f.type)}`);
      }
    }
    listenTabellen.set(liste.key, { tabelle: tab, def: liste });
  }

  // --- Zugriff ------------------------------------------------------------

  /** Markiert den Server als geaendert, damit der Bot es aufgreift. */
  const markiere = (guildId) => {
    db.prepare(`INSERT OR IGNORE INTO ${configTabelle} (guild_id) VALUES (?)`).run(guildId);
    db.prepare(`UPDATE ${configTabelle} SET dirty = 1 WHERE guild_id = ?`).run(guildId);
  };

  const store = {
    name,
    manifest,

    /** Die Einstellungen eines Servers. Entsteht beim ersten Zugriff. */
    getConfig(guildId) {
      db.prepare(`INSERT OR IGNORE INTO ${configTabelle} (guild_id) VALUES (?)`).run(guildId);
      const zeile = db.prepare(`SELECT * FROM ${configTabelle} WHERE guild_id = ?`).get(guildId);
      // Standardwerte aus dem Manifest fuellen leere Felder.
      for (const f of felder) {
        if (zeile[f.key] === null && f.default !== undefined) zeile[f.key] = f.default;
      }
      return zeile;
    },

    /** Speichert Einstellungen. Gibt `{ ok }` oder `{ error }` zurueck. */
    saveConfig(guildId, werte) {
      // Ein unbekanntes Feld ist fast immer ein Tippfehler im Plugin. Still zu
      // schlucken waere die schlechteste Antwort - der Wert waere weg und
      // niemand wuesste warum.
      const bekannt = new Set(felder.map((f) => f.key));
      const unbekannt = Object.keys(werte).filter((k) => !bekannt.has(k));
      if (unbekannt.length) {
        return {
          error: `Unbekannte Felder: ${unbekannt.join(', ')}. Fuer Eigenes des Plugins setState() nutzen.`,
        };
      }

      const zuSetzen = felder.filter((f) => werte[f.key] !== undefined);
      for (const f of zuSetzen) {
        const problem = pruefeWert(f, werte[f.key]);
        if (problem) return { error: problem };
      }
      // Pflichtfelder auch dann pruefen, wenn sie gar nicht mitgeschickt wurden.
      const bisher = store.getConfig(guildId);
      for (const f of felder) {
        if (!f.required) continue;
        const wert = werte[f.key] !== undefined ? werte[f.key] : bisher[f.key];
        const problem = pruefeWert(f, wert);
        if (problem) return { error: problem };
      }

      if (zuSetzen.length) {
        const setzen = zuSetzen.map((f) => `${sicherName(f.key)} = ?`).join(', ');
        db.prepare(`UPDATE ${configTabelle} SET ${setzen}, dirty = 1 WHERE guild_id = ?`).run(
          ...zuSetzen.map((f) => normalisiere(f, werte[f.key])),
          guildId,
        );
      } else {
        markiere(guildId);
      }
      return { ok: true };
    },

    /** Die Eintraege einer Liste, in ihrer Reihenfolge. */
    listItems(guildId, listKey) {
      const eintrag = listenTabellen.get(listKey);
      if (!eintrag) return null;
      return db
        .prepare(`SELECT * FROM ${eintrag.tabelle} WHERE guild_id = ? ORDER BY position, id`)
        .all(guildId);
    },

    /** Legt einen Eintrag an. */
    addItem(guildId, listKey, werte) {
      const eintrag = listenTabellen.get(listKey);
      if (!eintrag) return { error: 'Unbekannte Liste' };
      const { tabelle, def } = eintrag;

      for (const f of def.fields ?? []) {
        const problem = pruefeWert(f, werte[f.key]);
        if (problem) return { error: problem };
      }

      if (def.max) {
        const n = db
          .prepare(`SELECT COUNT(*) AS n FROM ${tabelle} WHERE guild_id = ?`)
          .get(guildId).n;
        if (n >= def.max) {
          return { error: `Mehr als ${def.max} Eintraege sind nicht moeglich.` };
        }
      }

      const maxPos = db
        .prepare(`SELECT COALESCE(MAX(position), -1) AS p FROM ${tabelle} WHERE guild_id = ?`)
        .get(guildId).p;

      const spalten = (def.fields ?? []).map((f) => sicherName(f.key));
      const platzhalter = spalten.map(() => '?').join(', ');
      const info = db
        .prepare(
          `INSERT INTO ${tabelle} (guild_id, ${spalten.join(', ')}, position, created_at)
           VALUES (?, ${platzhalter}, ?, ?)`,
        )
        .run(
          guildId,
          ...(def.fields ?? []).map((f) => normalisiere(f, werte[f.key])),
          maxPos + 1,
          Math.floor(Date.now() / 1000),
        );

      markiere(guildId);
      return { ok: true, id: info.lastInsertRowid };
    },

    /** Aendert einen Eintrag. Nicht mitgeschickte Felder bleiben, wie sie sind. */
    updateItem(guildId, listKey, id, werte) {
      const eintrag = listenTabellen.get(listKey);
      if (!eintrag) return { error: 'Unbekannte Liste' };
      const { tabelle, def } = eintrag;

      // Die guild_id gehoert in die Abfrage - sonst koennte man fremde
      // Eintraege aendern, indem man deren id raet.
      const vorhanden = db
        .prepare(`SELECT * FROM ${tabelle} WHERE id = ? AND guild_id = ?`)
        .get(id, guildId);
      if (!vorhanden) return { notFound: true };

      const zuSetzen = (def.fields ?? []).filter((f) => werte[f.key] !== undefined);
      for (const f of zuSetzen) {
        const problem = pruefeWert(f, werte[f.key]);
        if (problem) return { error: problem };
      }
      if (!zuSetzen.length) return { ok: true };

      const setzen = zuSetzen.map((f) => `${sicherName(f.key)} = ?`).join(', ');
      db.prepare(`UPDATE ${tabelle} SET ${setzen} WHERE id = ?`).run(
        ...zuSetzen.map((f) => normalisiere(f, werte[f.key])),
        vorhanden.id,
      );
      markiere(guildId);
      return { ok: true };
    },

    /** Loescht einen Eintrag. */
    removeItem(guildId, listKey, id) {
      const eintrag = listenTabellen.get(listKey);
      if (!eintrag) return { error: 'Unbekannte Liste' };
      const info = db
        .prepare(`DELETE FROM ${eintrag.tabelle} WHERE id = ? AND guild_id = ?`)
        .run(id, guildId);
      if (!info.changes) return { notFound: true };
      markiere(guildId);
      return { ok: true };
    },

    /** Verschiebt einen Eintrag nach oben oder unten. */
    moveItem(guildId, listKey, id, richtung) {
      const eintrag = listenTabellen.get(listKey);
      if (!eintrag) return { error: 'Unbekannte Liste' };
      if (richtung !== 'up' && richtung !== 'down') {
        return { error: 'Richtung muss "up" oder "down" sein.' };
      }
      const { tabelle } = eintrag;

      const alle = db
        .prepare(`SELECT id FROM ${tabelle} WHERE guild_id = ? ORDER BY position, id`)
        .all(guildId);
      const ix = alle.findIndex((r) => String(r.id) === String(id));
      if (ix < 0) return { notFound: true };

      const ziel = richtung === 'up' ? ix - 1 : ix + 1;
      if (ziel < 0 || ziel >= alle.length) return { ok: true, unveraendert: true };

      [alle[ix], alle[ziel]] = [alle[ziel], alle[ix]];
      // Positionen komplett neu vergeben - so bleiben sie luekenlos.
      const setze = db.prepare(`UPDATE ${tabelle} SET position = ? WHERE id = ?`);
      db.transaction(() => alle.forEach((r, i) => setze.run(i, r.id)))();

      markiere(guildId);
      return { ok: true };
    },

    /** Alles auf einmal - das braucht die Dashboard-Seite. */
    getAll(guildId) {
      const daten = { config: store.getConfig(guildId), lists: {} };
      for (const key of listenTabellen.keys()) daten.lists[key] = store.listItems(guildId, key);
      return daten;
    },

    /**
     * Was das Plugin sich selbst merkt - etwa die ID der geposteten Nachricht.
     * Getrennt von den Formularfeldern, siehe oben.
     */
    getState(guildId) {
      const zeile = db
        .prepare(`SELECT state FROM ${configTabelle} WHERE guild_id = ?`)
        .get(guildId);
      if (!zeile?.state) return {};
      try {
        return JSON.parse(zeile.state);
      } catch {
        return {}; // Kaputter Inhalt darf den Bot nicht aufhalten.
      }
    },

    /** Ergaenzt den eigenen Merkzettel. Setzt bewusst kein `dirty`. */
    setState(guildId, werte) {
      const neu = { ...store.getState(guildId), ...werte };
      db.prepare(`INSERT OR IGNORE INTO ${configTabelle} (guild_id) VALUES (?)`).run(guildId);
      db.prepare(`UPDATE ${configTabelle} SET state = ? WHERE guild_id = ?`).run(
        JSON.stringify(neu),
        guildId,
      );
      return neu;
    },

    /**
     * Belegt einen Platz im Merkzettel - aber nur, wenn er noch frei ist.
     *
     * Lesen und Schreiben laufen in **einer** Transaktion. Ohne das koennen
     * zwei Ablaeufe denselben Stand lesen, bevor einer geschrieben hat, und
     * beide halten sich fuer den Ersten. Genau daran lag es, dass eine
     * Twitch-Meldung zweimal gepostet wurde: Webhook und Abfrage liefen
     * gleichzeitig los, und das Senden an Discord dauert lange genug, dass
     * sich beide in die Luecke schieben.
     *
     * Gibt `true` zurueck, wenn der Platz belegt wurde - dann und nur dann
     * darf der Aufrufer handeln.
     */
    belegeEinmalig(guildId, schluessel, wert, istBelegt) {
      const belegen = db.transaction(() => {
        const aktuell = store.getState(guildId);
        const bestehend = aktuell[schluessel];
        // Die Pruefung gehoert IN die Transaktion - sonst waere nichts gewonnen.
        if (istBelegt(bestehend)) return false;

        db.prepare(`INSERT OR IGNORE INTO ${configTabelle} (guild_id) VALUES (?)`).run(guildId);
        db.prepare(`UPDATE ${configTabelle} SET state = ? WHERE guild_id = ?`).run(
          JSON.stringify({ ...aktuell, [schluessel]: wert }),
          guildId,
        );
        return true;
      });
      return belegen();
    },

    markDirty: markiere,

    /**
     * Alle Server, fuer die dieses Plugin Daten hat.
     *
     * Fuer Plugins, die regelmaessig von sich aus taetig werden - anders als
     * `pendingGuilds`, das nur auf angestossene Auftraege reagiert.
     */
    allGuilds() {
      return db.prepare(`SELECT * FROM ${configTabelle}`).all();
    },

    /** Alle Server, bei denen der Bot etwas zu tun hat. */
    pendingGuilds() {
      return db.prepare(`SELECT * FROM ${configTabelle} WHERE dirty = 1`).all();
    },

    /**
     * Hakt einen Server ab. Immer aufrufen - auch wenn das Posten scheiterte.
     *
     * `ergebnis` ist das, was der Bot gemacht hat ("gepostet", "Kanal nicht
     * erreichbar", ...). Das Dashboard zeigt es an - sonst stuende dort nur
     * "erledigt", waehrend in Discord nichts passiert ist.
     */
    clearDirty(guildId, ergebnis = null) {
      db.prepare(`UPDATE ${configTabelle} SET dirty = 0 WHERE guild_id = ?`).run(guildId);
      if (ergebnis) {
        store.setState(guildId, {
          letztesErgebnis: String(ergebnis),
          letzterLauf: Math.floor(Date.now() / 1000),
        });
      }
    },
  };

  return store;
}
