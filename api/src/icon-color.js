/**
 * Bestimmt die praegende Farbe eines Discord-Server-Icons.
 *
 * Discord liefert Icons auch als JPEG - dessen Dekodierung waere aufwendig.
 * Stattdessen fragen wir die Groesse 16x16 im PNG-Format an: klein genug, um
 * es ohne Bibliothek zu dekodieren, und gross genug fuer eine sinnvolle
 * Farbaussage. Die PNG-Dekodierung laeuft ueber zlib aus der Standardbibliothek.
 */
import { inflateSync } from 'node:zlib';

const CACHE_MS = 60 * 60_000;
const cache = new Map();

/** PNG in {width, height, pixels:[{r,g,b,a}]} zerlegen. */
function decodePng(buf) {
  // Signatur pruefen, damit wir nicht auf halbem Weg auf Unsinn stossen.
  const SIG = [137, 80, 78, 71, 13, 10, 26, 10];
  for (let i = 0; i < SIG.length; i++) {
    if (buf[i] !== SIG[i]) throw new Error('Keine PNG-Datei');
  }

  let pos = 8;
  let width = 0;
  let height = 0;
  let bitDepth = 0;
  let colorType = 0;
  const idat = [];
  let palette = null;
  let paletteAlpha = null;

  while (pos < buf.length) {
    const len = buf.readUInt32BE(pos);
    const type = buf.toString('ascii', pos + 4, pos + 8);
    const data = buf.subarray(pos + 8, pos + 8 + len);

    if (type === 'IHDR') {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      bitDepth = data[8];
      colorType = data[9];
      if (data[12] !== 0) throw new Error('Interlaced PNG wird nicht unterstuetzt');
    } else if (type === 'PLTE') {
      palette = data;
    } else if (type === 'tRNS') {
      paletteAlpha = data;
    } else if (type === 'IDAT') {
      idat.push(data);
    } else if (type === 'IEND') {
      break;
    }
    pos += 12 + len; // Laenge + Typ + Daten + CRC
  }

  if (bitDepth !== 8) throw new Error(`Bittiefe ${bitDepth} wird nicht unterstuetzt`);
  // Farbtyp 3 sind Palettenbilder - Discord liefert die tatsaechlich aus.
  const channels = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 }[colorType];
  if (!channels) throw new Error(`Farbtyp ${colorType} wird nicht unterstuetzt`);
  if (colorType === 3 && !palette) throw new Error('Palettenbild ohne PLTE-Abschnitt');

  const raw = inflateSync(Buffer.concat(idat));
  const stride = width * channels;
  const out = Buffer.alloc(height * stride);

  // PNG-Zeilenfilter rueckgaengig machen (Filtertypen 0-4).
  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)];
    const line = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1));
    for (let x = 0; x < stride; x++) {
      const a = x >= channels ? out[y * stride + x - channels] : 0;
      const b = y > 0 ? out[(y - 1) * stride + x] : 0;
      const c = x >= channels && y > 0 ? out[(y - 1) * stride + x - channels] : 0;
      let v = line[x];
      if (filter === 1) v += a;
      else if (filter === 2) v += b;
      else if (filter === 3) v += (a + b) >> 1;
      else if (filter === 4) {
        // Paeth-Praediktor
        const p = a + b - c;
        const pa = Math.abs(p - a);
        const pb = Math.abs(p - b);
        const pc = Math.abs(p - c);
        v += pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
      }
      out[y * stride + x] = v & 0xff;
    }
  }

  const pixels = [];
  for (let i = 0; i < width * height; i++) {
    const o = i * channels;
    if (colorType === 6) pixels.push({ r: out[o], g: out[o + 1], b: out[o + 2], a: out[o + 3] });
    else if (colorType === 2) pixels.push({ r: out[o], g: out[o + 1], b: out[o + 2], a: 255 });
    else if (colorType === 4) pixels.push({ r: out[o], g: out[o], b: out[o], a: out[o + 1] });
    else if (colorType === 3) {
      const idx = out[o];
      pixels.push({
        r: palette[idx * 3],
        g: palette[idx * 3 + 1],
        b: palette[idx * 3 + 2],
        // tRNS ist optional und deckt nur die vorderen Paletteneintraege ab.
        a: paletteAlpha && idx < paletteAlpha.length ? paletteAlpha[idx] : 255,
      });
    } else pixels.push({ r: out[o], g: out[o], b: out[o], a: 255 });
  }
  return { width, height, pixels };
}

export function rgbToHsl(r, g, b) {
  r /= 255;
  g /= 255;
  b /= 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return { h: 0, s: 0, l };
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h;
  if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
  else if (max === g) h = ((b - r) / d + 2) / 6;
  else h = ((r - g) / d + 4) / 6;
  return { h, s, l };
}

export function hslToHex(h, s, l) {
  const f = (n) => {
    const k = (n + h * 12) % 12;
    const a = s * Math.min(l, 1 - l);
    const v = l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1));
    return Math.round(v * 255)
      .toString(16)
      .padStart(2, '0');
  };
  return `#${f(0)}${f(8)}${f(4)}`;
}

/**
 * Waehlt aus den Bildpunkten die praegende Farbe.
 *
 * Graue und fast durchsichtige Punkte fliegen raus - sonst gewaenne bei fast
 * jedem Icon der Hintergrund. Gewichtet wird nach Saettigung, damit eine
 * kraeftige kleine Flaeche eine blasse grosse schlaegt.
 */
export function dominantColor(pixels) {
  const buckets = new Map();

  for (const p of pixels) {
    if (p.a < 128) continue;
    const { h, s, l } = rgbToHsl(p.r, p.g, p.b);
    // Zu blass oder zu dunkel/hell taugt nicht als Akzentfarbe.
    if (s < 0.18 || l < 0.12 || l > 0.92) continue;
    const key = Math.round(h * 24); // 24 Farbtonfaecher
    const cur = buckets.get(key) ?? { weight: 0, h: 0, s: 0, l: 0 };
    const w = s;
    cur.weight += w;
    cur.h += h * w;
    cur.s += s * w;
    cur.l += l * w;
    buckets.set(key, cur);
  }

  if (buckets.size === 0) return null;

  let best = null;
  for (const b of buckets.values()) {
    if (!best || b.weight > best.weight) best = b;
  }

  const h = best.h / best.weight;
  const s = Math.min(best.s / best.weight, 0.85);
  // Helligkeit in einen Bereich zwingen, in dem weisser Text lesbar bleibt.
  const l = Math.min(Math.max(best.l / best.weight, 0.42), 0.62);
  return hslToHex(h, s, l);
}

/**
 * Holt das Icon eines Servers und gibt seine praegende Farbe als Hex zurueck.
 * Liefert null, wenn es kein Icon gibt oder nichts Brauchbares gefunden wurde -
 * die Oberflaeche faellt dann auf die Standardfarbe zurueck.
 */
export async function guildAccentColor(guildId, iconHash) {
  if (!iconHash) return null;

  const key = `${guildId}:${iconHash}`;
  const hit = cache.get(key);
  if (hit && hit.until > Date.now()) return hit.value;

  let color = null;
  try {
    const url = `https://cdn.discordapp.com/icons/${guildId}/${iconHash}.png?size=16`;
    const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
    if (res.ok) {
      const { pixels } = decodePng(Buffer.from(await res.arrayBuffer()));
      color = dominantColor(pixels);
    }
  } catch {
    // Farbe ist Beiwerk - ein Fehler darf die Seite nicht aufhalten.
    color = null;
  }

  cache.set(key, { value: color, until: Date.now() + CACHE_MS });
  return color;
}

export const __test__ = { decodePng };
