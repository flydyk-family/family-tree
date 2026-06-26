#!/usr/bin/env node
// Uploads the committed seed graph to the GCS object the deployed API reads
// (FamilyData__Source=gs://<bucket>/<object>). Re-run to publish an edited baseline;
// the running API picks it up within the snapshot TTL (no redeploy).
//
// Usage:   node scripts/upload-seed.mjs [--bucket <name>] [--object <name>] [--dry-run]
// Auth:    `gcloud auth login` (or application-default credentials) with objectAdmin on the bucket.
// Target:  gs://<bucket>/<object>  (defaults: family-tree-seed / family.json).
import { execSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const seed = fileURLToPath(new URL('../src/backend/FamilyTree.Api/Data/family.json', import.meta.url));

const HELP = `Upload the committed seed graph to GCS for the deployed API.

Usage: node scripts/upload-seed.mjs [options]

Options:
  --bucket <name>   GCS bucket               (default: family-tree-seed)
  --object <name>   GCS object name          (default: family.json)
  --dry-run         Print the gcloud command without running it
  -h, --help        Show this help

Target: gs://<bucket>/<object>
Auth:   gcloud auth login (or application-default credentials) with objectAdmin on the bucket.`;

// Minimal flag parser: accepts "--flag value" and "--flag=value"; rejects unknown flags so
// a typo'd argument fails loudly instead of being silently ignored.
function parseArgs(argv) {
  const opts = { bucket: 'family-tree-seed', object: 'family.json', dryRun: false, help: false };
  const valueFlags = { '--bucket': 'bucket', '--object': 'object' };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--dry-run') { opts.dryRun = true; continue; }
    if (arg === '--help' || arg === '-h') { opts.help = true; continue; }
    const eq = arg.indexOf('=');
    const key = eq === -1 ? arg : arg.slice(0, eq);
    const dest = valueFlags[key];
    if (!dest) {
      console.error(`Unknown argument: ${arg}\n\n${HELP}`);
      process.exit(1);
    }
    let value;
    if (eq === -1) {
      value = argv[++i];
      if (value === undefined) {
        console.error(`Missing value for ${key}`);
        process.exit(1);
      }
    } else {
      value = arg.slice(eq + 1);
    }
    opts[dest] = value;
  }
  return opts;
}

const { bucket, object, dryRun, help } = parseArgs(process.argv.slice(2));

if (help) {
  console.log(HELP);
  process.exit(0);
}

// The bucket/object are interpolated into the gcloud command below. Reject anything
// outside a safe GCS-name charset so a stray quote/metacharacter can't break out of the
// quoted argument (shell injection). We keep execSync — not spawn with an args array —
// because the command runs through a shell so `gcloud` resolves to `gcloud.cmd` on Windows.
const SAFE_NAME = /^[A-Za-z0-9._\-/]+$/;
for (const [flag, value] of [['--bucket', bucket], ['--object', object]]) {
  if (!SAFE_NAME.test(value)) {
    console.error(`${flag} contains unsafe characters (allowed: letters, digits, and . _ - /): "${value}"`);
    process.exit(1);
  }
}

if (!existsSync(seed)) {
  console.error(`No seed file at ${seed} — nothing to upload.`);
  process.exit(1);
}

const target = `gs://${bucket}/${object}`;
const command = `gcloud storage cp "${seed}" "${target}"`;

if (dryRun) {
  console.log(`[dry-run] ${command}`);
  process.exit(0);
}

console.log(`Uploading ${seed} -> ${target}`);
execSync(command, { stdio: 'inherit' });
console.log('Done. The API picks up the change within the snapshot TTL.');
