# Film-Theme Motion — Design Spec

**Date:** 2026-06-18
**Status:** Draft for review
**Author:** brainstormed with the owner (visual companion)

## 1. Summary

Two motion features for the existing **’80s Film theme** (shipped in PR #88): an
**epoch-aware medallion hover** and a **film-strip year rail** that behaves like
celluloid running through a gate as you pan and zoom. Both are **eighties-theme
only** — the Classic theme is untouched — and both respect
`prefers-reduced-motion`.

This is an aesthetic/frontend-only change. No API, data-model, or `family.json`
change.

### Origin

These are two of the motion items deferred from the Film-theme PR. Of that list,
the owner selected exactly these two for this round:

- **In scope:** (1) medallion hover, (3) film-strip year-rail animation on zoom.
- **Dropped:** (2) a distinct *selected*-state animation — not needed; the current
  static glow + bright edge stays.
- **Still deferred:** (4) the film-countdown entrance ceremony.

## 2. Goals & non-goals

**Goals**
- A hover treatment on every ’80s medallion, differentiated **by epoch**.
- The ’80s year rail re-imagined as a **perforated film strip** that scrolls with
  the timeline and refines/coarsens as you zoom — with a **responsive** detail tier
  for narrow/mobile viewports.
- Full `prefers-reduced-motion` coverage.

**Non-goals (this version)**
- No new *selected*-state motion (dropped — see §1).
- No entrance-ceremony work (item 4 stays deferred).
- No Classic-theme change. No layout-engine change (the rail and hover are presentational).
- No backend / schema / media change.

## 3. Locked decisions (from brainstorming)

| Topic | Decision |
| --- | --- |
| Scope | Items 1 + 3 only, one spec → ~2 PRs (hover; rail). Item 2 dropped, item 4 deferred. |
| Hover — all cards | **Lift**: rise + ~1.05 scale + deeper shadow. |
| Hover — pre-1945 prints (cabinet, gelatin) | Lift **+ seeded tilt** ~3°, direction & exact angle from a per-person PRNG (stable, mirrors `abrasion.ts`). |
| Hover — film frame (1945–1989) | Lift **+ frame advance** (portrait steps one frame; sprocket holes roll). |
| Hover — edge-print (1990+) | **Lift only** (no advance — it has no sprocket holes). |
| Hover transform target | The card's **inner** group (origin-centred geometry → pivot is the card centre). The positioned node `<g>` is never touched. |
| Rail behaviour | **Scrolling strip (“A”)**: sprocket pitch + frame divisions **scale with zoom**; strip **scrolls with pan**; in-between year labels **fade in/out** as the tick step refines/coarsens. |
| Rail detail (comfortable) | Warm near-black celluloid (gradient, not flat `#0d0e10`), faint **frame-line dividers**, a **keykode barcode** lane + vertical **stock name** on the **left**, year labels **right-aligned**, small **frame numbers**, warm **emulsion sheen**. |
| Rail detail (slim / mobile) | Thin sprockets + a barcode hint + right-aligned years; **drop** stock text & frame numbers. Switches at the existing **≤640px** breakpoint. |
| Reduced motion | Hover lift/tilt/advance and rail tick-fades disabled; the rail's scroll-with-pan remains (direct manipulation, not autonomous animation). |

## 4. Feature 1 — epoch-aware medallion hover

### 4.1 Where the motion lives

Each medallion node is positioned by `transform="translate(x,y)"` on the **outer**
node `<g>` in `OakTree.vue`; the card content (`FilmFrame` / `CabinetCard` /
`GelatinPrint` / `EdgePrintFrame`) is an **origin-centred inner group**. Hover
transforms (scale / translate / rotate) are applied to that **inner** group, so:

- They compose with the layout translate instead of fighting it.
- The transform pivot is the card centre (the inner group's origin is `(0,0)`),
  so scale and tilt look correct without per-card origin math.
- The entrance ceremony (which drives node opacity, and is warned not to be fought
  by hover tweens) is unaffected — it does not animate the inner card transform.

`transform-box` / `transform-origin` behaviour on SVG groups must be **validated
live early** (see §7 Risks); origin-centred geometry should make
`transform-origin: 0 0` (local) the visual centre.

### 4.2 Per-epoch behaviour

All four card components gain a hover treatment, driven by CSS `:hover` on the
card group, all gated by `@media (prefers-reduced-motion: reduce)`:

- **Lift (shared):** translate up a few px + `scale(~1.05)` + a deeper drop shadow.
  The cards already render a static drop shadow; the hover state deepens/enlarges it.
- **Cabinet (`<1900`) & Gelatin (`1900–1944`):** lift **+ a small clockwise/counter-
  clockwise tilt** (~3°). Direction and exact angle are **seeded per person id** so a
  card always tilts the same way — the nudge of a physical print on a table.
- **Film frame (`1945–1989`):** lift **+ frame advance** — the portrait steps down
  one frame and the sprocket holes roll, like film pulled through the gate. The
  existing grain-flicker stays as an ambient touch.
- **Edge-print (`1990+`):** **lift only**.

### 4.3 Seeded tilt module

New `src/frontend/src/components/medallion/eighties/hoverTilt.ts`, mirroring
`abrasion.ts`: `hoverTilt(personId: string): { angleDeg: number }` using the same
tiny seeded PRNG, returning a stable angle in a small range (≈ ±2–4°), sign
varying per id. Consumed by `CabinetCard.vue` and `GelatinPrint.vue` to set the
rotation applied on `:hover`. Pure, deterministic, unit-tested.

## 5. Feature 2 — film-strip year rail

`TimeRail.vue` only; eighties theme only. The Classic rail (plain ticks) is
unchanged — the film-strip styling is scoped under the theme (token block +
a theme-gated class), so Classic never sees it.

### 5.1 Visual — comfortable tier (desktop, vertical 88px)

The rail becomes a celluloid strip:

- **Base:** a warm near-black vertical gradient (≈ `#1d160f → #100c08 → #171109`),
  not flat black. New eighties-theme tokens carry these colours.
- **Sprockets:** two perforation columns on the long edges, drawn as a CSS
  background (radial-gradient holes) so there is **no per-tick DOM** — the holes
  show the `#5C5C5C` canvas colour through the celluloid.
- **Frame lines:** faint repeating dividers between “frames”.
- **Left lane:** a **keykode barcode** strip + a vertical **stock name**
  (e.g. `KODAK 5247 · SAFETY`).
- **Years:** **right-aligned**, with small **frame numbers** beside them.
- **Emulsion:** a subtle warm radial sheen overlay.

Tier and ornament are CSS/token-driven; the underlying tick data and positions are
the existing `viewportTicks` / `horizontalTicks` output — unchanged.

### 5.2 Behaviour on pan / zoom (“A”)

- **Scroll with pan:** the sprocket background and frame lines translate with the
  timeline (background-position derived from the viewport offset), so the
  perforations read as physical film moving past the rail.
- **Scale with zoom:** the sprocket **pitch** and frame-line spacing scale with the
  on-screen pixels-per-year (`scale.pxPerYear × viewport.k`), clamped to a sane
  range, so frames spread when zooming in and compress when zooming out.
- **Refine/coarsen:** the year-tick step is still chosen by the existing
  `chooseTickStep` logic (no change to which years show). When a finer/coarser set
  appears, the **labels fade in/out** (a tick-label transition). Under reduced
  motion the fade is disabled (labels snap).

### 5.3 Responsive — slim tier (≤640px, and horizontal)

- At the existing **≤640px** vertical breakpoint (rail already narrows 88→64px) the
  rail switches to the **slim** tier: thin sprockets + a barcode hint + right-aligned
  years; the **stock name and frame numbers are hidden**. Same year data, less ornament.
- **Horizontal** orientation (rail 62px tall) is inherently slim: sprockets run along
  the top/bottom edges, years along the strip; it uses the slim ornament set.

The desktop comfortable tier targets the current **88px** rail width; if the full
left-lane + right-aligned years prove cramped at 88px, the eighties vertical rail
width may be nudged slightly wider (validate live — §7).

## 6. Testing

- `hoverTilt.spec.ts` — deterministic output per id; angle within range; both
  signs occur across a sample of ids.
- Card component tests — each of the four cards exposes its hover hook
  (class/markup): cabinet & gelatin carry a seeded tilt; film frame has the
  advance markup; **edge-print has no advance**.
- `TimeRail.spec.ts` (extend) — in the eighties theme the rail renders the
  perforation/celluloid markup and applies the fade hook to newly-appearing ticks;
  in the Classic theme the markup is unchanged. Tier switch at the width breakpoint.
- Reduced-motion — assert the motion hooks are inert under `prefers-reduced-motion`
  where unit-testable.

## 7. Risks

- **SVG `transform-origin`** for the hover lift/tilt — needs live validation that
  the pivot is the card centre across browsers; origin-centred geometry should make
  it straightforward, but verify before building all four cards.
- **Frame-advance in SVG** — stepping the portrait + rolling holes within a clipped
  region is more involved than a CSS background scroll; prototype on the film frame
  first and confirm it reads at tree zoom levels.
- **Rail legibility** — keykode + stock name must not fight the year labels at 88px;
  the slim tier and the optional width nudge are the mitigations. Validate live.
- **Rail performance** — the rail recomputes on every pan/zoom frame already; the
  perforations are a CSS background (cheap). Keep the fade a CSS transition, not a
  per-frame JS tween.

## 8. Docs impact (land with the PR)

Update `docs/reference/` (theme section: note the per-epoch hover behaviour and the
film-strip rail + its responsive tiers) at PR time via the `update-docs-for-pr`
skill. No README/CLAUDE.md product-overview change is expected (still “two themes”).

## 9. Out of scope (recorded)

- Item 2 — a distinct *selected*-state animation (dropped).
- Item 4 — the film-countdown entrance ceremony (still deferred).
- Couple pairing, per-epoch background morph, edge-print seeded frame-numbers, and
  the saved 35mm-B&W / Silver-Screen directions — all remain on the Film-theme
  roadmap, untouched here.
