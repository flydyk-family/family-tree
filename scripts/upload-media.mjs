#!/usr/bin/env node
// Uploads the local gitignored <repo root>/media folder to the R2 bucket the
// site serves at /media/* (folder structure mirrors object keys one-to-one).
//
// Usage:   node scripts/upload-media.mjs [--dry-run]
// Auth:    `npx wrangler login` once, or set CLOUDFLARE_API_TOKEN (+ CLOUDFLARE_ACCOUNT_ID).
// Bucket:  family-tree-media (override with the R2_BUCKET env var).
//
// Re-running is safe: filenames are immutable by convention (a changed image
// gets a new name), so re-uploads are byte-identical overwrites.
import { execSync } from 'node:child_process';
import { existsSync, readdirSync } from 'node:fs';
import { extname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const BUCKET = process.env.R2_BUCKET ?? 'family-tree-media';
const root = fileURLToPath(new URL('../media', import.meta.url));
const dryRun = process.argv.includes('--dry-run');

const TYPES = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.avif': 'image/avif',
  '.gif': 'image/gif',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm'
};

if (!existsSync(root)) {
  console.error(`No media folder at ${root} — nothing to upload.`);
  process.exit(1);
}

function* walk(dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      yield* walk(path);
    } else {
      yield path;
    }
  }
}

const quote = (value) => `"${value.replace(/"/g, '\\"')}"`;
let count = 0;

for (const file of walk(root)) {
  const key = relative(root, file).split('\\').join('/');
  const contentType = TYPES[extname(file).toLowerCase()] ?? 'application/octet-stream';
  console.log(`→ ${key} (${contentType})`);
  if (!dryRun) {
    // --remote targets the real bucket (wrangler defaults to local simulation).
    execSync(
      ['npx', 'wrangler', 'r2', 'object', 'put', quote(`${BUCKET}/${key}`),
        '--file', quote(file), '--content-type', contentType, '--remote'].join(' '),
      { stdio: 'inherit' }
    );
  }
  count += 1;
}

console.log(`${count} file(s) ${dryRun ? 'listed (dry run)' : 'uploaded to ' + BUCKET}.`);
