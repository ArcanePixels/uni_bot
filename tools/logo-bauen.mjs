import { readFileSync, writeFileSync } from 'node:fs';

/**
 * Baut aus der vektorisierten Vorlage die einfaerbbaren Logo-Dateien.
 *
 * Die Vorlagen liegen in dashboard/logo-quelle/ und bewusst NICHT in public/ -
 * alles unter public/ wird ausgeliefert, und das PNG allein ist knapp 1 MB.
 *
 * Die Vorlage ist invertiert: Die Pfade zeichnen den HINTERGRUND, das Motiv ist
 * die Aussparung darin. Zusaetzlich beginnt der erste Pfad mit einem Rechteck
 * ueber die volle Flaeche, und alle folgenden Teilformen sind relativ zum
 * Vorgaenger angegeben (kleines m). Schneidet man das Rechteck heraus,
 * verrutscht alles dahinter - das ergab beim ersten Versuch nur ein paar
 * Sprenkel.
 *
 * Loesung, ohne einen einzigen Pfad anzufassen: eine Maske. Weiss ist sichtbar,
 * also liegt unter den (schwarzen) Pfaden eine weisse Flaeche. Sichtbar bleibt
 * damit genau die Aussparung - das Motiv. Gefuellt wird mit currentColor, die
 * Farbe kommt also per CSS von aussen.
 *
 * Erzeugt werden zwei Dateien:
 *   logo.svg       - das ganze Logo samt Schriftzug, fuer grosse Flaechen
 *   logo-mark.svg  - nur die Figur; ausgeschnitten ueber die viewBox, nicht
 *                    durch Aendern der Pfade. Noetig, weil der Schriftzug in
 *                    der Kopfzeile (26 px) zu einem grauen Streifen zerfaellt
 *                    und neben dem Wort "ArcanePixels" ohnehin doppelt waere.
 *   app/icon.svg   - das Favicon. Hier steht die Farbe fest im Bild, denn eine
 *                    Datei im Browser-Tab erbt kein CSS.
 *
 * Aufruf: node tools/logo-bauen.mjs
 */
const VORLAGE = 'dashboard/logo-quelle/logo-original.svg';

/** Ausschnitt der Figur ohne Schriftzug - an der Darstellung abgemessen. */
const FIGUR = '120 60 800 600';

const vorlage = readFileSync(VORLAGE, 'utf8');
const pfade = [...vorlage.matchAll(/<path d="([^"]*)"/g)].map((m) =>
  m[1].replace(/\s+/g, ' ').trim(),
);
if (pfade.length === 0) throw new Error(`Keine Pfade in ${VORLAGE} gefunden`);

const baue = (id, viewBox) =>
  [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewBox}" role="img" aria-label="ArcanePixels">`,
    '<!-- Erzeugt von tools/logo-bauen.mjs aus logo-quelle/logo-original.svg. Nicht von Hand aendern. -->',
    `<mask id="${id}" maskUnits="userSpaceOnUse" x="0" y="0" width="1024" height="1024">`,
    '  <rect x="0" y="0" width="1024" height="1024" fill="#fff"/>',
    '  <g transform="translate(0,1024) scale(0.1,-0.1)" fill="#000">',
    ...pfade.map((d) => `    <path d="${d}"/>`),
    '  </g>',
    '</mask>',
    `<rect x="0" y="0" width="1024" height="1024" fill="currentColor" mask="url(#${id})"/>`,
    '</svg>',
    '',
  ].join('\n');

/** ArcanePixels-Orange, aus dem Logo entnommen - siehe --marke in globals.css. */
const MARKE = '#ff9f20';

for (const [datei, id, viewBox, farbe] of [
  ['dashboard/public/logo.svg', 'ap-logo', '0 0 1024 1024', null],
  ['dashboard/public/logo-mark.svg', 'ap-mark', FIGUR, null],
  ['dashboard/src/app/icon.svg', 'ap-icon', FIGUR, MARKE],
]) {
  let svg = baue(id, viewBox);
  if (farbe) svg = svg.replace('fill="currentColor"', `fill="${farbe}"`);
  writeFileSync(datei, svg);
  console.log(`Geschrieben: ${datei}, ${Math.round(svg.length / 1024)} KB`);
}
