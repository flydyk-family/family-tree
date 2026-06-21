#!/usr/bin/env node
// Uploads the committed seed graph to the GCS object the deployed API reads
// (FamilyData__Source=gs://<bucket>/<object>). Re-run to publish an edited baseline;
// the running API picks it up within the snapshot TTL (no redeploy).
//
// Usage:   node scripts/upload-seed.mjs [--dry-run]
// Auth:    `gcloud auth login` (or application-default credentials) with objectAdmin on the bucket.
// Target:  gs://$SEED_BUCKET/$SEED_OBJECT  (defaults below; override via env).
import { execSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const BUCKET = process.env.SEED_BUCKET ?? 'family-tree-seed';
const OBJECT = process.env.SEED_OBJECT ?? 'family.json';
const seed = fileURLToPath(new URL('../src/backend/FamilyTree.Api/Data/family.json', import.meta.url));
const dryRun = process.argv.includes('--dry-run');

// The bucket/object are interpolated into the gcloud command below. Reject anything
// outside a safe GCS-name charset so a stray quote/metacharacter can't break out of the
// quoted argument (shell injection). We keep execSync — not spawn with an args array —
// because the command runs through a shell so `gcloud` resolves to `gcloud.cmd` on Windows.
const SAFE_NAME = /^[A-Za-z0-9._\-/]+$/;
for (const [name, value] of [['SEED_BUCKET', BUCKET], ['SEED_OBJECT', OBJECT]]) {
  if (!SAFE_NAME.test(value)) {
    console.error(`${name} contains unsafe characters (allowed: letters, digits, and . _ - /): "${value}"`);
    process.exit(1);
  }
}

if (!existsSync(seed)) {
  console.error(`No seed file at ${seed} — nothing to upload.`);
  process.exit(1);
}

const target = `gs://${BUCKET}/${OBJECT}`;
const command = `gcloud storage cp "${seed}" "${target}"`;

if (dryRun) {
  console.log(`[dry-run] ${command}`);
  process.exit(0);
}

console.log(`Uploading ${seed} -> ${target}`);
execSync(command, { stdio: 'inherit' });
console.log('Done. The API picks up the change within the snapshot TTL.');
