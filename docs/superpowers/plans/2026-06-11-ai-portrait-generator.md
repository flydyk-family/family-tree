# AI Portrait Generator Tool Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A one-time batch CLI (`scripts/generate-media.mjs`) that generates a still portrait (`gpt-image-2`) and, opt-in, a living-portrait clip (Sora 2 image-to-video) per person, writing `media/portraits/p-XXXX.jpg`/`.mp4` for the existing upload script.

**Architecture:** A thin orchestrator entry over small pure, unit-tested modules — `args` (argv→options), `personPrompt` (person→prompt), `people` (load/select), `plan` (per-person actions + cost), and `openai` (the two API calls, with an injectable `fetch`/`sleep` so they unit-test without the network). Zero npm dependencies (built-in `fetch`, `FormData`, `Blob`, `node:test`). Output goes only into the gitignored `media/` folder.

**Tech Stack:** Node 22 ESM (`.mjs`), built-in `fetch`/`FormData`/`Blob`/`Buffer`, `node:test` + `node:assert`, OpenAI REST API (`gpt-image-2`, `sora-2`/`sora-2-pro`).

**Spec:** [`docs/superpowers/specs/2026-06-11-ai-portrait-generator-design.md`](../specs/2026-06-11-ai-portrait-generator-design.md)

**Environment notes (this machine):**
- System Node 18 shadows the required Node 22. Before any `node`/`npm` command, prepend the portable Node to PATH:
  - Git Bash: `export PATH="/c/Users/perov/AppData/Local/Programs/nodejs-22:$PATH"` (verify `node --version` → v22.x; `FormData`/`Blob`/`fetch`/`node:test` all need ≥18, present in 22)
- All commands run from the repo root unless noted. Commit after every task.
- Work on the current branch (`claude/ai-portrait-generator`, based on `main`). Do **not** merge — the owner reviews the PR.
- These tests run via `node --test`, NOT vitest (vitest only globs `src/**/*.spec.ts`, so it ignores `scripts/`). No CI change (spec §10).

**Reference — exact OpenAI shapes (verified):**
- Image: `POST {BASE}/images/generations`, JSON `{ model, prompt, size, quality, output_format, n }`; response `{ data: [{ b64_json }] }` (gpt-image models return base64, never a URL).
- Video create: `POST {BASE}/videos`, **multipart/form-data** fields `model`, `prompt`, `size`, `seconds`, `input_reference` (the still file). Response `{ id, status }` where status ∈ `queued|in_progress|completed|failed`.
- Video poll: `GET {BASE}/videos/{id}` → `{ status, progress }`.
- Video download: `GET {BASE}/videos/{id}/content` → MP4 bytes.
- `BASE` defaults to `https://api.openai.com/v1`.

---

### Task 1: `args.mjs` — argv → validated options

**Files:**
- Create: `scripts/lib/args.mjs`
- Test: `scripts/lib/args.test.mjs`

- [ ] **Step 1: Write the failing test**

Create `scripts/lib/args.test.mjs`:

```javascript
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseArgs } from './args.mjs';

test('defaults when no flags', () => {
  const o = parseArgs([]);
  assert.deepEqual(o, {
    only: null, withVideo: false, image: null, prompt: null,
    force: false, size: '720x1280', seconds: '4', dryRun: false, yes: false
  });
});

test('parses every flag', () => {
  const o = parseArgs([
    '--only', 'p-0016,p-0003', '--with-video', '--image', 'a.jpg',
    '--prompt', 'a man', '--force', '--size', '1024x1792', '--seconds', '8',
    '--dry-run', '--yes'
  ]);
  assert.deepEqual(o.only, ['p-0016', 'p-0003']);
  assert.equal(o.withVideo, true);
  assert.equal(o.image, 'a.jpg');
  assert.equal(o.prompt, 'a man');
  assert.equal(o.force, true);
  assert.equal(o.size, '1024x1792');
  assert.equal(o.seconds, '8');
  assert.equal(o.dryRun, true);
  assert.equal(o.yes, true);
});

test('--only trims and drops empty ids', () => {
  assert.deepEqual(parseArgs(['--only', ' p-1 , , p-2 ']).only, ['p-1', 'p-2']);
});

test('unknown flag throws', () => {
  assert.throws(() => parseArgs(['--nope']), /Unknown argument: --nope/);
});

test('missing value throws', () => {
  assert.throws(() => parseArgs(['--size']), /Missing value for --size/);
});

test('invalid size throws', () => {
  assert.throws(() => parseArgs(['--size', '800x800']), /--size must be one of/);
});

test('invalid seconds throws', () => {
  assert.throws(() => parseArgs(['--seconds', '5']), /--seconds must be one of/);
});

test('--image requires exactly one --only id', () => {
  assert.throws(() => parseArgs(['--image', 'a.jpg']), /--image requires exactly one --only/);
  assert.throws(() => parseArgs(['--image', 'a.jpg', '--only', 'p-1,p-2']), /--image requires exactly one --only/);
  assert.doesNotThrow(() => parseArgs(['--image', 'a.jpg', '--only', 'p-1']));
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --test scripts/lib/args.test.mjs`
Expected: FAIL — cannot find module `./args.mjs`.

- [ ] **Step 3: Implement `args.mjs`**

Create `scripts/lib/args.mjs`:

```javascript
// Pure argv -> options parser for generate-media.mjs. No I/O.
const SIZES = new Set(['720x1280', '1280x720', '1024x1792', '1792x1024']);
const SECONDS = new Set(['4', '8', '12']);

export function parseArgs(argv) {
  const opts = {
    only: null, withVideo: false, image: null, prompt: null,
    force: false, size: '720x1280', seconds: '4', dryRun: false, yes: false
  };
  for (let i = 0; i < argv.length; i++) {
    const flag = argv[i];
    const value = () => {
      const v = argv[++i];
      if (v === undefined) {
        throw new Error(`Missing value for ${flag}`);
      }
      return v;
    };
    switch (flag) {
      case '--only': opts.only = value().split(',').map((s) => s.trim()).filter(Boolean); break;
      case '--with-video': opts.withVideo = true; break;
      case '--image': opts.image = value(); break;
      case '--prompt': opts.prompt = value(); break;
      case '--force': opts.force = true; break;
      case '--size': opts.size = value(); break;
      case '--seconds': opts.seconds = value(); break;
      case '--dry-run': opts.dryRun = true; break;
      case '--yes': opts.yes = true; break;
      default: throw new Error(`Unknown argument: ${flag}`);
    }
  }
  if (!SIZES.has(opts.size)) {
    throw new Error(`--size must be one of ${[...SIZES].join(', ')}`);
  }
  if (!SECONDS.has(opts.seconds)) {
    throw new Error(`--seconds must be one of ${[...SECONDS].join(', ')}`);
  }
  if (opts.image && (!opts.only || opts.only.length !== 1)) {
    throw new Error('--image requires exactly one --only <id>');
  }
  return opts;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `node --test scripts/lib/args.test.mjs`
Expected: PASS (8 tests).

- [ ] **Step 5: Commit**

```bash
git add scripts/lib/args.mjs scripts/lib/args.test.mjs
git commit -m "Add argv parser for the media generator CLI"
```

---

### Task 2: `personPrompt.mjs` — person → image prompt

**Files:**
- Create: `scripts/lib/personPrompt.mjs`
- Test: `scripts/lib/personPrompt.test.mjs`

- [ ] **Step 1: Write the failing test**

Create `scripts/lib/personPrompt.test.mjs`:

```javascript
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildImagePrompt, MOTION_PROMPT } from './personPrompt.mjs';

const person = (over = {}) => ({
  sex: 'male',
  birth: { year: 1900, place: { ru: 'Минск', be: null, en: 'Minsk' } },
  vocation: 'teacher',
  ...over
});

test('maps sex to man / woman', () => {
  assert.match(buildImagePrompt(person({ sex: 'male' })), /adult man/);
  assert.match(buildImagePrompt(person({ sex: 'female' })), /adult woman/);
});

test('era buckets by birth year (boundaries)', () => {
  assert.match(buildImagePrompt(person({ birth: { year: 1800 } })), /18th-century/);
  assert.match(buildImagePrompt(person({ birth: { year: 1801 } })), /early-to-mid 19th-century/);
  assert.match(buildImagePrompt(person({ birth: { year: 1870 } })), /early-to-mid 19th-century/);
  assert.match(buildImagePrompt(person({ birth: { year: 1871 } })), /belle-époque/);
  assert.match(buildImagePrompt(person({ birth: { year: 1945 } })), /interwar/);
  assert.match(buildImagePrompt(person({ birth: { year: 1980 } })), /mid-20th-century/);
  assert.match(buildImagePrompt(person({ birth: { year: 1981 } })), /contemporary/);
});

test('maps vocation to styling, unknown falls to other', () => {
  assert.match(buildImagePrompt(person({ vocation: 'church' })), /devout/);
  assert.match(buildImagePrompt(person({ vocation: 'zzz' })), /plain, dignified period dress/);
});

test('includes birthplace when present, omits when absent', () => {
  assert.match(buildImagePrompt(person()), /evoking Minsk/);
  assert.doesNotMatch(buildImagePrompt(person({ birth: { year: 1900 } })), /evoking/);
});

test('falls back to ru place when en is null', () => {
  const p = person({ birth: { year: 1900, place: { ru: 'Гродно', be: null, en: null } } });
  assert.match(buildImagePrompt(p), /evoking Гродно/);
});

test('motion prompt is a non-empty constant', () => {
  assert.equal(typeof MOTION_PROMPT, 'string');
  assert.ok(MOTION_PROMPT.length > 20);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --test scripts/lib/personPrompt.test.mjs`
Expected: FAIL — cannot find module `./personPrompt.mjs`.

- [ ] **Step 3: Implement `personPrompt.mjs`**

Create `scripts/lib/personPrompt.mjs`:

```javascript
// Pure person -> English image prompt. Reads only family.json fields.
// These are imagined ancestors (no reference photos): the output is an
// era-appropriate portrait, not a real likeness.

export const MOTION_PROMPT =
  'Subtle living-portrait motion — gentle breathing, a soft blink, a faint head shift, ' +
  'a slow ambient light change. No camera movement. Calm, loop-friendly, minimal.';

function era(year) {
  if (year == null) return 'classic';
  if (year <= 1800) return '18th-century';
  if (year <= 1870) return 'early-to-mid 19th-century';
  if (year <= 1918) return 'late-19th-century belle-époque';
  if (year <= 1945) return 'interwar early-20th-century';
  if (year <= 1980) return 'mid-20th-century';
  return 'late-20th-century contemporary';
}

const VOCATION = {
  teacher: 'dressed as a scholarly educator, a book or papers at hand',
  church: 'in the modest attire of a devout churchgoer or clergy',
  writer: 'with the thoughtful air of a writer, pen and paper nearby',
  office: 'in the formal coat of a clerical office worker',
  other: 'in plain, dignified period dress'
};

function localized(text) {
  if (!text) return '';
  return text.en ?? text.ru ?? text.be ?? '';
}

export function buildImagePrompt(person) {
  const sex = person.sex === 'female' ? 'woman' : 'man';
  const period = era(person.birth?.year);
  const vocation = VOCATION[person.vocation] ?? VOCATION.other;
  const place = localized(person.birth?.place);
  const placeClause = place ? `, evoking ${place}` : '';
  return (
    `A dignified, photorealistic ${period} head-and-shoulders portrait of an adult ${sex} ` +
    `in mature middle age, ${vocation}${placeClause}. Warm muted tones, painterly studio ` +
    `light, the subject calmly regarding the viewer. Neutral period background.`
  );
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `node --test scripts/lib/personPrompt.test.mjs`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add scripts/lib/personPrompt.mjs scripts/lib/personPrompt.test.mjs
git commit -m "Add deterministic per-person image prompt builder"
```

---

### Task 3: `people.mjs` — load and select people

**Files:**
- Create: `scripts/lib/people.mjs`
- Test: `scripts/lib/people.test.mjs`

- [ ] **Step 1: Write the failing test**

Create `scripts/lib/people.test.mjs`:

```javascript
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { selectPeople } from './people.mjs';

const people = [{ id: 'p-1' }, { id: 'p-2' }, { id: 'p-3' }];

test('null selection returns all people unchanged', () => {
  assert.deepEqual(selectPeople(people, null), people);
});

test('selects the requested ids in the requested order', () => {
  assert.deepEqual(selectPeople(people, ['p-3', 'p-1']), [{ id: 'p-3' }, { id: 'p-1' }]);
});

test('throws on unknown id, naming the offender', () => {
  assert.throws(() => selectPeople(people, ['p-1', 'p-9']), /Unknown person id\(s\): p-9/);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --test scripts/lib/people.test.mjs`
Expected: FAIL — cannot find module `./people.mjs`.

- [ ] **Step 3: Implement `people.mjs`**

Create `scripts/lib/people.mjs`:

```javascript
import { readFileSync } from 'node:fs';

// Loads the people array from the API's seed JSON. Thin I/O wrapper.
export function loadPeople(jsonPath) {
  const data = JSON.parse(readFileSync(jsonPath, 'utf-8'));
  return data.people ?? [];
}

// Pure: returns all people (onlyIds null) or exactly the requested ids in order.
export function selectPeople(people, onlyIds) {
  if (!onlyIds) {
    return people;
  }
  const byId = new Map(people.map((p) => [p.id, p]));
  const missing = onlyIds.filter((id) => !byId.has(id));
  if (missing.length) {
    throw new Error(`Unknown person id(s): ${missing.join(', ')}`);
  }
  return onlyIds.map((id) => byId.get(id));
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `node --test scripts/lib/people.test.mjs`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add scripts/lib/people.mjs scripts/lib/people.test.mjs
git commit -m "Add people loading and id selection for the generator"
```

---

### Task 4: `plan.mjs` — per-person actions + cost estimate

**Files:**
- Create: `scripts/lib/plan.mjs`
- Test: `scripts/lib/plan.test.mjs`

- [ ] **Step 1: Write the failing test**

Create `scripts/lib/plan.test.mjs`:

```javascript
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { planActions, estimateCost } from './plan.mjs';

const opts = (over = {}) => ({
  withVideo: false, image: null, force: false, ...over
});

test('still: provided when --image given', () => {
  assert.equal(planActions(opts({ image: 'a.jpg' }), { stillExists: true, videoExists: false }).still, 'provided');
});

test('still: reuse when it exists and not forced, generate otherwise', () => {
  assert.equal(planActions(opts(), { stillExists: true, videoExists: false }).still, 'reuse');
  assert.equal(planActions(opts(), { stillExists: false, videoExists: false }).still, 'generate');
  assert.equal(planActions(opts({ force: true }), { stillExists: true, videoExists: false }).still, 'generate');
});

test('video: none without --with-video', () => {
  assert.equal(planActions(opts(), { stillExists: false, videoExists: false }).video, 'none');
});

test('video: skip when it exists and not forced, generate otherwise', () => {
  assert.equal(planActions(opts({ withVideo: true }), { stillExists: true, videoExists: true }).video, 'skip');
  assert.equal(planActions(opts({ withVideo: true }), { stillExists: true, videoExists: false }).video, 'generate');
  assert.equal(planActions(opts({ withVideo: true, force: true }), { stillExists: true, videoExists: true }).video, 'generate');
});

test('estimateCost sums stills and videos at the size tier', () => {
  const plan = [
    { still: 'generate', video: 'generate' },
    { still: 'generate', video: 'generate' },
    { still: 'reuse', video: 'skip' }
  ];
  // 2 stills * 0.04 + 2 videos * 4s * 0.10 = 0.08 + 0.80 = 0.88
  assert.ok(Math.abs(estimateCost(plan, { seconds: '4', size: '720x1280' }) - 0.88) < 1e-9);
  // pro size: 2 * 4 * 0.30 = 2.40 + 0.08 = 2.48
  assert.ok(Math.abs(estimateCost(plan, { seconds: '4', size: '1024x1792' }) - 2.48) < 1e-9);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --test scripts/lib/plan.test.mjs`
Expected: FAIL — cannot find module `./plan.mjs`.

- [ ] **Step 3: Implement `plan.mjs`**

Create `scripts/lib/plan.mjs`:

```javascript
// Pure per-person action planning and a rough USD cost estimate.
// Pricing is approximate (verify current OpenAI pricing): gpt-image-2 high-quality
// still ~ $0.04; Sora 2 $0.10/s for 720x1280 / 1280x720, sora-2-pro $0.30/s for
// 1024x1792 / 1792x1024.
const STILL_USD = 0.04;
const PRO_SIZES = new Set(['1024x1792', '1792x1024']);

export function planActions(opts, { stillExists, videoExists }) {
  let still;
  if (opts.image) {
    still = 'provided';
  } else if (stillExists && !opts.force) {
    still = 'reuse';
  } else {
    still = 'generate';
  }

  let video;
  if (!opts.withVideo) {
    video = 'none';
  } else if (videoExists && !opts.force) {
    video = 'skip';
  } else {
    video = 'generate';
  }

  return { still, video };
}

export function estimateCost(plan, { seconds, size }) {
  const perSecond = PRO_SIZES.has(size) ? 0.30 : 0.10;
  const stills = plan.filter((p) => p.still === 'generate').length;
  const videos = plan.filter((p) => p.video === 'generate').length;
  return stills * STILL_USD + videos * Number(seconds) * perSecond;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `node --test scripts/lib/plan.test.mjs`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add scripts/lib/plan.mjs scripts/lib/plan.test.mjs
git commit -m "Add per-person action planning and cost estimate"
```

---

### Task 5: `openai.mjs` — image + video API calls (injectable fetch)

**Files:**
- Create: `scripts/lib/openai.mjs`
- Test: `scripts/lib/openai.test.mjs`

The two functions take a `deps`-style options object including `fetch` and (for video) `sleep`/`now`, so they unit-test with a fake `fetch` and never touch the network. They return bytes (`Buffer`); the orchestrator writes files.

- [ ] **Step 1: Write the failing test**

Create `scripts/lib/openai.test.mjs`:

```javascript
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generateStill, animateStill } from './openai.mjs';

function jsonResponse(body, ok = true, status = 200) {
  return { ok, status, json: async () => body, text: async () => JSON.stringify(body) };
}

test('generateStill posts the right request and decodes b64_json', async () => {
  const calls = [];
  const fakeFetch = async (url, init) => {
    calls.push({ url, init });
    return jsonResponse({ data: [{ b64_json: Buffer.from('hello').toString('base64') }] });
  };
  const bytes = await generateStill('a man', {
    size: '720x1280', apiKey: 'k', baseUrl: 'https://api.test/v1', fetch: fakeFetch
  });
  assert.equal(bytes.toString(), 'hello');
  assert.equal(calls[0].url, 'https://api.test/v1/images/generations');
  assert.equal(calls[0].init.method, 'POST');
  assert.equal(calls[0].init.headers.authorization, 'Bearer k');
  const body = JSON.parse(calls[0].init.body);
  assert.equal(body.model, 'gpt-image-2');
  assert.equal(body.prompt, 'a man');
  assert.equal(body.size, '720x1280');
  assert.equal(body.output_format, 'jpeg');
});

test('generateStill throws on a non-ok response', async () => {
  const fakeFetch = async () => jsonResponse({ error: 'no' }, false, 400);
  await assert.rejects(
    () => generateStill('x', { size: '720x1280', apiKey: 'k', fetch: fakeFetch }),
    /Image generation failed \(400\)/
  );
});

test('generateStill retries on a 503 then succeeds', async () => {
  let n = 0;
  const fakeFetch = async () => {
    n += 1;
    if (n < 3) {
      return { ok: false, status: 503, text: async () => 'busy' };
    }
    return jsonResponse({ data: [{ b64_json: Buffer.from('ok').toString('base64') }] });
  };
  const bytes = await generateStill('x', {
    size: '720x1280', apiKey: 'k', fetch: fakeFetch, sleep: async () => {}
  });
  assert.equal(bytes.toString(), 'ok');
  assert.equal(n, 3);
});

test('animateStill creates, polls until completed, and downloads bytes', async () => {
  const statuses = ['queued', 'in_progress', 'completed'];
  let pollIndex = 0;
  const seen = [];
  const fakeFetch = async (url, init) => {
    seen.push({ url, method: init?.method ?? 'GET' });
    if (url.endsWith('/videos') && init?.method === 'POST') {
      assert.ok(init.body instanceof FormData);
      assert.equal(init.body.get('model'), 'sora-2');
      assert.equal(init.body.get('size'), '720x1280');
      assert.equal(init.body.get('seconds'), '4');
      assert.ok(init.body.get('input_reference'));
      return jsonResponse({ id: 'vid_1', status: 'queued' });
    }
    if (url.endsWith('/videos/vid_1/content')) {
      return { ok: true, status: 200, arrayBuffer: async () => new TextEncoder().encode('MP4').buffer };
    }
    if (url.endsWith('/videos/vid_1')) {
      return jsonResponse({ id: 'vid_1', status: statuses[Math.min(++pollIndex, statuses.length - 1)] });
    }
    throw new Error(`unexpected url ${url}`);
  };
  const bytes = await animateStill(Buffer.from('still'), {
    size: '720x1280', seconds: '4', motionPrompt: 'move', model: 'sora-2',
    apiKey: 'k', baseUrl: 'https://api.test/v1', fetch: fakeFetch,
    sleep: async () => {}, now: () => 0
  });
  assert.equal(bytes.toString(), 'MP4');
  assert.ok(seen.some((c) => c.url.endsWith('/videos/vid_1')), 'polled status');
});

test('animateStill throws when the job fails', async () => {
  const fakeFetch = async (url, init) => {
    if (init?.method === 'POST') return jsonResponse({ id: 'v', status: 'queued' });
    return jsonResponse({ id: 'v', status: 'failed' });
  };
  await assert.rejects(
    () => animateStill(Buffer.from('s'), {
      size: '720x1280', seconds: '4', motionPrompt: 'm', apiKey: 'k',
      fetch: fakeFetch, sleep: async () => {}, now: () => 0
    }),
    /video job v failed/i
  );
});

test('animateStill times out', async () => {
  const fakeFetch = async (url, init) =>
    init?.method === 'POST'
      ? jsonResponse({ id: 'v', status: 'queued' })
      : jsonResponse({ id: 'v', status: 'in_progress' });
  let t = 0;
  await assert.rejects(
    () => animateStill(Buffer.from('s'), {
      size: '720x1280', seconds: '4', motionPrompt: 'm', apiKey: 'k',
      fetch: fakeFetch, sleep: async () => {}, now: () => (t += 10_000), timeoutMs: 5_000
    }),
    /timed out/
  );
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --test scripts/lib/openai.test.mjs`
Expected: FAIL — cannot find module `./openai.mjs`.

- [ ] **Step 3: Implement `openai.mjs`**

Create `scripts/lib/openai.mjs`:

```javascript
// OpenAI REST calls. fetch/sleep/now are injectable so this unit-tests without
// the network. Both functions return Buffers; the caller writes the files.
const DEFAULT_BASE = 'https://api.openai.com/v1';
const defaultSleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const RETRYABLE = new Set([429, 500, 502, 503, 504]);

// Retries a request on transient HTTP statuses and on network throws, with
// exponential backoff. Returns the final Response (the caller checks res.ok).
async function requestWithRetry(fetch, url, init, { retries = 3, sleep = defaultSleep }) {
  let lastErr;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await fetch(url, init);
      if (RETRYABLE.has(res.status) && attempt < retries) {
        await sleep(500 * 2 ** attempt);
        continue;
      }
      return res;
    } catch (err) {
      lastErr = err;
      if (attempt >= retries) {
        throw err;
      }
      await sleep(500 * 2 ** attempt);
    }
  }
  throw lastErr;
}

export async function generateStill(prompt, {
  size, apiKey, baseUrl = DEFAULT_BASE, fetch = globalThis.fetch, model = 'gpt-image-2',
  retries = 3, sleep = defaultSleep
}) {
  const res = await requestWithRetry(fetch, `${baseUrl}/images/generations`, {
    method: 'POST',
    headers: { authorization: `Bearer ${apiKey}`, 'content-type': 'application/json' },
    body: JSON.stringify({ model, prompt, size, quality: 'high', output_format: 'jpeg', n: 1 })
  }, { retries, sleep });
  if (!res.ok) {
    throw new Error(`Image generation failed (${res.status}): ${await res.text()}`);
  }
  const json = await res.json();
  const b64 = json.data?.[0]?.b64_json;
  if (!b64) {
    throw new Error('Image response missing b64_json');
  }
  return Buffer.from(b64, 'base64');
}

export async function animateStill(imageBytes, {
  size, seconds, motionPrompt, apiKey, baseUrl = DEFAULT_BASE,
  fetch = globalThis.fetch, model = 'sora-2',
  pollIntervalMs = 5000, timeoutMs = 600_000, retries = 3,
  sleep = defaultSleep, now = () => Date.now()
}) {
  const auth = { authorization: `Bearer ${apiKey}` };
  const form = new FormData();
  form.set('model', model);
  form.set('prompt', motionPrompt);
  form.set('size', size);
  form.set('seconds', String(seconds));
  form.set('input_reference', new Blob([imageBytes], { type: 'image/jpeg' }), 'still.jpg');

  let res = await requestWithRetry(fetch, `${baseUrl}/videos`, {
    method: 'POST', headers: auth, body: form
  }, { retries, sleep });
  if (!res.ok) {
    throw new Error(`Video create failed (${res.status}): ${await res.text()}`);
  }
  let job = await res.json();

  const deadline = now() + timeoutMs;
  while (job.status === 'queued' || job.status === 'in_progress') {
    if (now() > deadline) {
      throw new Error(`Video job ${job.id} timed out`);
    }
    await sleep(pollIntervalMs);
    res = await requestWithRetry(fetch, `${baseUrl}/videos/${job.id}`, { headers: auth }, { retries, sleep });
    if (!res.ok) {
      throw new Error(`Video poll failed (${res.status}): ${await res.text()}`);
    }
    job = await res.json();
  }
  if (job.status !== 'completed') {
    throw new Error(`Video job ${job.id} ${job.status}`);
  }

  res = await requestWithRetry(fetch, `${baseUrl}/videos/${job.id}/content`, { headers: auth }, { retries, sleep });
  if (!res.ok) {
    throw new Error(`Video download failed (${res.status}): ${await res.text()}`);
  }
  return Buffer.from(await res.arrayBuffer());
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `node --test scripts/lib/openai.test.mjs`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add scripts/lib/openai.mjs scripts/lib/openai.test.mjs
git commit -m "Add OpenAI image + video calls with injectable fetch"
```

---

### Task 6: `generate-media.mjs` — orchestration, cost gate, dry-run

**Files:**
- Create: `scripts/generate-media.mjs`

This is the I/O glue. It is verified via `--dry-run` (no network) rather than a unit test — all decision logic lives in the tested modules.

- [ ] **Step 1: Implement `generate-media.mjs`**

Create `scripts/generate-media.mjs`:

```javascript
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
```

- [ ] **Step 2: Verify the dry run works end-to-end (no network)**

Run: `node scripts/generate-media.mjs --only p-0016 --with-video --force --dry-run`
Expected: prints the person count + cost line, then a `# p-0016 — still:generate video:generate` block with a real image prompt and the motion prompt, ending with `(dry run — no API calls, no files written)`. Exit code 0. No files created in `media/`.

- [ ] **Step 3: Verify a multi-person dry run and an error path**

Run: `node scripts/generate-media.mjs --dry-run` (all people)
Expected: a block per person, cost line reflects all of them.

Run: `node scripts/generate-media.mjs --only p-9999 --dry-run`
Expected: exits non-zero with `Unknown person id(s): p-9999`.

Run: `node scripts/generate-media.mjs --image x.jpg --dry-run`
Expected: exits non-zero with `--image requires exactly one --only <id>`.

- [ ] **Step 4: Commit**

```bash
git add scripts/generate-media.mjs
git commit -m "Add the generate-media orchestrator with dry-run and cost gate"
```

---

### Task 7: Docs + full verification

**Files:**
- Modify: `docs/ci-cd/deploy.md`

- [ ] **Step 1: Add a usage section to `docs/ci-cd/deploy.md`**

In `docs/ci-cd/deploy.md`, immediately after the `### Cloudflare R2 (media)` subsection (the one that ends with the `curl -I … /media/portraits/<name>` verification line), insert:

```markdown
### Generating portrait media (AI, one-time)

`scripts/generate-media.mjs` creates the `media/portraits/p-XXXX.jpg` (and, with
`--with-video`, `.mp4`) pair per person via the OpenAI API, ready for
`scripts/upload-media.mjs`. It writes only into the gitignored `media/` folder.

> **Sora deprecation:** OpenAI's video (Sora 2) API shuts down **2026-09-24**. Run any
> `--with-video` generation before then. Still-portrait generation (`gpt-image-2`) is
> unaffected.

```bash
# Preview prompts, planned calls, and a cost estimate — no spend, no key needed:
node scripts/generate-media.mjs --dry-run

# Generate stills for everyone (asks to confirm the estimated spend):
OPENAI_API_KEY=sk-... node scripts/generate-media.mjs

# Stills + living clips for two people, regenerating even if files exist:
OPENAI_API_KEY=sk-... node scripts/generate-media.mjs --only p-0016,p-0003 --with-video --force

# Animate a real photo you already have, for one person:
OPENAI_API_KEY=sk-... node scripts/generate-media.mjs --only p-0016 --image ./grandpa.jpg --with-video
```

Flags: `--only <ids>`, `--with-video`, `--image <path>` (needs one `--only`),
`--prompt "<text>"` (override the auto prompt), `--force` (default skips existing),
`--size` (720x1280 | 1280x720 | 1024x1792 | 1792x1024, default 720x1280),
`--seconds` (4 | 8 | 12, default 4), `--dry-run`, `--yes` (skip the confirm).
Default size/duration ≈ $0.45–0.55 per person with video; clips are played muted in
the UI (the tool best-effort strips audio if `ffmpeg` is on `PATH`).

Then publish with `node scripts/upload-media.mjs` and reference the filenames from
`family.json` (`portrait`, `portraitVideo`).
```

- [ ] **Step 2: Run the whole generator test suite**

Run: `node --test scripts/lib/`
Expected: all tests pass across `args`, `personPrompt`, `people`, `plan`, `openai` (28 tests total). 0 failures.

- [ ] **Step 3: Confirm the frontend/backend suites are untouched**

Run (from `src/frontend`): `npm test`
Expected: PASS — the generator's `node --test` files live under `scripts/`, outside vitest's `src/**/*.spec.ts` glob, so the count is unchanged from `main`.

- [ ] **Step 4: Commit**

```bash
git add docs/ci-cd/deploy.md
git commit -m "Document the AI portrait generator workflow"
```

- [ ] **Step 5: Push and open the PR**

Use the superpowers:finishing-a-development-branch skill. PR base: `main`; title: **"AI portrait generator: gpt-image-2 stills + Sora living clips"**. Body should note: it writes only to the gitignored `media/` folder (no app/API/CI change), the Sora 2026-09-24 deprecation, and that the owner runs it with their `OPENAI_API_KEY` (the build is verified via `--dry-run`, no credits spent). **Do not merge** — the owner reviews.

---

## Notes for the implementer

- **No `package.json`.** These are standalone `.mjs` files run directly with `node`; there is nothing to `npm install`. Tests use the built-in `node:test` runner.
- **Don't run a real (non-dry-run) generation.** It spends the owner's OpenAI credits. Verify only with `--dry-run` and the `node --test` fake-fetch suites.
- **The `media/` folder is gitignored** (`/media/`); never commit generated media or test images.
- If `node --test scripts/lib/` reports a different total than 28, recount per file (args 8, personPrompt 6, people 3, plan 5, openai 6) — a missing file means a task was skipped.
