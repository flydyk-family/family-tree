# Film Backdrop & Legibility Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give the Film (`eighties`) theme a brushed-metal photo backdrop (tree + Chronicle), restore the time-rail sprocket holes that broke when the canvas became an image, and make names and search matches legible over the bright metal.

**Architecture:** Pure frontend. The backdrop is a single CSS background image on the existing fixed oak/Chronicle containers (it does not pan). Legibility is per-element and filter-free: a translucent edge-fade band behind each name (shared SVG gradient) and a white frame `<rect>` around matched cards. The time-rail perforation colour moves off `--canvas-bg` (now an image) onto its own token.

**Tech Stack:** Vue 3 + TypeScript, SCSS design tokens, Vitest + @vue/test-utils, Vite.

## Global Constraints

- Changes are scoped to the Film theme — selector prefix `:root[data-theme='eighties']` or theme-gated markup. **Classic theme renders exactly as today.** Copy verbatim: never repurpose `--bark-dark` (FilmFrame sprocket-hole fill depends on it).
- C# / backend untouched. No new npm dependencies.
- The brushed-metal image is `alluring-charm-of-metallic-texture-free-photo-darker-upscaled.jpg` (the `-2` variant), **Vecteezy Free License — attribution required**: `Texture Stock photos by Vecteezy — https://www.vecteezy.com/free-photos/texture`.
- Media bytes are normally not committed (R2 policy), but this theme texture is a small optimized UI asset committed under `src/frontend/public/` — it is **not** family media and **separate** from the gitignored `public/dev-bg/` eval files.
- Frontend test command: `npm --prefix src/frontend test`. Build/type-check: `npm --prefix src/frontend run build`.
- Some pieces are **already implemented on this branch** (name edge-fade band, white match frame, the search-glow revert). Those tasks add the missing test coverage and finalize — do not rebuild.
- Run the app with `node scripts/dev.mjs --instance 7` (frontend `:5180`, API `:5044`) to avoid colliding with other worktrees on the default ports.

---

### Task 1: Production backdrop asset + Film canvas wiring

Replace the flat `#5c5c5c` Film canvas with the brushed-metal image (no darkening), left-aligned on mobile. The image's own central sheen is the "spotlight"; legibility is handled per-element in later tasks.

**Files:**
- Create: `src/frontend/public/textures/film-backdrop.jpg` (optimized copy of the `-2` source)
- Modify: `src/frontend/src/styles/themes/eighties.scss:48` (`--canvas-bg`), `:65-67` (Film `body`)
- Verify against: `src/frontend/src/views/TreeView.vue:254` (`.tree-view__oak { background: var(--canvas-bg) }` — no change, just confirm it consumes the token)

**Interfaces:**
- Produces: Film `--canvas-bg` = the metal image; consumed by `.tree-view__oak` (Task 1) and the Chronicle surface (Task 2).

- [ ] **Step 1: Generate the optimized asset**

The source lives outside the repo at `C:\Users\perov\OneDrive\Фотографии\family\film-frame-strip-theme\textures\alluring-charm-of-metallic-texture-free-photo-darker-upscaled.jpg`. Produce a ~1600px-wide JPEG at quality 82 (≈300 KB; the multi-MB raw is not shipped). Run in PowerShell:

```powershell
Add-Type -AssemblyName System.Drawing
$src = "C:\Users\perov\OneDrive\Фотографии\family\film-frame-strip-theme\textures\alluring-charm-of-metallic-texture-free-photo-darker-upscaled.jpg"
$dstDir = "src\frontend\public\textures"; New-Item -ItemType Directory -Force $dstDir | Out-Null
$dst = Join-Path $dstDir "film-backdrop.jpg"
$img = [System.Drawing.Image]::FromFile($src)
$maxW = 1600; $scale = [Math]::Min(1.0, $maxW / $img.Width)
$w = [int]($img.Width*$scale); $h = [int]($img.Height*$scale)
$bmp = New-Object System.Drawing.Bitmap $w,$h
$g = [System.Drawing.Graphics]::FromImage($bmp); $g.InterpolationMode = 'HighQualityBicubic'; $g.DrawImage($img,0,0,$w,$h)
$enc = [System.Drawing.Imaging.ImageCodecInfo]::GetImageEncoders() | Where-Object { $_.MimeType -eq 'image/jpeg' }
$p = New-Object System.Drawing.Imaging.EncoderParameters 1
$p.Param[0] = New-Object System.Drawing.Imaging.EncoderParameter ([System.Drawing.Imaging.Encoder]::Quality, [long]82)
$bmp.Save($dst,$enc,$p); $g.Dispose(); $bmp.Dispose(); $img.Dispose()
"$dst $w x $h"
```

Expected: prints `…film-backdrop.jpg 1600 x 1244`. (WebP/AVIF is an optional later optimization; an optimized JPEG ships fine.)

- [ ] **Step 2: Point Film `--canvas-bg` at the asset**

In `src/frontend/src/styles/themes/eighties.scss`, change line 48 from `--canvas-bg: #5c5c5c;` to:

```scss
  // Brushed-metal backdrop (Vecteezy free-licence texture). Used as-is — no scrim
  // or centre mask; per-element backings (name band, match frame) carry legibility.
  --canvas-bg: url('/textures/film-backdrop.jpg') center / cover no-repeat;
```

- [ ] **Step 3: Keep `body` a coherent dark neutral + left-align on mobile**

In the same file, the Film `body` rule (lines 65–67) is currently `background: #5c5c5c;`. Change it to a dark neutral (the area around the rounded oak panel) and add the mobile left-alignment override for the canvas:

```scss
:root[data-theme='eighties'] body {
  background: #1b1c1f;
}

// Mobile: left-align the texture so the dark left edge of the plate sits behind
// the tree on a tight crop (the only per-resolution change).
@media (max-width: 640px) {
  :root[data-theme='eighties'] {
    --canvas-bg: url('/textures/film-backdrop.jpg') left / cover no-repeat;
  }
}
```

- [ ] **Step 4: Verify in the preview (CSS-only — no unit test)**

Run `node scripts/dev.mjs --instance 7`, open `http://localhost:5180/`, enter the tree. Confirm: the canvas shows the brushed metal (not flat grey); panning/zooming the tree does **not** move the backdrop; resizing to ≤640px wide left-aligns the texture. Toggle to Classic (theme toggle) → warm parchment canvas unchanged.

- [ ] **Step 5: Commit**

```bash
git add src/frontend/public/textures/film-backdrop.jpg src/frontend/src/styles/themes/eighties.scss
git commit -m "Film theme: brushed-metal canvas backdrop (mobile left-aligned)"
```

---

### Task 2: Chronicle page backdrop

The `/chronicle` landing currently rides the flat Film `body`. Give it the same metal backdrop so entering the app and the tree share one surface; the parchment "page" card sits on top.

**Files:**
- Modify: `src/frontend/src/views/ChronicleView.vue` (the `.chronicle` scoped style, ~line 71)

**Interfaces:**
- Consumes: `--canvas-bg` (Task 1).

- [ ] **Step 1: Add the backdrop to the Chronicle container**

In `ChronicleView.vue`'s `<style scoped>`, the `.chronicle` rule sets layout only. Add a theme-gated background. Append after the `.chronicle { … }` block:

```scss
:root[data-theme='eighties'] .chronicle {
  background: var(--canvas-bg);
}
```

(Scoped styles still allow a `:root[data-theme=…]` ancestor selector combined with the scoped class — Vue rewrites the `.chronicle` part with the data-attribute, the `:root` prefix is preserved.)

- [ ] **Step 2: Verify in preview**

Reload `http://localhost:5180/chronicle` in Film theme: metal backdrop behind the parchment page card; the dark-graphite `--surface-card` page and gilt border still read clearly. Toggle to Classic → unchanged warm body.

- [ ] **Step 3: Commit**

```bash
git add src/frontend/src/views/ChronicleView.vue
git commit -m "Film theme: metal backdrop on the Chronicle page"
```

---

### Task 3: Time-rail sprocket-hole colour (`--rail-perf`)

`TimeRail.vue` paints the film perforation dots with `radial-gradient(…, var(--canvas-bg) …)` — a *colour* stop. Now that `--canvas-bg` is an image, the stop is invalid and the holes vanish. Give the perforations their own solid colour token.

**Files:**
- Modify: `src/frontend/src/styles/themes/eighties.scss` (add `--rail-perf` token), `src/frontend/src/components/TimeRail.vue:156` and `:163` (the two perf gradients)
- Test: `src/frontend/src/components/TimeRail.spec.ts`

**Interfaces:**
- Produces: `--rail-perf` token (Film), consumed by `.time-rail__perf` backgrounds.

- [ ] **Step 1: Write the failing test**

Add to `TimeRail.spec.ts` (follow the file's existing mount pattern; pass `theme: 'eighties'`):

```ts
it('paints film perforations with --rail-perf, not the (now image) --canvas-bg', () => {
  const w = mount(TimeRail, { props: { scale, viewport, orientation: 'vertical', theme: 'eighties' } });
  const perf = w.find('[data-test="film-strip"]');
  // the scoped-style class is the contract; the gradient colour is asserted via CSS,
  // but the component must NOT reference --canvas-bg in its perforation background.
  expect(perf.exists()).toBe(true);
  // guard against regression: the source must use the dedicated token
  // (string check on the component's compiled style is brittle, so assert the
  //  token is declared and the gradient wiring is present)
});
```

Replace the placeholder assertion with a concrete one: import the raw component source and assert it references `--rail-perf` and not `--canvas-bg` in the perf gradients:

```ts
import TimeRailSrc from './TimeRail.vue?raw';
it('time-rail perforations reference --rail-perf, never --canvas-bg', () => {
  const perfBlock = TimeRailSrc.slice(TimeRailSrc.indexOf('.time-rail__perf'));
  expect(perfBlock).toContain('var(--rail-perf)');
  expect(perfBlock).not.toContain('var(--canvas-bg)');
});
```

- [ ] **Step 2: Run it to confirm it fails**

Run: `npm --prefix src/frontend test -- TimeRail`
Expected: FAIL — the source still contains `var(--canvas-bg)` in the perf block.

- [ ] **Step 3: Add the token and repoint the gradients**

In `eighties.scss`, add to the `:root[data-theme='eighties']` token block (near `--canvas-bg`):

```scss
  --rail-perf: #6a6a6a; // film time-rail sprocket-hole dot (was var(--canvas-bg))
```

In `TimeRail.vue`, replace `var(--canvas-bg)` with `var(--rail-perf)` on **both** perforation gradients:

- line ~156: `background-image: radial-gradient(circle at 7.5px 50%, var(--rail-perf) 3.4px, transparent 3.6px);`
- line ~163: `background-image: radial-gradient(circle at 50% 7.5px, var(--rail-perf) 3.4px, transparent 3.6px);`

- [ ] **Step 4: Run the test**

Run: `npm --prefix src/frontend test -- TimeRail`
Expected: PASS.

- [ ] **Step 5: Verify in preview**

Film theme tree: the time rail (left edge vertical / bottom horizontal) shows visible round sprocket holes again.

- [ ] **Step 6: Commit**

```bash
git add src/frontend/src/styles/themes/eighties.scss src/frontend/src/components/TimeRail.vue src/frontend/src/components/TimeRail.spec.ts
git commit -m "Film theme: time-rail perforation colour token (fix holes vs image canvas)"
```

---

### Task 4: Name backing band — test coverage (already implemented)

The edge-fade name band is built: a shared `#e80-name-fade` gradient in `EightiesDefs.vue` and a `<rect class="e80-name-bg" fill="url(#e80-name-fade)">` before each name in all four card variants. This task locks it with tests.

**Files:**
- Verify (no change): `src/frontend/src/components/medallion/eighties/EightiesDefs.vue`, `FilmFrame.vue`, `CabinetCard.vue`, `GelatinPrint.vue`, `EdgePrintFrame.vue`
- Test: `src/frontend/src/components/medallion/eighties/FilmFrame.spec.ts`

**Interfaces:**
- Consumes: nothing new.

- [ ] **Step 1: Write the test**

Add to `FilmFrame.spec.ts`:

```ts
it('renders an edge-fade backing band behind the name', () => {
  const w = mount(FilmFrame, { props: { node: node() } });
  const band = w.find('rect.e80-name-bg');
  expect(band.exists()).toBe(true);
  expect(band.attributes('fill')).toBe('url(#e80-name-fade)');
});
```

- [ ] **Step 2: Run it**

Run: `npm --prefix src/frontend test -- FilmFrame`
Expected: PASS (component already renders it).

- [ ] **Step 3: Commit**

```bash
git add src/frontend/src/components/medallion/eighties/FilmFrame.spec.ts
git commit -m "test: name edge-fade backing band on Film cards"
```

---

### Task 5: Search-match white frame — test coverage + fix stale test (already implemented)

Matched cards render a filter-free white frame (`<rect class="e80-match-frame" data-test="match-frame">`) enclosing name → years, and the old `.e80-card__art` glow filter is removed. Add a test and fix the now-stale "halo is the cue" assertion.

**Files:**
- Verify (no change): the four card variants, `eighties.scss` (`.e80-match-frame` rule)
- Test/fix: `src/frontend/src/components/medallion/eighties/FilmFrame.spec.ts`

- [ ] **Step 1: Write the match-frame test**

Add to `FilmFrame.spec.ts`:

```ts
it('draws a white match frame only when matched', () => {
  expect(mount(FilmFrame, { props: { node: node() } }).find('[data-test="match-frame"]').exists()).toBe(false);
  const m = mount(FilmFrame, { props: { node: node(), match: true } });
  const frame = m.find('[data-test="match-frame"]');
  expect(frame.exists()).toBe(true);
  expect(frame.attributes('fill')).toBeUndefined(); // fill:none via CSS class
  expect(frame.classes()).toContain('e80-match-frame');
});
```

- [ ] **Step 2: Fix the stale comment in the existing test**

In `FilmFrame.spec.ts`, the test titled `'keeps the holes transparent regardless of search match (the halo is the cue)'` references a halo that no longer exists. Rename it to `'keeps the holes transparent regardless of search match (the white frame is the cue)'` — assertions unchanged.

- [ ] **Step 3: Run it**

Run: `npm --prefix src/frontend test -- FilmFrame`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/frontend/src/components/medallion/eighties/FilmFrame.spec.ts
git commit -m "test: white search-match frame on Film cards"
```

---

### Task 6: Vecteezy attribution

The free licence requires a visible credit. Add a repo notices file and one user-visible credit line.

**Files:**
- Create: `THIRD-PARTY-NOTICES.md` (repo root)
- Modify: `src/frontend/src/views/ChronicleView.vue` (a small footer credit), and its i18n strings if the Chronicle uses `t(...)` for visible copy

**Interfaces:**
- Consumes: nothing.

- [ ] **Step 1: Create the notices file**

`THIRD-PARTY-NOTICES.md`:

```markdown
# Third-party notices

## Film theme — backdrop texture
Brushed-metal backdrop (`src/frontend/public/textures/film-backdrop.jpg`):
**Texture Stock photos by Vecteezy** — https://www.vecteezy.com/free-photos/texture
(Vecteezy Free License; attribution required.)
```

- [ ] **Step 2: Add a user-visible credit on the Chronicle page**

In `ChronicleView.vue`, inside the `.chronicle__page` article after the enter-tree button, add a small credit (Film-theme only is fine, but a always-present tiny line is simplest):

```vue
<p class="chronicle__credit">
  Backdrop texture by
  <a href="https://www.vecteezy.com/free-photos/texture" target="_blank" rel="noopener">Vecteezy</a>
</p>
```

And a scoped style:

```scss
.chronicle__credit {
  margin-top: 18px; font-size: 11px; text-align: center; color: var(--ink-soft);
  a { color: inherit; }
}
```

- [ ] **Step 3: Verify in preview**

Chronicle page shows the small "Backdrop texture by Vecteezy" credit linking to vecteezy.com.

- [ ] **Step 4: Commit**

```bash
git add THIRD-PARTY-NOTICES.md src/frontend/src/views/ChronicleView.vue
git commit -m "docs: Vecteezy attribution for the Film backdrop texture"
```

---

### Task 7: Reference-doc updates

Bring the connected docs in sync with the observable Film changes (the project requires docs to land in the same PR).

**Files:**
- Modify: `docs/reference/features/oak-tree.md`, root `README.md` and `CLAUDE.md` (Film one-liner), `docs/reference/roadmap.md`

- [ ] **Step 1: Update the feature reference**

In `docs/reference/features/oak-tree.md`, document (under the Film theme): the brushed-metal backdrop (fixed, mobile left-aligned), the edge-fade name backing band, the white search-match frame (replacing the glow), the time-rail perforation colour, and that the Chronicle shares the backdrop.

- [ ] **Step 2: Update the product one-liner**

In `README.md` and `CLAUDE.md`, the Film theme description says "muted studio-grey canvas". Change to reflect the brushed-metal backdrop (leave the rope connectors out until Plan B lands, or add when both ship).

- [ ] **Step 3: Update the roadmap**

In `docs/reference/roadmap.md`, note the Film metal backdrop + legibility as implemented; the per-epoch background morph & parallax remain deferred.

- [ ] **Step 4: Commit**

```bash
git add docs/reference/features/oak-tree.md README.md CLAUDE.md docs/reference/roadmap.md
git commit -m "docs: Film metal backdrop, name backing, match frame, rail perforation"
```

---

### Task 8: Remove the temporary dev background picker

The eval scaffold must not ship. Remove it once the backdrop is final.

**Files:**
- Delete: `src/frontend/src/dev/bgPicker.ts`, `src/frontend/public/dev-bg/` (whole dir)
- Modify: `src/frontend/src/main.ts` (drop the `import.meta.env.DEV` guard block), `src/frontend/.gitignore` (drop the `public/dev-bg/` line), `.claude/launch.json` (drop the `dev-pair` entry)

- [ ] **Step 1: Delete the picker module and assets**

```bash
git rm -r src/frontend/src/dev
rm -rf src/frontend/public/dev-bg
```

- [ ] **Step 2: Remove the main.ts guard**

In `src/frontend/src/main.ts`, delete the block:

```ts
if (import.meta.env.DEV) {
  void import('./dev/bgPicker').then(m => m.initDevBgPicker());
}
```

(and its `// TEMPORARY:` comment above it).

- [ ] **Step 3: Clean the gitignore and launch config**

Remove the `public/dev-bg/` line (and its comment) from `src/frontend/.gitignore`. Remove the `dev-pair` configuration object from `.claude/launch.json`.

- [ ] **Step 4: Verify the build is clean**

Run: `npm --prefix src/frontend run build`
Expected: type-check + build succeed with no reference to `bgPicker` or `dev-bg`.

- [ ] **Step 5: Verify the app still runs**

Run `node scripts/dev.mjs --instance 7`; the tree renders with the metal backdrop and **no** `BG` picker panel.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "chore: remove temporary dev background picker scaffold"
```

---

## Self-Review notes

- **Spec coverage:** backdrop wiring (T1), Chronicle (T2), rail perforation fix (T3), name backing (T4), match frame (T5), attribution (T6), docs (T7), scaffold cleanup (T8). Connectors/pins/union/rope-tokens are intentionally in **Plan B**.
- **Already-built pieces** (name band, match frame, glow revert) are covered by test-only tasks (T4, T5) — implementers must not rebuild them.
- **CSS-only tasks** (T1, T2) verify in preview rather than unit tests — colour/background values aren't meaningfully unit-testable; the testable invariants (token usage, conditional markup) are covered where they exist (T3, T5).
