// Generates the site icon set + og-image from the hand-drawn source art.
//
//   npm run icons      (from src/frontend)
//
// Source: icons/family-icons.svg — a single 513×251 canvas with the light icon
// (parchment ground) on the left half and the dark variant on the right.
// Outputs (committed to public/): favicon.svg (auto light/dark via
// prefers-color-scheme), favicon.ico (16/32/48), apple-touch-icon.png,
// icon-192/512.png, icon-maskable-512.png, og-image.png (1200×630).
//
// The app's default theme is Film (dark), so the PNG app icons + og-image use
// the DARK variant on a graphite ground. favicon.ico stays light (a tiny tab
// favicon reads fine, and ICO has no dark-mode mechanism); favicon.svg carries
// both and auto-switches on prefers-color-scheme.
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import sharp from 'sharp';
import opentype from 'opentype.js';

const root = path.dirname(fileURLToPath(import.meta.url));
const SRC = path.join(root, '../icons/family-icons.svg');
const OUT = path.join(root, '../public');
const FONTS = path.join(root, '../node_modules');

// Square crops around each icon, measured from the source path data
// (light icon spans x 16.2–237.5 / y 12.0–237.3; dark x 279.2–499.1).
const LIGHT_BOX = '13.9 11.6 226 226';
const DARK_BOX = '276.2 11.8 226 226';

// Full-canvas cream backdrop behind both icons — stripped so the rounded
// corners of the cropped icons come out transparent.
const BG_PATH = '<path fill="#FCF6E7" d="M0 0L513 0L513 251L0 251L0 0Z"/>';

// Film (eighties) theme palette — src/styles/themes/eighties.scss. The default
// theme, so the app icons + og-image are rendered in these tones.
const FILM_GROUND = '#1b1c1f'; // graphite body/chrome (matches theme-color + manifest)
const FILM_GROUND_HI = '#2c2f33';
const FILM_GROUND_LO = '#161719';
const FILM_INK = '#ededea'; // light text
const FILM_INK_FAINT = '#9aa0a6';
const FILM_EDGE = '#4a4f55'; // panel hairline
const FILM_STEEL = '#8b9197'; // muted steel accent (replaces gilt)

async function loadArt() {
  const raw = await readFile(SRC, 'utf-8');
  if (!raw.includes(BG_PATH)) {
    throw new Error('family-icons.svg: full-canvas background path not found — re-check BG_PATH');
  }
  const inner = raw
    .replace(/^<\?xml[^>]*\?>/, '')
    .replace(/<svg[^>]*>/, '')
    .replace(/<\/svg>\s*$/, '')
    .replace(BG_PATH, '');
  return inner;
}

function variantSvg(art, viewBox, size) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="${viewBox}">${art}</svg>`;
}

function faviconSvg(art) {
  const [lx, ly] = LIGHT_BOX.split(' ').map(Number);
  const [dx, dy] = DARK_BOX.split(' ').map(Number);
  // One copy of the artwork, shown twice via <use>; the outer 226² viewBox
  // crops away whichever icon the translate pushes off-canvas.
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 226 226">` +
    `<style>#dark{display:none}@media(prefers-color-scheme:dark){#light{display:none}#dark{display:inline}}</style>` +
    `<defs><g id="art">${art}</g></defs>` +
    `<use id="light" href="#art" transform="translate(${-lx},${-ly})"/>` +
    `<use id="dark" href="#art" transform="translate(${-dx},${-dy})"/>` +
    `</svg>`
  );
}

function pngsToIco(pngs) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(1, 2); // type: icon
  header.writeUInt16LE(pngs.length, 4);
  const entries = [];
  let offset = 6 + 16 * pngs.length;
  for (const { size, buf } of pngs) {
    const e = Buffer.alloc(16);
    e.writeUInt8(size % 256, 0);
    e.writeUInt8(size % 256, 1);
    e.writeUInt16LE(1, 4); // color planes
    e.writeUInt16LE(32, 6); // bits per pixel
    e.writeUInt32LE(buf.length, 8);
    e.writeUInt32LE(offset, 12);
    offset += buf.length;
    entries.push(e);
  }
  return Buffer.concat([header, ...entries, ...pngs.map(p => p.buf)]);
}

async function loadFont(rel) {
  const buf = await readFile(path.join(FONTS, rel));
  return opentype.parse(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
}

// Serialises opentype path commands ourselves at fixed precision. opentype.js's
// own Path.toPathData() can emit literal "NaN" tokens for some glyphs in this
// font even when the command coordinates are finite, which makes the SVG
// rasteriser drop the whole <path>; serialising from the (clean) commands avoids it.
function commandsToPathData(commands) {
  const n = (v) => Number(v.toFixed(2));
  return commands
    .map((c) => {
      switch (c.type) {
        case 'M': return `M${n(c.x)} ${n(c.y)}`;
        case 'L': return `L${n(c.x)} ${n(c.y)}`;
        case 'C': return `C${n(c.x1)} ${n(c.y1)} ${n(c.x2)} ${n(c.y2)} ${n(c.x)} ${n(c.y)}`;
        case 'Q': return `Q${n(c.x1)} ${n(c.y1)} ${n(c.x)} ${n(c.y)}`;
        case 'Z': return 'Z';
        // opentype emits only M/L/C/Q/Z; fail loud if a future font needs more,
        // rather than silently dropping commands into corrupted glyph shapes.
        default: throw new Error(`commandsToPathData: unsupported command type "${c.type}"`);
      }
    })
    .join('');
}

// Lays text out word by word (subset fonts sometimes drop the space glyph)
// and returns centred outline path data — no fontconfig involved, so the
// brand faces render identically on any machine.
function centredText(font, text, size, centerX, baselineY, fill) {
  const words = text.split(' ');
  let spaceAdv = font.getAdvanceWidth(' ', size);
  if (!spaceAdv || spaceAdv <= 0) {
    spaceAdv = size * 0.3;
  }
  const widths = words.map(w => font.getAdvanceWidth(w, size));
  const total = widths.reduce((a, b) => a + b, 0) + spaceAdv * (words.length - 1);
  let x = centerX - total / 2;
  const ds = [];
  words.forEach((w, i) => {
    ds.push(commandsToPathData(font.getPath(w, x, baselineY, size).commands));
    x += widths[i] + spaceAdv;
  });
  return `<path fill="${fill}" d="${ds.join(' ')}"/>`;
}

function ogSvg(art, titlePath, subtitlePath) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">
  <defs>
    <radialGradient id="paper" cx="50%" cy="0%" r="120%">
      <stop offset="0%" stop-color="${FILM_GROUND_HI}"/>
      <stop offset="45%" stop-color="${FILM_GROUND}"/>
      <stop offset="100%" stop-color="${FILM_GROUND_LO}"/>
    </radialGradient>
    <linearGradient id="rule" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0%" stop-color="${FILM_STEEL}" stop-opacity="0"/>
      <stop offset="50%" stop-color="${FILM_STEEL}"/>
      <stop offset="100%" stop-color="${FILM_STEEL}" stop-opacity="0"/>
    </linearGradient>
  </defs>
  <rect width="1200" height="630" fill="url(#paper)"/>
  <rect x="18" y="18" width="1164" height="594" rx="10" fill="none" stroke="${FILM_EDGE}" stroke-width="2.5"/>
  <rect x="26" y="26" width="1148" height="578" rx="7" fill="none" stroke="${FILM_STEEL}" stroke-opacity="0.4" stroke-width="1"/>
  <svg x="466" y="62" width="268" height="268" viewBox="${DARK_BOX}">${art}</svg>
  ${titlePath}
  <rect x="370" y="498" width="460" height="2" fill="url(#rule)"/>
  ${subtitlePath}
</svg>`;
}

async function main() {
  await mkdir(OUT, { recursive: true });
  const art = await loadArt();

  // --- favicon.svg (light/dark auto-switch) ---
  await writeFile(path.join(OUT, 'favicon.svg'), faviconSvg(art));

  // --- PNG rasters ---
  const pngFrom = (box) => (size) => sharp(Buffer.from(variantSvg(art, box, size))).png();
  const lightPng = pngFrom(LIGHT_BOX);
  const darkPng = pngFrom(DARK_BOX);

  // favicon.ico keeps the light variant (no dark-mode mechanism in ICO).
  const icoPngs = [];
  for (const size of [16, 32, 48]) {
    icoPngs.push({ size, buf: await lightPng(size).toBuffer() });
  }
  await writeFile(path.join(OUT, 'favicon.ico'), pngsToIco(icoPngs));

  // App icons use the dark variant on a graphite ground (Film default theme).
  // iOS replaces transparency with black, so flatten onto the Film ground.
  await sharp(Buffer.from(variantSvg(art, DARK_BOX, 180)))
    .flatten({ background: FILM_GROUND })
    .png()
    .toFile(path.join(OUT, 'apple-touch-icon.png'));

  await darkPng(192).toFile(path.join(OUT, 'icon-192.png'));
  await darkPng(512).toFile(path.join(OUT, 'icon-512.png'));

  // Maskable: content inside the ~80% safe zone on a full-bleed graphite square.
  const maskInner = await darkPng(412).toBuffer();
  await sharp({ create: { width: 512, height: 512, channels: 4, background: FILM_GROUND } })
    .composite([{ input: maskInner, left: 50, top: 50 }])
    .png()
    .toFile(path.join(OUT, 'icon-maskable-512.png'));

  // --- og-image (1200×630) ---
  const forum = await loadFont('@fontsource/forum/files/forum-cyrillic-400-normal.woff');
  const cinzel = await loadFont('@fontsource/cinzel/files/cinzel-latin-600-normal.woff');
  const title = centredText(forum, 'Семейное древо', 80, 600, 462, FILM_INK);
  const subtitle = centredText(cinzel, 'Family tree', 30, 600, 560, FILM_INK_FAINT);
  await sharp(Buffer.from(ogSvg(art, title, subtitle))).png().toFile(path.join(OUT, 'og-image.png'));

  console.log('icons + og-image written to public/');
}

await main();
