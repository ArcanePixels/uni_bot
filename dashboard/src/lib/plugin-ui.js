/**
 * Die Entscheidungen, die beim Bauen einer Plugin-Oberflaeche anfallen.
 *
 * Bewusst ohne React - so laesst sich das direkt testen, ohne eine
 * Next-Umgebung hochzufahren. `PluginPage.js` benutzt diese Funktionen und
 * kuemmert sich nur noch ums Anzeigen.
 */

/** Feldtypen, fuer die es einen Baustein gibt. */
export const UNTERSTUETZTE_TYPEN = [
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
 * Der Startwert eines Feldes im Formular.
 *
 * Wahrheitswerte liegen als 0/1 in der Datenbank, im Browser braucht es aber
 * echte true/false. Fehlt ein Wert, greift der Standard aus dem Manifest.
 */
export function startwert(feld, gespeichert) {
  const wert = gespeichert?.[feld.key];
  if (feld.type === 'boolean') return wert === 1 || wert === true || wert === 'true';
  if (wert === null || wert === undefined) return feld.default ?? '';
  return wert;
}

/** Alle Startwerte eines Abschnitts auf einmal. */
export function startwerte(felder, gespeichert) {
  const werte = {};
  for (const f of felder ?? []) werte[f.key] = startwert(f, gespeichert);
  return werte;
}

/**
 * Was in der Zeile eines Listeneintrags steht.
 *
 * `itemLabel` bestimmt das Hauptfeld; Textfelder darunter erscheinen als
 * Beschreibung. So muss ein Plugin nichts ueber die Darstellung wissen.
 */
export function zeilenText(abschnitt, item) {
  const hauptfeld = abschnitt.itemLabel ?? 'title';
  const titel = item?.[hauptfeld];
  return {
    icon: item?.icon?.trim() || null,
    titel: titel && String(titel).trim() ? String(titel) : '(ohne Titel)',
    zusatz: (abschnitt.fields ?? [])
      .filter((f) => f.type === 'textarea' && f.key !== hauptfeld && item?.[f.key])
      .map((f) => String(item[f.key])),
  };
}

/** Ist die Obergrenze einer Liste erreicht? */
export function istVoll(abschnitt, anzahl) {
  return Boolean(abschnitt.max) && anzahl >= abschnitt.max;
}

/** Darf der Pfeil nach oben/unten gedrueckt werden? */
export function kannSchieben(index, anzahl, richtung) {
  if (richtung === 'up') return index > 0;
  if (richtung === 'down') return index < anzahl - 1;
  return false;
}

/**
 * Die Farbe fuer den Farbwaehler.
 *
 * Das Textfeld daneben darf jeden Zwischenstand enthalten, waehrend jemand
 * tippt - der Waehler braucht aber immer einen gueltigen Wert.
 */
export function farbwert(wert, rueckfall = '#5865f2') {
  return /^#[0-9a-f]{6}$/i.test(String(wert ?? '')) ? wert : rueckfall;
}

/**
 * Nur Abschnitte, die das Dashboard darstellen kann.
 *
 * Ein Plugin aus einer neueren Version koennte Bausteine nennen, die es hier
 * noch nicht gibt. Die zu ueberspringen ist besser, als die ganze Seite
 * scheitern zu lassen - der Rest bleibt benutzbar.
 */
export function darstellbareAbschnitte(ui) {
  return (ui?.sections ?? []).filter(
    (s) => s?.type === 'form' || s?.type === 'list' || s?.type === 'actions',
  );
}

/** Felder, die das Dashboard darstellen kann. */
export function darstellbareFelder(felder) {
  return (felder ?? []).filter((f) => UNTERSTUETZTE_TYPEN.includes(f?.type));
}
