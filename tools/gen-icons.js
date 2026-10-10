// Générateur d'icônes PNG — pur Node (zlib natif), aucune dépendance.
// Reproduit icon.svg : carré vert #16a34a arrondi + check blanc.
// Usage : node tools/gen-icons.js  → écrit icon-192.png et icon-512.png à la racine.
'use strict';
const zlib = require('zlib');
const fs = require('fs');
const path = require('path');

// ---------- PNG minimal ----------
const CRC_TABLE = (function () {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
    t[n] = c;
  }
  return t;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body), 0);
  return Buffer.concat([len, body, crc]);
}

function encodePNG(width, height, rgba) {
  const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;  // bit depth
  ihdr[9] = 6;  // color type RGBA
  // scanlines avec octet de filtre 0
  const stride = width * 4;
  const raw = Buffer.alloc(height * (stride + 1));
  for (let y = 0; y < height; y++) {
    raw[y * (stride + 1)] = 0;
    rgba.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
  }
  const idat = zlib.deflateSync(raw, { level: 9 });
  return Buffer.concat([sig, chunk('IHDR', ihdr), chunk('IDAT', idat), chunk('IEND', Buffer.alloc(0))]);
}

// ---------- Dessin ----------
// Renvoie [r,g,b,a] pour un pixel, avec supersampling NxN pour l'anticrénelage.
function roundedRectOutside(x, y, size, radius) {
  const rx = radius, ry = radius;
  const cx = Math.min(Math.max(x, rx), size - rx);
  const cy = Math.min(Math.max(y, ry), size - ry);
  const dx = x - cx, dy = y - cy;
  return (dx * dx + dy * dy) > rx * ry; // true = hors du carré arrondi
}

function distToSegment(px, py, ax, ay, bx, by) {
  const vx = bx - ax, vy = by - ay;
  const wx = px - ax, wy = py - ay;
  const t = Math.max(0, Math.min(1, (vx * wx + vy * wy) / (vx * vx + vy * vy)));
  const dx = px - (ax + t * vx), dy = py - (ay + t * vy);
  return Math.sqrt(dx * dx + dy * dy);
}

function drawIcon(size) {
  const rgba = Buffer.alloc(size * size * 4);
  const N = 4; // supersampling
  const radius = size * 0.20;
  const stroke = size * 0.12;
  // Check en coordonnées normalisées : (0.25,0.53) → (0.42,0.69) → (0.76,0.33)
  const p1 = [0.25 * size, 0.53 * size], p2 = [0.42 * size, 0.69 * size], p3 = [0.76 * size, 0.33 * size];
  const GREEN = [22, 163, 74], WHITE = [255, 255, 255];
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let inBg = 0, inCheck = 0;
      for (let sy = 0; sy < N; sy++) {
        for (let sx = 0; sx < N; sx++) {
          const px = x + (sx + 0.5) / N, py = y + (sy + 0.5) / N;
          if (!roundedRectOutside(px, py, size, radius)) inBg++;
          const d = Math.min(
            distToSegment(px, py, p1[0], p1[1], p2[0], p2[1]),
            distToSegment(px, py, p2[0], p2[1], p3[0], p3[1])
          );
          if (d <= stroke / 2) inCheck++;
        }
      }
      const total = N * N;
      const i = (y * size + x) * 4;
      if (inBg === 0) { rgba[i + 3] = 0; continue; } // coin transparent
      const checkA = inCheck / total, bgA = inBg / total;
      let r, g, b;
      if (inCheck === 0) { [r, g, b] = GREEN; }
      else if (inCheck === total || bgA === 1) { [r, g, b] = WHITE; }
      else { // mélange check blanc / fond vert
        const w = inCheck / Math.max(inBg, 1);
        r = GREEN[0] + (WHITE[0] - GREEN[0]) * w;
        g = GREEN[1] + (WHITE[1] - GREEN[1]) * w;
        b = GREEN[2] + (WHITE[2] - GREEN[2]) * w;
      }
      rgba[i] = Math.round(r);
      rgba[i + 1] = Math.round(g);
      rgba[i + 2] = Math.round(b);
      rgba[i + 3] = Math.round(bgA * 255) === 0 && inBg > 0 ? 255 : Math.round(bgA * 255);
      if (inBg > 0 && inBg < total) rgba[i + 3] = Math.round((inBg / total) * 255); // bord anticrénelé
      if (inBg === total) rgba[i + 3] = 255;
    }
  }
  return rgba;
}

const root = path.join(__dirname, '..');
for (const size of [192, 512]) {
  const png = encodePNG(size, size, drawIcon(size));
  const out = path.join(root, 'icon-' + size + '.png');
  fs.writeFileSync(out, png);
  console.log('OK ' + out + ' (' + png.length + ' octets)');
}
