#!/usr/bin/env node
// One-time batch generator: gpt-image-2 still (+ opt-in Sora 2 living clip) per
// person, written into the gitignored media/portraits/ folder for upload-media.mjs.
//
// Usage:   node scripts/generate-media.mjs [options]   (see --help in the spec)
// Auth:    OPENAI_API_KEY (required for real runs; not needed for --dry-run).
import { createInterface } from 'node:readline/promises';
import { existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { parseArgs } from './lib/args.mjs';
import { loadPeople, selectPeople } from './lib/people.mjs';
import { planActions, estimateCost } from './lib/plan.mjs';
import { buildImagePrompt, MOTION_PROMPT } from './lib/personPrompt.mjs';
import { generateStill, animateStill } from './lib/openai.mjs';

const PRO_SIZES = new Set(['1024x1792', '1792x1024']);
const dataPath = fileURLToPath(new URL('../src/backend/FamilyTree.Api/Data/family.json', import.meta.url));
const mediaDir = fileURLToPath(new URL('../media/portraits', import.meta.url));

const stillPath = (id) => `${mediaDir}/${id}.jpg`;
const videoPath = (id) => `${mediaDir}/${id}.mp4`;

async function confirm(message) {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  try {
    const answer = await rl.question(`${message} [y/N] `);
    return /^y(es)?$/i.test(answer.trim());
  } finally {
    rl.close();
  }
}

// Best-effort: drop the audio track so clips are smaller (UI plays muted anyway).
// No-op if ffmpeg is absent or fails. Uses an args array (no shell) for safety.
function stripAudio(path) {
  const probe = spawnSync('ffmpeg', ['-version'], { stdio: 'ignore' });
  if (probe.status !== 0) {
    return;
  }
  const tmp = `${path}.muted.mp4`;
  const res = spawnSync('ffmpeg', ['-y', '-i', path, '-c', 'copy', '-an', tmp], { stdio: 'ignore' });
  if (res.status === 0 && existsSync(tmp)) {
    writeFileSync(path, readFileSync(tmp));
    unlinkSync(tmp);
  }
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  const people = selectPeople(loadPeople(dataPath), opts.only);

  // Build the per-person plan from current on-disk state.
  const rows = people.map((person) => {
    const actions = planActions(opts, {
      stillExists: existsSync(stillPath(person.id)),
      videoExists: existsSync(videoPath(person.id))
    });
    const prompt = opts.prompt ?? buildImagePrompt(person);
    return { person, actions, prompt };
  });

  const plan = rows.map((r) => r.actions);
  const cost = estimateCost(plan, { seconds: opts.seconds, size: opts.size });
  const stills = plan.filter((p) => p.still === 'generate').length;
  const videos = plan.filter((p) => p.video === 'generate').length;

  console.log(`People: ${rows.length}  |  stills to generate: ${stills}  |  clips to generate: ${videos}`);
  console.log(`Size ${opts.size}, ${opts.seconds}s. Estimated cost ~ $${cost.toFixed(2)} (verify current OpenAI pricing).`);

  if (opts.dryRun) {
    for (const r of rows) {
      console.log(`\n# ${r.person.id} — still:${r.actions.still} video:${r.actions.video}`);
      console.log(`  image prompt: ${r.prompt}`);
      if (r.actions.video === 'generate') {
        console.log(`  motion prompt: ${MOTION_PROMPT}`);
      }
    }
    console.log('\n(dry run — no API calls, no files written)');
    return;
  }

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    console.error('OPENAI_API_KEY is required for a real run (use --dry-run to preview).');
    process.exit(1);
  }
  if (!opts.yes && !(await confirm(`Spend ~ $${cost.toFixed(2)} on the OpenAI API?`))) {
    console.log('Aborted.');
    return;
  }

  mkdirSync(mediaDir, { recursive: true });
  const baseUrl = process.env.OPENAI_BASE_URL || undefined;
  const videoModel = PRO_SIZES.has(opts.size) ? 'sora-2-pro' : 'sora-2';
  const failures = [];
  let generated = 0;
  let skipped = 0;

  for (const { person, actions, prompt } of rows) {
    const id = person.id;
    try {
      // ---- still ----
      let stillBytes;
      if (actions.still === 'provided') {
        stillBytes = readFileSync(opts.image);
        writeFileSync(stillPath(id), stillBytes);
        console.log(`${id}: still from ${opts.image}`);
        generated++;
      } else if (actions.still === 'reuse') {
        stillBytes = readFileSync(stillPath(id));
        console.log(`${id}: still exists, reusing`);
        skipped++;
      } else {
        stillBytes = await generateStill(prompt, { size: opts.size, apiKey, baseUrl });
        writeFileSync(stillPath(id), stillBytes);
        console.log(`${id}: still generated`);
        generated++;
      }

      // ---- video ----
      if (actions.video === 'generate') {
        const clip = await animateStill(stillBytes, {
          size: opts.size, seconds: opts.seconds, motionPrompt: MOTION_PROMPT,
          model: videoModel, apiKey, baseUrl
        });
        writeFileSync(videoPath(id), clip);
        stripAudio(videoPath(id));
        console.log(`${id}: clip generated`);
        generated++;
      } else if (actions.video === 'skip') {
        console.log(`${id}: clip exists, skipping`);
        skipped++;
      }
    } catch (err) {
      console.error(`${id}: FAILED — ${err.message}`);
      failures.push(id);
    }
  }

  console.log(`\nDone. generated/used: ${generated}, skipped: ${skipped}, failed: ${failures.length}` +
    (failures.length ? ` (${failures.join(', ')})` : ''));
  if (failures.length) {
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
