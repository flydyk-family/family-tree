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
