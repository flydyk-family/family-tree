# Living Portraits & Private Media Delivery — Design Spec

- **Date:** 2026-06-10
- **Status:** Awaiting owner review
- **Refines:** [`2026-06-04-portrait-medallions-design.md`](2026-06-04-portrait-medallions-design.md) §8 (portrait asset URL convention), [`2026-06-06-public-deploy-design.md`](2026-06-06-public-deploy-design.md) §4.2 (deferred `/assets/*` portraits note)

## 1. Purpose

Give the family tree real images and video while keeping the media files **out of the public GitHub repo**:

1. **Static portraits** — fill the already-wired portrait slot on tree medallions (`PersonMedallion.vue` renders an `<image>` with initials fallback today; no real files exist anywhere).
2. **Living portraits** — a few-second, muted, looping video version of a portrait ("Harry Potter" style) that plays **in the person detail popup only**. Tree medallions stay static. Clicking the popup/docked-panel portrait opens a screen-centered full-size lightbox (§5.2).
3. **Private media hosting** — media lives in object storage (Cloudflare R2), uploaded by the owner from a local folder via a CLI script. The public repo carries only *filenames*.

Decided during brainstorming with the owner:

| Question | Decision |
|---|---|
| Who can see media on the deployed (public) site? | Anyone — no gating; the only privacy requirement is "not in the public repo" |
| UI scope | Static portraits + living-portrait video; video animates **in the popup only** |
| Management | CLI/script upload by the owner; no admin UI |
| Volume | Small — photos plus a few short clips, ≤ ~2 GB total |
| Storage | **Cloudflare R2 + Pages Function at `/media/*`** (chosen over GCS-via-API and bake-into-Docker) |

## 2. Why R2 + a Pages Function (alternatives considered)

| Option | Verdict |
|---|---|
| **R2 bucket bound to the existing Pages project, served by a Pages Function at `/media/*`** | **Chosen.** Free at this volume (10 GB storage, zero egress), same browser origin as the site (CSP already permits it), zero Cloud Run involvement, media never in git. Upload via `wrangler`. |
| GCS bucket streamed by the .NET API at `/api/media/*` | Every byte flows Pages proxy → Cloud Run → GCS: double proxy, Cloud Run CPU/egress per image/video, cold-start latency on media. More backend code for no benefit at this scale. |
| Bake media into the Docker image at deploy time (pulled from a private source in CI) | Adding one photo requires a full release; media still routes through the `/api` proxy. Clunky. |

## 3. Data model

One new optional field next to the existing `Person.Portrait`:

- **Domain:** `Person.PortraitVideo { get; init; }` (`string?`) — a filename, e.g. `p-0001.mp4`.
- **DTOs:** `PortraitVideo` added to `PersonDto` and `PersonSummaryDto` (Mapster maps by name; no config change expected).
- **Seed data:** `family.json` entries gain `"portraitVideo": "<filename>"` where a clip exists. Filenames in the public repo are acceptable; bytes are not.
- **Frontend:** `portraitVideo?: string` on the `Person` type in `src/frontend/src/types/family.ts`.

The API never reads, stores, or serves media bytes — it only carries filenames, exactly as it does for `portrait` today.

## 4. Storage & edge delivery

### 4.1 R2 bucket

- Bucket: **`family-tree-media`**, bound to the existing Cloudflare Pages project as the **`MEDIA`** R2 binding (one-time owner setup, §8).
- Key layout mirrors URL paths: `portraits/p-0001.jpg`, `portraits/p-0001.mp4`. Future media kinds get sibling prefixes.
- **Immutable filename discipline:** if an image changes, it gets a new filename (`p-0001b.jpg`). This allows `Cache-Control: immutable`.

### 4.2 Pages Function `functions/media/[[path]].ts`

A sibling of the existing `functions/api/[[path]].ts`, in its style — a thin handler over **pure, unit-tested helpers** in `src/frontend/src/media/` (mirroring how the API proxy keeps `buildApiTargetUrl` in `src/api/apiProxy.ts`):

- **Methods:** `GET` and `HEAD` only → otherwise `405`.
- **Key resolution:** `/media/<key>` → R2 key `<key>`; reject empty/malformed keys (`400`); unknown key → `404`.
- **Range requests:** single-range `Range: bytes=…` support (R2 `get` accepts a range option); respond `206` with `Content-Range`. Safari refuses to play `<video>` from servers that ignore ranges, so this is required, not optional.
- **Headers:** `Content-Type` from R2 object metadata (set at upload), `ETag`, `Accept-Ranges: bytes`, `Cache-Control: public, max-age=31536000, immutable`.
- **Errors:** mirror the API proxy — log a clear line, return a plain 4xx/5xx rather than an opaque exception page. A missing `MEDIA` binding logs a misconfiguration error and returns `502`.

### 4.3 URL convention change: `/assets/portraits/…` → `/media/portraits/…`

The 2026-06-04 spec's `/assets/portraits/` convention was never exercised (no files exist) and is **broken in production by design**: the SPA's own Vite bundles own `/assets/*` on Pages, which is why the deploy spec deferred portrait proxying. This change moves the convention to `/media/portraits/…`:

- A shared **`mediaUrl(kind: 'portraits', filename)`** helper in `src/frontend/src/media/` replaces the inline path-building in `PersonMedallion.vue`.
- The `/assets` entry in the Vite dev proxy and the stale comments referencing backend-served portraits are removed; `wwwroot` portrait serving is no longer part of any plan.
- CSP needs **no change**: `/media/*` is same-origin, and `media-src` falls back to `default-src 'self'`.

## 5. UI behavior

### 5.1 Person detail popup (`PersonDetail.vue`)

The 84px portrait circle currently shows only initials. It becomes, in priority order:

1. **`portraitVideo` present** → `<video autoplay muted loop playsinline :poster="mediaUrl('portraits', person.portrait)">` with `src` = `mediaUrl('portraits', person.portraitVideo)`, clipped to the existing circle. No controls; it is a living portrait, not a player. `aria-hidden` stays appropriate since the adjacent name/initial conveys identity.
2. **Only `portrait`** → `<img>` in the same circle.
3. **Neither** → current initials fallback (unchanged).

**Failure falls down the chain:** `@error` on the `<video>` swaps to the `<img>` branch; `@error` on the `<img>` swaps to initials. Autoplay-blocked browsers still show the `poster` frame, which is the static portrait — acceptable degradation, no JS workaround needed.

### 5.2 Full-size lightbox (`MediaLightbox.vue`)

When the popup/docked-panel portrait actually shows media (cases 1–2 above, **not** the initials fallback), it becomes a clickable/keyboard-activatable button that opens a **screen-centered lightbox**:

- New presentational component `src/frontend/src/components/MediaLightbox.vue`, rendered by `PersonDetail.vue` via `<Teleport to="body">` so it centers on the *screen* even when the detail lives in the docked rail. Backdrop dims the page; container sits above the popup overlay (popup is `z-index: 60`; lightbox uses a higher token, e.g. `80`).
- **Content:** the living-portrait `<video autoplay muted loop playsinline>` (poster = still) when `portraitVideo` exists, else the `<img>`. Same error-fallback chain as §5.1 (video error → image; image error → close the lightbox).
- **"Reasonable size":** `max-width: min(90vw, 960px); max-height: 85vh`, never upscaled beyond the media's natural resolution (`width/height: auto` within those bounds).
- **Dismissal:** backdrop click, `Esc`, and a visible close button (reusing the popup's close-button styling). Focus moves to the close button on open and returns to the portrait trigger on close. `role="dialog"` + `aria-modal="true"` with a localized `aria-label`.
- **Trigger affordance:** the portrait circle gets `cursor: zoom-in`, a focus ring consistent with existing `:focus-visible` styles, and a localized accessible label (e.g. "View portrait of {name}"). With initials only, no button semantics and no lightbox.
- **i18n:** new ru/be/en strings for the trigger label and the close/dialog labels.

### 5.3 Tree medallions (`PersonMedallion.vue`)

**Unchanged visually.** The only edit is `portraitHref` building its URL via `mediaUrl()` (`/media/portraits/…`). Static portrait or initials, exactly as today.

## 6. Owner workflow & dev story

### 6.1 Local media folder (gitignored)

```
<repo root>/media/           ← .gitignore'd; owner's local source of truth
  portraits/p-0001.jpg
  portraits/p-0001.mp4
```

The folder structure mirrors R2 keys one-to-one.

### 6.2 Upload script

`scripts/upload-media.mjs` (committed; the *script* is public, the media is not):

- Walks `media/**`, uploads each file with `npx wrangler r2 object put family-tree-media/<key> --file <path> --content-type <mime>` (content-type inferred from extension).
- Idempotent re-runs are fine (immutable filenames make overwrites no-ops in practice).
- Requires the owner's Cloudflare credentials (`wrangler login` / `CLOUDFLARE_API_TOKEN`) — never stored in the repo.

### 6.3 Dev server

`vite.config.ts` `/media` handling, in order:

1. **Local `media/` folder exists** → served at `/media/*` (static middleware). Offline-friendly; the owner previews exactly what will be uploaded.
2. **Otherwise** → proxy `/media` to `https://family-tree-4fl.pages.dev` so the owner (or CI screenshots) see production media without local copies.
3. **Contributors with neither** → requests 404 and the UI falls back to initials — the seed-data experience today, still fully functional.

### 6.4 Encoding guidance (docs, not tooling)

Documented in the spec/README rather than scripted (YAGNI at a-few-clips volume): MP4 (H.264, no audio track), ≤720 px on the long edge, 2–6 seconds, loop-friendly cut; stills as JPEG/WebP ≤ ~200 KB.

## 7. Testing

- **Vitest (frontend):**
  - `mediaUrl()` helper.
  - Media-function helpers: range parsing (`bytes=0-`, `bytes=100-200`, malformed), key validation.
  - `PersonDetail` rendering matrix: video+poster when both fields present; img when only `portrait`; initials when neither; error-fallback chain video→img→initials.
  - `MediaLightbox` / trigger: opens on click and Enter when media exists; no trigger with initials only; shows video vs img correctly; closes on Esc, backdrop, and close button; focus returns to the trigger.
  - `PersonMedallion` href test updated to `/media/portraits/…`.
- **xUnit (backend):** `PortraitVideo` loads from JSON in the repository and maps through to DTOs (unit); graph endpoint carries the field end-to-end (integration).
- **Manual/preview verification:** popup plays a looping clip in dev with a sample file in `media/portraits/`.

## 8. One-time owner setup & deploy

- **No `deploy.yml` change** — Pages Functions deploy with the existing Pages build step automatically.
- One-time, documented in `docs/ci-cd/deploy.md` next to the `API_ORIGIN` setup:
  1. Create the `family-tree-media` R2 bucket (dashboard or `wrangler r2 bucket create`).
  2. Add the R2 binding **`MEDIA` → `family-tree-media`** to the Pages project (Settings → Functions → R2 bindings).
  3. Run `scripts/upload-media.mjs` once media exists.
- **Rollback story:** media delivery is additive; a bad function deploy affects `/media/*` only, and the UI degrades to initials/poster everywhere.

## 9. Out of scope (explicitly)

- Per-person galleries, shared albums, or any media beyond the portrait pair.
- Living portraits on tree medallions (revisit later; popup-only was an explicit owner decision).
- Access gating/auth for media (site is public; media follows).
- Admin/upload UI, server-side transcoding, multi-resolution variants, Cloudflare Images/Stream.
