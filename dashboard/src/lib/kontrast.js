/**
 * Waehlt Schwarz oder Weiss fuer Text auf einer farbigen Flaeche.
 *
 * Noetig, seit die Standard-Akzentfarbe das ArcanePixels-Orange ist: Darauf ist
 * weisse Schrift kaum zu lesen, auf einem dunklen Serverakzent schwarze dagegen
 * gar nicht. Ein fester Wert kann nur eines von beidem - und die Serverfarbe
 * steht erst zur Laufzeit fest.
 *
 * Gerechnet wird mit der relativen Helligkeit nach WCAG; es gewinnt die Farbe
 * mit dem besseren Kontrastverhaeltnis.
 *
 * Liegt in `lib/`, damit die Rechnung ohne JSX testbar bleibt.
 */
const kanal = (hex, i) => {
  const v = parseInt(hex.slice(1 + i * 2, 3 + i * 2), 16) / 255;
  return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
};

export const DUNKEL = '#1a1206';
export const HELL = '#ffffff';

export function textAufFarbe(hex) {
  const helligkeit =
    0.2126 * kanal(hex, 0) + 0.7152 * kanal(hex, 1) + 0.0722 * kanal(hex, 2);
  const gegenHell = 1.05 / (helligkeit + 0.05);
  const gegenDunkel = (helligkeit + 0.05) / 0.05;
  return gegenHell >= gegenDunkel ? HELL : DUNKEL;
}
