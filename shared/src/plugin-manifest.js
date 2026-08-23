/**
 * Das Manifest beschreibt ein Plugin - fuer Bot, API und Dashboard gleichermassen.
 *
 * Der Kern des Plugin-Systems: Ein Plugin liefert *Code* fuer Bot und API, aber
 * nur eine *Beschreibung* seiner Oberflaeche. Grund ist eine harte technische
 * Grenze - Next.js kompiliert seine Seiten beim Bauen, im fertigen Bundle steckt
 * kein Compiler mehr. Wuerde ein Plugin React-Code mitbringen, muesste jeder
 * Nutzer das Dashboard neu bauen.
 *
 * Deshalb: Das Dashboard hat die Bausteine fest eingebaut, das Plugin sagt nur,
 * welche es in welcher Reihenfolge haben will. Ordner nach `plugins/` kopieren,
 * neu starten, fertig.
 *
 * Aufbau eines Plugin-Ordners:
 *
 *   plugins/regeln/
 *     plugin.json   <- dieses Manifest
 *     bot.js        <- laeuft im Bot        (optional)
 *     api.js        <- Endpunkte der API    (optional)
 *
 * Die Oberflaeche steckt als `ui` im Manifest.
 */

/** Feldtypen, die das Dashboard fuer Plugin-Formulare anbietet. */
export const FIELD_TYPES = [
  'text',
  'textarea',
  'number',
  'boolean',
  'select',
  'channel',
  'role',
  'color',
  'emoji',
];

/**
 * Rechte, die ein Plugin fuer einen Kanal verlangen kann. Bewusst eine feste
 * Liste - so kann das Dashboard sie im Klartext anzeigen.
 */
export const PERMISSION_NAMES = [
  'VIEW_CHANNEL',
  'SEND_MESSAGES',
  'EMBED_LINKS',
  'ATTACH_FILES',
  'READ_MESSAGE_HISTORY',
  'ADD_REACTIONS',
  'MANAGE_MESSAGES',
];

/** Bausteine, aus denen sich eine Plugin-Seite zusammensetzt. */
export const SECTION_TYPES = ['form', 'list', 'actions'];

/** Ein Plugin-Name muss als Ordnername, Tabellenpraefix und URL taugen. */
export const NAME_PATTERN = /^[a-z][a-z0-9-]{1,30}$/;

const istObjekt = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const istText = (v) => typeof v === 'string' && v.trim().length > 0;

/**
 * Prueft ein Feld. Gibt eine Liste von Problemen zurueck - leer heisst in Ordnung.
 */
function pruefeFeld(feld, wo, fehler) {
  if (!istObjekt(feld)) {
    fehler.push(`${wo}: muss ein Objekt sein`);
    return;
  }
  if (!istText(feld.key)) fehler.push(`${wo}: "key" fehlt`);
  else if (!/^[a-zA-Z][a-zA-Z0-9_]*$/.test(feld.key)) {
    // Der Schluessel wird zum Spaltennamen - alles andere waere gefaehrlich.
    fehler.push(`${wo}: "${feld.key}" ist als key nicht erlaubt (nur Buchstaben, Ziffern, _)`);
  }
  if (!istText(feld.label)) fehler.push(`${wo}: "label" fehlt`);
  if (!FIELD_TYPES.includes(feld.type)) {
    fehler.push(`${wo}: unbekannter Typ "${feld.type}" (erlaubt: ${FIELD_TYPES.join(', ')})`);
  }
  if (feld.type === 'select') {
    if (!Array.isArray(feld.options) || feld.options.length === 0) {
      fehler.push(`${wo}: "select" braucht "options"`);
    } else {
      for (const [i, o] of feld.options.entries()) {
        if (!istObjekt(o) || !istText(o.label) || o.value === undefined) {
          fehler.push(`${wo}.options[${i}]: braucht "value" und "label"`);
        }
      }
    }
  }
  if (feld.maxLength !== undefined && !Number.isInteger(feld.maxLength)) {
    fehler.push(`${wo}: "maxLength" muss eine ganze Zahl sein`);
  }
  // Ein Kanal-Feld darf sagen, welche Rechte der Bot dort braucht. Das
  // Dashboard zeigt dann an, ob sie gesetzt sind.
  if (feld.requiresPermissions !== undefined) {
    if (!Array.isArray(feld.requiresPermissions)) {
      fehler.push(`${wo}: "requiresPermissions" muss eine Liste sein`);
    } else {
      for (const r of feld.requiresPermissions) {
        if (!PERMISSION_NAMES.includes(r)) {
          fehler.push(`${wo}: unbekanntes Recht "${r}" (erlaubt: ${PERMISSION_NAMES.join(', ')})`);
        }
      }
    }
  }
}

/** Prueft einen Abschnitt der Oberflaeche. */
function pruefeAbschnitt(ab, wo, fehler) {
  if (!istObjekt(ab)) {
    fehler.push(`${wo}: muss ein Objekt sein`);
    return;
  }
  if (!SECTION_TYPES.includes(ab.type)) {
    fehler.push(`${wo}: unbekannter Abschnitt "${ab.type}" (erlaubt: ${SECTION_TYPES.join(', ')})`);
    return;
  }

  if (ab.type === 'actions') {
    if (!Array.isArray(ab.actions) || ab.actions.length === 0) {
      fehler.push(`${wo}: "actions" braucht mindestens einen Knopf`);
      return;
    }
    for (const [i, a] of ab.actions.entries()) {
      if (!istObjekt(a) || !istText(a.key) || !istText(a.label)) {
        fehler.push(`${wo}.actions[${i}]: braucht "key" und "label"`);
      }
    }
    return;
  }

  if (!Array.isArray(ab.fields) || ab.fields.length === 0) {
    fehler.push(`${wo}: braucht mindestens ein Feld`);
    return;
  }
  ab.fields.forEach((f, i) => pruefeFeld(f, `${wo}.fields[${i}]`, fehler));

  if (ab.type === 'list') {
    // Eine Liste braucht einen eigenen Speicherort - sonst wuesste die API
    // nicht, wohin mit den Eintraegen.
    if (!istText(ab.key)) fehler.push(`${wo}: eine Liste braucht einen "key"`);
    if (ab.max !== undefined && !Number.isInteger(ab.max)) {
      fehler.push(`${wo}: "max" muss eine ganze Zahl sein`);
    }
  }
}

/**
 * Prueft ein Manifest vollstaendig.
 *
 * Gibt `{ ok, fehler }` zurueck. Bewusst *alle* Probleme auf einmal, nicht nur
 * das erste - wer ein Plugin schreibt, will nicht Fehler fuer Fehler abarbeiten.
 */
export function validateManifest(m) {
  const fehler = [];

  if (!istObjekt(m)) return { ok: false, fehler: ['Das Manifest ist kein Objekt'] };

  if (!istText(m.name)) {
    fehler.push('"name" fehlt');
  } else if (!NAME_PATTERN.test(m.name)) {
    fehler.push(
      `"${m.name}" ist als Name nicht erlaubt - klein schreiben, nur a-z, 0-9 und -, 2 bis 31 Zeichen`,
    );
  }
  if (!istText(m.label)) fehler.push('"label" fehlt (die Beschriftung des Reiters)');

  if (m.ui !== undefined) {
    if (!istObjekt(m.ui)) {
      fehler.push('"ui" muss ein Objekt sein');
    } else if (!Array.isArray(m.ui.sections) || m.ui.sections.length === 0) {
      fehler.push('"ui.sections" braucht mindestens einen Abschnitt');
    } else {
      m.ui.sections.forEach((s, i) => pruefeAbschnitt(s, `ui.sections[${i}]`, fehler));

      // Zwei Listen mit demselben key wuerden sich die Tabelle teilen.
      const listen = m.ui.sections.filter((s) => s?.type === 'list' && istText(s.key));
      const doppelt = listen.map((l) => l.key).filter((k, i, arr) => arr.indexOf(k) !== i);
      for (const k of new Set(doppelt)) fehler.push(`Die Liste "${k}" kommt mehrfach vor`);
    }
  }

  return { ok: fehler.length === 0, fehler };
}

/**
 * Tabellenname fuer die Daten eines Plugins.
 *
 * Alles landet unter `plugin_<name>_...`, damit ein Plugin niemals eine Tabelle
 * des Grundsystems ueberschreiben kann.
 */
export function tableName(pluginName, listKey = null) {
  const basis = `plugin_${pluginName.replace(/-/g, '_')}`;
  return listKey ? `${basis}_${listKey.replace(/-/g, '_')}` : `${basis}_config`;
}
