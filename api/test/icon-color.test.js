import { test } from 'node:test';
import assert from 'node:assert/strict';
import { deflateSync } from 'node:zlib';
import { __test__, dominantColor, rgbToHsl, hslToHex } from '../src/icon-color.js';

const { decodePng } = __test__;

/** Baut ein echtes PNG aus RGBA-Bildpunkten - zum Pruefen des Dekoders. */
function makePng(width, height, rgba, filterType = 0) {
  const chunks = [];
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

  const chunk = (type, data) => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
    // CRC muss nicht stimmen - unser Dekoder prueft ihn nicht.
    return Buffer.concat([len, body, Buffer.alloc(4)]);
  };

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // Bittiefe
  ihdr[9] = 6; // RGBA
  chunks.push(chunk('IHDR', ihdr));

  const stride = width * 4;
  const raw = Buffer.alloc(height * (stride + 1));
  for (let y = 0; y < height; y++) {
    raw[y * (stride + 1)] = filterType;
    for (let x = 0; x < stride; x++) {
      const v = rgba[y * stride + x];
      if (filterType === 0) {
        raw[y * (stride + 1) + 1 + x] = v;
      } else if (filterType === 1) {
        // Sub: Differenz zum linken Nachbarn
        const left = x >= 4 ? rgba[y * stride + x - 4] : 0;
        raw[y * (stride + 1) + 1 + x] = (v - left) & 0xff;
      } else if (filterType === 2) {
        // Up: Differenz zur Zeile darueber
        const up = y > 0 ? rgba[(y - 1) * stride + x] : 0;
        raw[y * (stride + 1) + 1 + x] = (v - up) & 0xff;
      }
    }
  }
  chunks.push(chunk('IDAT', deflateSync(raw)));
  chunks.push(chunk('IEND', Buffer.alloc(0)));
  return Buffer.concat([sig, ...chunks]);
}

function solid(width, height, [r, g, b, a = 255]) {
  const px = Buffer.alloc(width * height * 4);
  for (let i = 0; i < width * height; i++) {
    px[i * 4] = r;
    px[i * 4 + 1] = g;
    px[i * 4 + 2] = b;
    px[i * 4 + 3] = a;
  }
  return px;
}

test('decodePng liest eine einfarbige Flaeche', () => {
  const png = makePng(4, 4, solid(4, 4, [200, 40, 60]));
  const { width, height, pixels } = decodePng(png);
  assert.equal(width, 4);
  assert.equal(height, 4);
  assert.equal(pixels.length, 16);
  assert.deepEqual(pixels[0], { r: 200, g: 40, b: 60, a: 255 });
  assert.deepEqual(pixels[15], { r: 200, g: 40, b: 60, a: 255 });
});

test('decodePng beherrscht den Sub-Filter', () => {
  const png = makePng(4, 2, solid(4, 2, [10, 120, 200]), 1);
  const { pixels } = decodePng(png);
  assert.deepEqual(pixels[0], { r: 10, g: 120, b: 200, a: 255 });
  assert.deepEqual(pixels[5], { r: 10, g: 120, b: 200, a: 255 });
});

test('decodePng beherrscht den Up-Filter', () => {
  const png = makePng(4, 3, solid(4, 3, [90, 20, 140]), 2);
  const { pixels } = decodePng(png);
  assert.deepEqual(pixels[0], { r: 90, g: 20, b: 140, a: 255 });
  assert.deepEqual(pixels[11], { r: 90, g: 20, b: 140, a: 255 });
});

test('decodePng weist Nicht-PNG-Daten ab', () => {
  assert.throws(() => decodePng(Buffer.from('kein bild hier')), /Keine PNG/);
});

test('decodePng liest Palettenbilder (Farbtyp 3)', () => {
  // Discord liefert Icons tatsaechlich als Palettenbild aus - ohne diese
  // Unterstuetzung schlug die Farbermittlung an echten Icons fehl.
  const chunk = (type, data) => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    return Buffer.concat([len, Buffer.from(type, 'ascii'), data, Buffer.alloc(4)]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(2, 0);
  ihdr.writeUInt32BE(2, 4);
  ihdr[8] = 8;
  ihdr[9] = 3; // Palette
  const plte = Buffer.from([200, 30, 40, 20, 90, 200]); // zwei Farben
  const raw = Buffer.from([0, 0, 1, 0, 1, 0]); // je Zeile: Filter + zwei Indizes
  const png = Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', ihdr),
    chunk('PLTE', plte),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);

  const { pixels } = decodePng(png);
  assert.deepEqual(pixels[0], { r: 200, g: 30, b: 40, a: 255 });
  assert.deepEqual(pixels[1], { r: 20, g: 90, b: 200, a: 255 });
});

test('rgbToHsl und hslToHex sind zueinander stimmig', () => {
  const { h, s, l } = rgbToHsl(255, 0, 0);
  assert.equal(hslToHex(h, s, l), '#ff0000');
  const blue = rgbToHsl(0, 0, 255);
  assert.equal(hslToHex(blue.h, blue.s, blue.l), '#0000ff');
});

test('dominantColor findet den kraeftigen Farbton', () => {
  const pixels = [];
  // Viel neutrales Grau - darf NICHT gewinnen.
  for (let i = 0; i < 200; i++) pixels.push({ r: 128, g: 128, b: 128, a: 255 });
  // Wenig kraeftiges Rot - soll gewinnen.
  for (let i = 0; i < 20; i++) pixels.push({ r: 220, g: 30, b: 40, a: 255 });

  const hex = dominantColor(pixels);
  assert.ok(hex, 'es muss eine Farbe herauskommen');
  const { r, g, b } = { r: parseInt(hex.slice(1, 3), 16), g: parseInt(hex.slice(3, 5), 16), b: parseInt(hex.slice(5, 7), 16) };
  assert.ok(r > g && r > b, `Rot muss dominieren, bekam ${hex}`);
});

test('dominantColor liefert null bei rein grauem Bild', () => {
  const pixels = Array.from({ length: 50 }, () => ({ r: 100, g: 100, b: 100, a: 255 }));
  assert.equal(dominantColor(pixels), null);
});

test('dominantColor ignoriert durchsichtige Punkte', () => {
  const pixels = [
    ...Array.from({ length: 100 }, () => ({ r: 255, g: 0, b: 0, a: 0 })), // unsichtbar
    ...Array.from({ length: 10 }, () => ({ r: 0, g: 100, b: 220, a: 255 })), // sichtbar
  ];
  const hex = dominantColor(pixels);
  const b = parseInt(hex.slice(5, 7), 16);
  const r = parseInt(hex.slice(1, 3), 16);
  assert.ok(b > r, `Blau muss gewinnen, bekam ${hex}`);
});

test('dominantColor haelt die Helligkeit im lesbaren Bereich', () => {
  // Sehr dunkles und sehr helles Bild - beides muss auf mittlere Helligkeit
  // gezogen werden, damit weisser Text auf der Farbe lesbar bleibt.
  for (const rgb of [[20, 8, 8], [255, 240, 240]]) {
    const pixels = Array.from({ length: 40 }, () => ({ r: rgb[0], g: rgb[1], b: rgb[2], a: 255 }));
    const hex = dominantColor(pixels);
    if (!hex) continue;
    const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
    const { l } = rgbToHsl(r, g, b);
    assert.ok(l >= 0.40 && l <= 0.64, `Helligkeit ${l.toFixed(2)} liegt ausserhalb (${hex})`);
  }
});
