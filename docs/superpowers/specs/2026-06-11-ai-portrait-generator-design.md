# AI Portrait Generator Tool — Design Spec

- **Date:** 2026-06-11
- **Status:** Awaiting owner review
- **Implements:** [`2026-06-10-living-portraits-media-design.md`](2026-06-10-living-portraits-media-design.md) §10 (post-implementation note)
- **Depends on:** the living-portraits media pipeline (merged) — `media/portraits/` convention, `scripts/upload-media.mjs`.

## 1. Purpose

A **one-time batch CLI tool** that generates the portrait media pair per person using the OpenAI API and writes it straight into the gitignored `media/portraits/` folder, so the existing `scripts/upload-media.mjs` publishes it to R2 unchanged. It has no interaction with the site, the API, or the repo's committed data.

- **Still portrait** — `gpt-image-2`, from an auto-derived per-person prompt. Always generated.
- **Living-portrait clip** — Sora 2 image-to-video from that still. Opt-in via `--with-video`.

Decided during brainstorming with the owner:

| Question | Decision |
|---|---|
| Runtime | **Node ESM script** beside `scripts/upload-media.mjs` (same toolchain, zero npm deps) |
| Scope | **Still always; video opt-in** (`--with-video`) |
| Prompt source | **Auto-derive from `family.json`** (with a `--prompt` override) |
| Execution | **Owner runs with their `OPENAI_API_KEY`**; the build is verified without spending credits |
| Extra inputs | A `--image` path (animate a supplied still) and a `--prompt` override |

## 2. Critical external-API finding: Sora deprecation

Research (June 2026) confirmed:

- **`gpt-image-2` is current** — `POST /v1/images/generations`, arbitrary `WIDTHxHEIGHT` sizes (each ÷16, aspect 1:3–3:1), `quality`, `output_format: jpeg|webp`. ([model](https://developers.openai.com/api/docs/models/gpt-image-2), [reference](https://developers.openai.com/api/reference/resources/images/methods/generate))
- **Sora 2 / the Videos API are deprecated, shutting down 2026-09-24** — `sora-2`, `sora-2-pro`, and the `POST /v1/videos` endpoint. ([video guide](https://developers.openai.com/api/docs/guides/video-generation), [sora-2 model](https://developers.openai.com/api/docs/models/sora-2))

This is acceptable because the tool is a **one-time batch**: the owner runs it once (before September 2026) to populate `media/portraits/`, uploads the immutable results to R2, and never needs it again. Already-generated clips are unaffected by the shutdown. The design must therefore **not** treat video generation as anything ongoing, and the still half (gpt-image-2) must stand alone so stills remain generatable after the video model is gone.

## 3. Architecture & files

Decomposed so the pure logic is unit-testable (the `scripts/` folder currently has no tests; `upload-media.mjs` relies on `--dry-run` only):

| File | Responsibility | Tested |
|---|---|---|
| `scripts/generate-media.mjs` | CLI entry + per-person orchestration (load data, select people, run still→video, summarize) | via `--dry-run` |
| `scripts/lib/personPrompt.mjs` | **Pure**: `person → image prompt` (era/vocation/sex/place → English prompt) | `node --test` |
| `scripts/lib/args.mjs` | **Pure**: `argv → options` (+ validation) | `node --test` |
| `scripts/lib/openai.mjs` | Thin I/O boundary: `generateStill(prompt, opts)`; `animateStill(imagePath, opts)` (create→poll→download) | exercised via dry-run; not unit-tested (I/O) |
| `scripts/lib/personPrompt.test.mjs`, `scripts/lib/args.test.mjs` | `node --test` suites | — |

- **Zero npm dependencies.** Built-in `fetch` against the OpenAI REST API (no `openai` SDK — there is no root `package.json` to host it, and `upload-media.mjs` set the precedent of built-ins + on-demand tooling). Built-in `node:test` runner.
- Each file holds one responsibility with a clear interface, so `personPrompt`/`args` can be reasoned about and tested without touching the network.

## 4. Prompt strategy (`personPrompt.mjs`)

`buildImagePrompt(person)` returns a deterministic English prompt. It reads only `family.json` fields:

- `sex` → "man" / "woman".
- `birth.year` → era bucket → period styling: ≤1800 "18th-century", 1801–1870 "early-to-mid 19th-century", 1871–1918 "late-19th / belle-époque", 1919–1945 "interwar", 1946–1980 "mid-20th-century", >1980 "late-20th-century / contemporary".
- `vocation` → attire/props: `teacher` (scholarly, books), `church` (clergy/devout), `writer` (literary, pen & paper), `office` (clerical, formal coat), `other` (plain period dress).
- `birth.place` (en) → setting hint.
- `summary`/`biography` (en, truncated) → character flavor.

Shape: *"A dignified, photorealistic [era] head-and-shoulders portrait of an adult [man/woman] in mature middle age, [vocation styling], evoking [place]. Warm muted tones, painterly studio light, the subject calmly regarding the viewer. Neutral period background."* The subject is always framed at a fixed mature-adulthood stage (no age computed from dates), keeping output deterministic. Uses English fields (best model performance); falls back to `ru` only if `en` is null. **These are imagined ancestors — no reference photos exist — so the output is an era-appropriate likeness, not a real person.** `--prompt "<text>"` replaces the derived prompt for the targeted person(s).

A separate constant **motion prompt** drives Sora: *"Subtle living-portrait motion — gentle breathing, a soft blink, a faint head shift, slow ambient light change. No camera movement. Calm, loop-friendly, minimal."*

## 5. Pipeline & the resolution constraint

Sora's `input_reference` image **must match the target video size**. To avoid a resize step, the still is generated **at a Sora-compatible portrait size** and reused as both the published still and the video reference frame:

1. **Still** (`p-XXXX.jpg`): `gpt-image-2`, `size` default `720x1280`, `output_format: jpeg`, `quality: high`. Source of the still is, in order: `--image <path>` (use as-is) → existing `media/portraits/p-XXXX.jpg` when not `--force` (reuse/skip) → generate from prompt.
2. **Clip** (`p-XXXX.mp4`, only with `--with-video`): `POST /v1/videos` (`model: sora-2`, `size` = the still's size, `seconds` = `--seconds` default 4, `input_reference` = the still) → poll the job to completion → download the MP4. Skipped if `p-XXXX.mp4` exists and not `--force`.

This **supersedes §6.4's "≤720 px long edge"** for AI clips — Sora's native portrait size (long edge 1280) wins; clips stay small via the short duration. Clips are played muted in the UI; if `ffmpeg` is on `PATH` the tool best-effort strips the audio track (smaller files), otherwise it leaves the clip untouched (harmless — playback is muted).

## 6. CLI surface

```
node scripts/generate-media.mjs [options]
  --only <ids>      comma-separated person ids, e.g. p-0016,p-0003 (default: all people)
  --with-video      also generate the Sora living-portrait clip from the still
  --image <path>    use this existing image as the still (skip gpt-image-2);
                    requires --only <single id>; ideal for a real photo
  --prompt "<text>" override the auto-derived image prompt for the targeted person(s)
  --force           regenerate even if media/portraits/p-XXXX.* already exists (default: skip)
  --size <WxH>      still/video size, ÷16, Sora-portrait-compatible (default 720x1280)
  --seconds <n>     clip duration (default 4)
  --dry-run         print resolved prompts, planned API calls, and a cost estimate; no spend
  --yes             skip the interactive cost confirmation
env:
  OPENAI_API_KEY    required for real (non-dry-run) runs
  OPENAI_BASE_URL   optional override (default https://api.openai.com/v1)
```

Validation (in `args.mjs`): `--image` requires exactly one `--only` id; `--size` must be `W x H` with both ÷16; `--seconds` a positive integer; unknown flags error out.

## 7. Data flow

1. Parse + validate args.
2. Load `src/backend/FamilyTree.Api/Data/family.json` (resolved relative to the script).
3. Select people: all, or the `--only` set (error on unknown id).
4. **Cost gate:** print a per-run summary — people count, stills to generate vs. skip, clips to generate, and an estimated USD total (with a note to verify current pricing) — then require `y/N` unless `--dry-run` or `--yes`.
5. Per person, sequentially: resolve/generate the still, then (if `--with-video`) generate the clip. Write both into `media/portraits/`.
6. Print a final summary: generated, skipped, failed (with reasons).

## 8. Error handling & cost guards

- **Missing `OPENAI_API_KEY`** on a non-dry-run → clear message, exit 1 (dry-run needs no key).
- **Per-person failures** (API error, content-policy refusal, Sora poll timeout) are caught, logged, and the batch **continues**; failures are collected and reported in the final summary with a non-zero exit if any occurred.
- **Transient errors** (5xx, rate limit) → a few retries with exponential backoff.
- **Sora polling** → bounded by a per-clip timeout (e.g. 10 min); on timeout the clip is marked failed and the run continues.
- **Idempotency:** default skip-existing makes re-runs safe and cheap; `--force` re-generates. The owner re-runs to fill gaps without re-spending on completed people.
- **Spend safety:** `--dry-run` and the confirmation gate ensure no accidental spend; the tool never reads committed secrets and never writes outside `media/`.

## 9. Testing

- **`node --test scripts/`** (zero new deps):
  - `personPrompt`: era bucketing at boundaries, vocation→styling mapping, sex mapping, en→ru fallback, `--prompt` override path, deterministic output for a fixed person.
  - `args`: each flag parses; `--image` without/with multiple `--only` errors; bad `--size`/`--seconds` error; defaults applied; unknown flag errors.
- **`--dry-run` end-to-end** (no network): prints the resolved prompt and planned calls for a sample person; used as the build-verification smoke test in place of live API calls.
- The `openai.mjs` I/O layer is intentionally thin and not unit-tested (network boundary), consistent with `upload-media.mjs`.

## 10. Docs & integration

- A short usage section appended to `docs/ci-cd/deploy.md` next to the existing R2/upload guidance (generate → review locally via the dev `/media` folder → `upload-media.mjs`), including the Sora deprecation date and a "run before September 2026" note.
- No changes to the app, the API, CI, or committed `family.json`. Output is purely local media for the existing upload path.

## 11. Out of scope

- Any ongoing/serverless generation service; scheduling; a UI.
- Editing committed `family.json` (filenames are wired separately, as a data task).
- Real-likeness generation from reference photos of actual people (beyond the optional `--image` passthrough).
- Multi-resolution variants, upscaling, or face-restoration post-processing.
- Audio design for clips (UI plays muted; audio is stripped only as a best-effort size optimization).
