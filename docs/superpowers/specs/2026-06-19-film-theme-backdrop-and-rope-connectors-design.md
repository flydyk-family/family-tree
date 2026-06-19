# Film theme: studio backdrop + rope connectors

- **Date:** 2026-06-19
- **Status:** Approved design (pending spec review)
- **Scope:** Frontend only (`src/frontend`). Film (`eighties`) theme only — Classic is untouched.

## Summary

Give the **Film** theme a proper canvas and connectors instead of the inherited
"oak" look. Two changes:

1. **Background** — replace the flat `#5C5C5C` canvas with a **brushed-metal
   backdrop**: a cool blue-grey brushed-steel photo with horizontal grain, a
   bright central sheen, and dark top/bottom edges, under a **20% black scrim**
   for card contrast. The image's built-in central highlight reads as a soft
   spotlight behind the tree; it's a single licensed stock photo (Vecteezy Free
   License — requires attribution), committed as an optimized SPA static asset.
2. **Connectors** — restyle the parent→child lines as **red string** strung
   between the photo cards (the "detective wall / photos on a corkboard" look):
   a thin twisted cord with a natural downward **sag**, a soft drop shadow, and a
   **metal push-pin** where each cord meets a card. Couple/union links become a
   thin **dashed red tie** in the same red.

The Classic theme keeps its warm bark branches and parchment exactly as-is.

## Goals / non-goals

**Goals**
- A brushed-metal backdrop for the Film theme that doesn't pan/zoom with the tree (it's the backdrop the subjects are shot against).
- Connectors that read as red string + pins, period-appropriate for the photo cards.
- Theme-gated: zero visual change to Classic; tokens/markup branch on `data-theme='eighties'`.
- Plays nicely with what already exists: the entrance-ceremony branch-draw, the morph fade (`branchOpacity`), reduced-motion, and the layout-switch glide.

**Non-goals**
- No change to the **layout engine** or link data (`LayoutLink` x1/y1/x2/y2 stay as-is).
- No per-epoch background morph / parallax (still deferred in the roadmap).
- No change to medallion cards themselves.
- No new dependencies.
- The temporary dev background picker (`src/dev/bgPicker.ts`, `public/dev-bg/`,
  the `dev-pair` launch config, the `main.ts` DEV guard) is an evaluation tool,
  **not** part of this feature — it is removed before the PR lands.

## Current state (what we're replacing)

- **Canvas:** `eighties.scss` sets `--canvas-bg: #5c5c5c` (flat); applied as
  `background: var(--canvas-bg)` on `.tree-view__oak` (a fixed, non-panning
  container). The panning SVG has no background of its own.
- **Descent links:** one `<path class="oak__branch">` per link in
  `OakTree.vue` (`.oak__branches` group). Geometry from `branchPath(link)` — an
  organic cubic Bézier S-curve (orientation-aware). Width from `branchWidth(link)`
  (thicker near the trunk). Stroke `var(--bark)` (Film override `#4a4f55`).
- **Union links:** one `<line class="oak__union">` per link; `var(--bark-dark)`
  (Film `#2c2f33`), `stroke-width: 1.2`, `stroke-dasharray: 2 3`.
- **Ceremony coupling:** each descent path carries `data-entrance-draw` and is
  animated by `motion/entrance.ts`, which **sets `strokeDasharray` +
  `strokeDashoffset`** on that element to draw it on. Unions carry
  `data-entrance-fade`. The whole `.oak__branches` / `.oak__unions` groups also
  take `branchOpacity` (morph fade).

## Design

### 1. Brushed-metal backdrop

A single background image with a darkening scrim on the **fixed**
`.tree-view__oak` container (stays put while the tree pans — like the backdrop a
subject is shot against):

- **Image:** the chosen brushed-steel photo — cool blue-grey, horizontal brushed
  grain, a bright sheen down the centre, dark top/bottom edges. Source file:
  `alluring-charm-of-metallic-texture-free-photo.jpg` (Vecteezy Free License).
  Its built-in central highlight serves as the "spotlight" behind the tree, so no
  separate gradient or grain layer is needed.
- **Scrim:** a flat **20% black** overlay (`rgba(0,0,0,0.20)`) for medallion
  contrast — the value chosen against the live tree.
- **Sizing:** `background-size: cover; background-position: center`, fixed
  container (does not pan/zoom with the tree).

**Asset & hosting:** commit an **optimized** copy as an SPA static asset
(resize to a sensible max width and export **WebP/AVIF** with a JPEG fallback;
the raw 1.1 MB JPEG is not shipped as-is). Place it under the frontend's static
assets (`src/frontend/public/…`, e.g. `public/textures/film-backdrop.webp`) or
import it via `src/assets` for content-hashing — the plan picks one. The
production asset is **separate** from the gitignored `public/dev-bg/` eval files.

**Attribution (required by the licence):** add the credit
`Texture Stock photos by Vecteezy — https://www.vecteezy.com/free-photos/texture`
to a repo attributions file (e.g. `THIRD-PARTY-NOTICES.md` or
`src/frontend/public/credits.txt`) **and** a user-visible credit (a small line in
the app's About/Chronicle/footer area). The plan settles the exact placement; the
requirement is that the attribution ships with the app.

**Implementation:** set Film's `--canvas-bg` to the layered value
`linear-gradient(rgba(0,0,0,0.2), rgba(0,0,0,0.2)), url(<asset>) center/cover
no-repeat` (replacing the flat `#5c5c5c`). `.tree-view__oak` already does
`background: var(--canvas-bg)`, so no markup change is required — the scrim is the
gradient layer over the image. Classic's `--canvas-bg` is unchanged. Also update
the Film `body` background (currently hard-coded `#5c5c5c` in `eighties.scss`) so
the area behind/around the canvas stays coherent (a dark neutral; the backdrop
itself lives on the oak container).

### 2. Red-string descent connectors

A new **rope** treatment used only when `theme === 'eighties'`; Classic keeps the
single bark path. Per descent link, render a small stack of layers sharing one
sagging path `d`:

- **Path geometry — `ropePath(link)`:** a quadratic with the control point at the
  midpoint pushed **toward the bottom of the screen** by a sag amount, so the cord
  hangs under gravity regardless of orientation:
  `M x1 y1 Q midX (max(y1,y2) + sag) x2 y2`, with `sag ≈ 22` (tunable; may scale
  mildly with span). This replaces the organic S-curve for Film only. In
  horizontal orientation the cord still sags downward (a rope strung between two
  pins) — intended.
- **Layers (bottom → top):**
  1. `rope__shadow` — same `d`, `stroke #000` ~0.3 alpha, width `1.5 + 1.2`,
     offset `translate(0.4, 1.6)`. Soft drop shadow onto the backdrop.
  2. `rope__core` — `stroke var(--rope)` (`#b5302a`), **`stroke-width: 1.5`**,
     `stroke-linecap: round`. **This layer carries `data-entrance-draw`** and the
     `data-link-id` / `data-test="branch"` hooks (so the ceremony and existing
     tests keep working).
  3. `rope__twist-hi` — same `d`, `stroke var(--rope-twist-hi)` (`#e25c52`),
     width 1.5, `stroke-dasharray: 1.3 3.2`, ~0.7 opacity.
  4. `rope__twist-lo` — same `d`, `stroke var(--rope-twist-lo)` (`#7d1f1b`),
     width 1.5, `stroke-dasharray: 1.3 3.2`, `stroke-dashoffset: 2.2`, ~0.5 opacity.
  The two offset dashed layers fake the fibre twist of a twisted cord.

  **Critical:** the twist dashes must live on layers 3–4 only. The ceremony's
  branch-draw overwrites `stroke-dasharray`/`-dashoffset` on the
  `data-entrance-draw` element, so that attribute stays on the **solid** core
  (layer 2). Layers 3–4 get `data-entrance-fade` (fade in with their generation)
  so the twist appears without fighting the draw-on. After the draw completes the
  core is solid (`dashoffset 0`), and the twist overlays sit on top — correct.

- **Width:** Film uses a **flat 1.5** for all descent ropes (the approved weight),
  not the generation-tapered `branchWidth`. (Tapering a "string" looks wrong.)

### 3. Pins

A **metal push-pin** at each point where a cord meets a card — drawn as a tiny
group: a shadow dot, a `var(--pin)` (`#c9c4b8`) head circle (r≈3.2), and a small
white specular highlight.

- **One pin per medallion connection point, not per rope.** A parent with three
  children must show **one** pin at its bottom attach-point, not three stacked.
  Derive pin positions from the layout (dedupe by person + side), e.g. a parent's
  bottom-centre and each child's top-centre. The plan decides the exact attach
  geometry; the requirement is: no visible pin stacking, pins sit on top of the
  ropes and at the card edge.
- Pins render in their own group above `.oak__branches`, gated to Film.

### 4. Union ties

Keep the `<line class="oak__union">` element and its `data-entrance-fade` hook.
Film theme overrides its look to a **thin dashed red tie**: `stroke var(--rope)`
(`#b5302a`), `stroke-width ≈ 1.1`, `stroke-dasharray: 3 3`, ~0.85 opacity. This is
a pure CSS override scoped to `:root[data-theme='eighties'] .oak__union` — no
markup change. (User confirmed the couple connection is good as shown.)

### 5. Tokens (in `eighties.scss`)

New Film-scoped tokens, so nothing leaks into Classic or reuses load-bearing
tokens (e.g. `--bark-dark` is also used by FilmFrame's sprocket holes — do **not**
repurpose it):

```
--rope:          #b5302a;   // red string core + union tie
--rope-twist-hi: #e25c52;   // twist highlight
--rope-twist-lo: #7d1f1b;   // twist shadow
--pin:           #c9c4b8;   // push-pin head
```

`--canvas-bg` (Film) → the brushed-metal image under a 20% black scrim (see
Background above).

## Theming & gating

- Whether to draw ropes vs a bark path branches on the active theme. Source of
  truth is `uiStore.theme`; `OakTree.vue` reads it (prop or store) and switches
  the descent markup. Keep the switch shallow — a `v-if`/`v-else` in the
  `.oak__branches` group, with the rope stack ideally factored into a small
  presentational component (e.g. `RopeLink.vue`) to keep `OakTree.vue` readable.
- Background and union restyle are pure CSS under `:root[data-theme='eighties']`.
- Classic renders exactly as today (same path, same `--bark`, flat-to-warm canvas).

## Interactions with existing motion

- **Entrance ceremony:** draw-on stays on the solid core (`data-entrance-draw`);
  twist + pins fade in (`data-entrance-fade` or a generation-bucketed fade).
  Pins should not appear before their cord is drawn — bucket them to the child's
  generation like the link.
- **Morph fade (`branchOpacity`):** applies to the whole `.oak__branches` /
  `.oak__unions` groups; the rope sub-layers and pins inherit it (put pins in a
  group that also takes `branchOpacity`, or inside `.oak__branches`).
- **Reduced motion:** ropes/pins render in their final state (no draw, no fade),
  same as branches do today.
- **Layout-switch glide:** `ropePath` is a pure function of the link endpoints,
  so it re-computes on orientation change just like `branchPath`.

## Accessibility & performance

- Connectors and backdrop are decorative; keep them `aria-hidden`-equivalent (no
  semantic change — they already carry no a11y role).
- Contrast: the red string (#b5302a) and pins over the metal backdrop + 20% scrim
  keep the medallion text/portraits as the focal point; verify the ropes don't
  reduce card legibility (the brushed steel's bright centre is the main risk — the
  scrim addresses it).
- Perf: descent links go from 1 to ~4 `<path>`s each plus a pin. For the seed
  tree this is negligible; note it as a watch-item for very large trees. The
  backdrop is a single optimized image (no per-frame cost); ship WebP/AVIF so the
  initial paint isn't gated on a 1 MB JPEG.

## Testing

- **Unit (Vitest):**
  - `ropePath` produces a quadratic with a downward-sagged control point for both
    orientations (control `y` > both endpoint `y`s).
  - In Film theme, each descent link renders the rope stack and the core still
    exposes `data-test="branch"`, `data-link-id`, and `data-entrance-draw`
    = child generation (existing `OakTree.spec.ts` assertions keep passing).
  - In Classic theme, descent still renders the single `.oak__branch` (no ropes).
  - Pins: count equals distinct connection points (no stacking for multi-child
    parents).
  - Union override: Film `.oak__union` uses the red tie (assert class/markup
    hook; colour is CSS).
- **Manual/preview:** Film theme shows the metal backdrop + red ropes + pins;
  toggle to Classic shows unchanged bark/parchment; run the "Grow the tree"
  ceremony and confirm ropes draw then show twist, pins appear after their cord;
  switch orientation; check reduced-motion. Confirm the production build does
  **not** include the dev picker or `public/dev-bg/`.

## Documentation impact

Same-PR doc updates (per project workflow):
- `docs/reference/features/oak-tree.md` — describe the Film backdrop and rope/pin
  connectors (vs Classic bark branches).
- Root `README.md` / `CLAUDE.md` overview — the one-line Film theme description
  currently says "muted studio-grey canvas"; update to the brushed-metal backdrop
  and red-string connectors.
- `docs/reference/roadmap.md` — move "rope connectors / metal backdrop" into
  Implemented (the per-epoch morph & parallax remain deferred).
- **Attribution:** add the Vecteezy credit to the repo attributions file and a
  user-visible spot (per the Background section).

## Cleanup (before the PR lands)

The evaluation scaffold is removed in the same branch once the backdrop is final:
- delete `src/frontend/src/dev/bgPicker.ts` and the `import.meta.env.DEV` guard in
  `main.ts`;
- delete `src/frontend/public/dev-bg/` and its `.gitignore` entry;
- remove the `dev-pair` entry from `.claude/launch.json`.
Only the single optimized production backdrop asset + its attribution remain.

## Open questions

None blocking. Tunables to settle during implementation against the live app:
exact `sag`, pin radius, and final backdrop export size/format — all visual or
mechanical, dial in via preview. The 20% scrim and the metal texture are locked.
