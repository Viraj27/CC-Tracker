// Generates the PWA / Apple touch icons in public/icons/ (committed). A plain
// generated design — a white card with a stripe and chip on the app's accent
// blue — no brand logos. Dependency-free PNG encoder; re-run after changing
// the design: `node scripts/generate-icons.mjs`.
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";

const OUT = path.join(process.cwd(), "public", "icons");
const BG = [0x25, 0x57, 0xd6]; // --accent (light theme)
const CARD = [0xff, 0xff, 0xff];
const STRIPE = [0x15, 0x18, 0x1d];
const CHIP = [0xe0, 0xa9, 0x2e];

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
function crc32(buf) {
  let c = 0xffffffff;
  for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}
function png(size, rgb) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // RGB, opaque (iOS ignores transparency on touch icons anyway)
  const raw = Buffer.alloc((size * 3 + 1) * size);
  for (let y = 0; y < size; y++) {
    raw[y * (size * 3 + 1)] = 0; // filter: none
    rgb.copy(raw, y * (size * 3 + 1) + 1, y * size * 3, (y + 1) * size * 3);
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", zlib.deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

/** Inside a rounded rectangle (unit coordinates, 0..1). */
function inRoundRect(x, y, left, top, right, bottom, r) {
  if (x < left || x > right || y < top || y > bottom) return false;
  const cx = Math.min(Math.max(x, left + r), right - r);
  const cy = Math.min(Math.max(y, top + r), bottom - r);
  return (x - cx) ** 2 + (y - cy) ** 2 <= r * r;
}

/**
 * The card artwork, scaled by `content` around the centre (smaller for
 * maskable icons so it stays inside the safe zone).
 */
function colorAt(u, v, content) {
  const s = (t) => 0.5 + (t - 0.5) / content;
  const x = s(u);
  const y = s(v);
  const [l, t, r, b] = [0.14, 0.26, 0.86, 0.74];
  if (!inRoundRect(x, y, l, t, r, b, 0.06)) return BG;
  if (y > 0.34 && y < 0.43) return STRIPE;
  if (inRoundRect(x, y, 0.22, 0.5, 0.36, 0.62, 0.02)) return CHIP;
  return CARD;
}

function render(size, content) {
  const SS = 4; // supersampling for smooth edges
  const out = Buffer.alloc(size * size * 3);
  for (let py = 0; py < size; py++) {
    for (let px = 0; px < size; px++) {
      const acc = [0, 0, 0];
      for (let sy = 0; sy < SS; sy++) {
        for (let sx = 0; sx < SS; sx++) {
          const c = colorAt((px + (sx + 0.5) / SS) / size, (py + (sy + 0.5) / SS) / size, content);
          for (let i = 0; i < 3; i++) acc[i] += c[i];
        }
      }
      for (let i = 0; i < 3; i++) out[(py * size + px) * 3 + i] = Math.round(acc[i] / (SS * SS));
    }
  }
  return png(size, out);
}

fs.mkdirSync(OUT, { recursive: true });
const icons = [
  ["icon-192.png", 192, 1],
  ["icon-512.png", 512, 1],
  ["icon-maskable-512.png", 512, 0.8],
  ["apple-touch-icon.png", 180, 1],
  ["favicon-32.png", 32, 1],
];
for (const [name, size, content] of icons) {
  fs.writeFileSync(path.join(OUT, name), render(size, content));
  console.log(`public/icons/${name} (${size}x${size})`);
}
