// Rasterizes the gilt-frame SVGs (frame-gold/-selected/-match) to WebP with alpha.
//
// WHY: the classic medallion draws each frame as a per-node <image>. A VECTOR svg
// there forces the browser to re-rasterize ~90KB of paths at the new scale on EVERY
// pan/zoom frame; with 116 people that is 232 rasterizations per frame and the tree
// drops to ~1fps. A bitmap is decoded once and GPU-scaled, so classic pan/zoom stays
// smooth (measured ~1fps -> ~50fps on the 116-person tree). The SVGs remain the
// editable source; this just bakes them to bitmaps the runtime can render cheaply.
//
// PIPELINE: edit frame-gold.svg -> `node scripts/gen-medallion-frames.mjs` (recolours
// the selected/match SVGs) -> `node scripts/gen-medallion-frame-rasters.mjs` (this).
//
// This is a manual, occasional dev tool (the frame art is owner-tuned and rarely
// changes), so puppeteer-core is NOT a committed dependency — install it on demand:
//     npm i -D puppeteer-core           # then run this script
// Chrome is auto-detected; override with PUPPETEER_EXECUTABLE_PATH=<path-to-chrome>.
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const dir = fileURLToPath(new URL('../src/assets/medallion/', import.meta.url));
const FRAMES = ['frame-gold', 'frame-selected', 'frame-match'];
// Below native (1362x1548): a frame is small on screen (trunk ~200 units) and only
// 3 shared textures exist, so 1024-wide stays crisp through normal zoom at ~half the
// native-res file size.
const W = 1024, H = Math.round(1024 * 1548 / 1362), QUALITY = 0.9;

function findChrome() {
  if (process.env.PUPPETEER_EXECUTABLE_PATH) return process.env.PUPPETEER_EXECUTABLE_PATH;
  const candidates = [
    'C:/Program Files/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser'
  ];
  return candidates.find(p => existsSync(p));
}

let puppeteer;
try {
  puppeteer = (await import('puppeteer-core')).default;
} catch {
  console.error('puppeteer-core is required. Install it on demand:\n  npm i -D puppeteer-core');
  process.exit(1);
}
const executablePath = findChrome();
if (!executablePath) {
  console.error('Could not find Chrome. Set PUPPETEER_EXECUTABLE_PATH to your Chrome/Chromium binary.');
  process.exit(1);
}

// `headless: true` is the new (rendering) headless on modern puppeteer-core and the
// old one on <v22; both rasterize SVG->canvas->WebP fine, so this works on any version.
const browser = await puppeteer.launch({ executablePath, headless: true, args: ['--no-sandbox'] });
try {
  const page = await browser.newPage();
  await page.setContent('<!doctype html><html><body></body></html>');
  for (const name of FRAMES) {
    const svg = readFileSync(dir + name + '.svg', 'utf8');
    const dataUrl = 'data:image/svg+xml;base64,' + Buffer.from(svg).toString('base64');
    const out = await page.evaluate(async (src, w, h, q) => {
      const img = new Image();
      // decode() rejects on a failed load, but guard onerror too and assert the
      // canvas isn't blank afterwards — these files get committed, so a silently
      // empty bitmap (e.g. a blocked sub-resource) must fail loudly, not ship.
      await new Promise((resolve, reject) => { img.onload = resolve; img.onerror = () => reject(new Error('image failed to load')); img.src = src; });
      await img.decode();
      const c = document.createElement('canvas');
      c.width = w; c.height = h;
      const ctx = c.getContext('2d');
      ctx.clearRect(0, 0, w, h); // keep the oval cut-out transparent
      ctx.drawImage(img, 0, 0, w, h);
      const { data } = ctx.getImageData(0, 0, w, h);
      let opaque = false;
      for (let i = 3; i < data.length; i += 4) { if (data[i] !== 0) { opaque = true; break; } }
      if (!opaque) throw new Error('rasterized canvas is fully transparent — refusing to write a blank frame');
      return c.toDataURL('image/webp', q);
    }, dataUrl, W, H, QUALITY);
    const buf = Buffer.from(out.split(',')[1], 'base64');
    writeFileSync(dir + name + '.webp', buf);
    console.log(`wrote ${name}.webp  ${(buf.length / 1024).toFixed(1)} KB`);
  }
} finally {
  await browser.close();
}
