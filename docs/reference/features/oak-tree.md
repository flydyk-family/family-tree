# Feature: The Oak Tree

← back to [features index](README.md) · [reference index](../README.md)

The oak is a full-viewport SVG rendering the family graph. Pan/zoom and orientation are covered in [search-and-navigation.md](search-and-navigation.md); this document covers structure, the layout engine, medallions, the time rail, and motion.

Key components: [`OakTree.vue`](../../../src/frontend/src/components/OakTree.vue), [`PersonMedallion.vue`](../../../src/frontend/src/components/PersonMedallion.vue) (+ [`components/medallion/`](../../../src/frontend/src/components/medallion/)), [`TimeRail.vue`](../../../src/frontend/src/components/TimeRail.vue); engine: [`layout/treeLayout.ts`](../../../src/frontend/src/layout/treeLayout.ts), [`layout/timeScale.ts`](../../../src/frontend/src/layout/timeScale.ts), [`layout/projection.ts`](../../../src/frontend/src/layout/projection.ts), [`layout/focusBounds.ts`](../../../src/frontend/src/layout/focusBounds.ts).

The **Film theme** is the **default**: every node is a [period-accurate photo card](#eighties-film-theme-medallions) and the whole chrome wears a muted dark-grey palette. Switching to **Classic** swaps each node back to the gilt-oval medallion on warm parchment.

## SVG structure

The SVG fills its container (no `viewBox`); all coordinate mapping is a GSAP `transform` (`translate(x,y) scale(k)`) on an inner `<g class="oak__viewport">`. Z-order, back to front:

1. **`oak__branches`** — parent→child descent connectors. Appearance varies by theme — see [Descent connectors by theme](#descent-connectors-by-theme) below.
2. **`oak__unions`** — partner links. Appearance varies by theme — see [Descent connectors by theme](#descent-connectors-by-theme) below.
3. **`oak__nodes`** — one `<g data-test="node" :data-node-id="{id}" role="button" tabindex="0">` per person, translated to `(x,y)`, classes `oak__node oak__node--{role}` plus `--selected` / `--match`. Each holds a `<PersonMedallion>`. A **desktop click grows the bigger-view popup out of that medallion** (the `data-node-id` lets the open morph capture the clicked medallion's rect — see [person-details.md](person-details.md)).

## Descent connectors by theme

### Classic theme

- **Descent paths (`oak__branches`):** `<path data-test="branch">` with `stroke: var(--bark)`, width `max(0.6, 2.6 − generation*0.6)` (trunk ~2.6 → leaf ~0.6), round caps, cubic-bezier curves (vertical or horizontal form). Width tapers toward leaf nodes.
- **Union ties (`oak__unions`):** `<line>` with `stroke: var(--bark-dark)`, dashed `2 3`.

### Film theme (eighties)

When `uiStore.theme === 'eighties'`, descent connectors are replaced by [`RopeLink.vue`](../../../src/frontend/src/components/RopeLink.vue); union ties are recoloured in place (see the Union ties paragraph below):

**Descent rope — red string cord.** Each parent→child link is rendered as a sagging rope in three SVG layers stacked on the same quadratic sag path:

| Layer | Element | Purpose |
|---|---|---|
| Core (`data-entrance-draw`) | `<path>` solid red, `stroke-width: 1.5` | The main cord; carries `data-test`, `data-link-id`, and `data-entrance-draw` for the entrance ceremony |
| Twist overlays (`data-entrance-fade`) | Two `<path>` dashed overlays offset in opposite phases | Simulate the twisted-strand texture of a real string |
| Shadow | `<path>` dark, semi-transparent, slightly offset | Drop shadow beneath the cord |

The cord is **flat width 1.5 — no generation taper** (unlike the Classic branch which tapers by generation). The sag is computed by `ropePath(link, orientation)` using a fixed `ROPE_SAG` constant, producing a gentle catenary droop between card junctions.

**Union ties.** In the Film theme, couple/union links (`oak__unions`) are a **thin red dashed line** (`<line>`, same red cord colour token, dashed pattern), replacing the Classic bark-dark dashes.

**Entrance ceremony integration.** The ceremony draws the solid core (stroke-dashoffset animation on `data-entrance-draw` elements) while the twist overlays **fade in** (`data-entrance-fade`) — the same hook mechanism used by medallions and year-strata era lines. The core path retains `data-test="branch"`, `data-link-id`, and `data-entrance-draw` so the ceremony engine can target it without modification.

A `<radialGradient id="oak-vignette">` seats portraits into their ovals. The parchment background is on the container, not the SVG.

## Node roles
Assigned by generation relative to the focus person: `trunk` (focus and nodes within trunk depth 2), `branch`, `root` (ancestors deeper than gen −2), `leaf` (childless terminals). Role drives medallion size and branch width.

## Medallion ([`PersonMedallion.vue`](../../../src/frontend/src/components/PersonMedallion.vue))

A person card. Frame artwork is rendered at ratio ≈ 1.21 (owner-tuned). Sizes by role: trunk 200×242, branch/root 186×225, leaf 158×191 px.

**Contents:**
- **Portrait** — `<image data-test="portrait" href="/media/portraits/{filename}">` clipped to an oval (`preserveAspectRatio="xMidYMid slice"`, slight downward offset `+2%`). Zoom by role: trunk 0.64, branch/root 0.70, leaf 0.60. **Tree nodes show only the still image — no video.**
- **Initials fallback** — when `portrait` is null: `<text class="oak__initial">` = first letter of the localized given name, gilt, `aria-hidden`. Rendered even when the name is empty (no divide-by-zero).
- **Name banner** — `<text class="oak__name">`, Cinzel/Forum, one line, auto-fit size (`nameFontSize`, clamped between ~6.7% and ~11.2% of frame width).
- **Years** — `<text class="oak__dates" data-test="lifespan">`, EB Garamond; **only rendered when a year span string is non-empty**.
- **Frame stack** — a base gold frame image always visible, plus one **overlay** image whose href + opacity animate (see states). The frames are **pre-rasterized WebP bitmaps** ([`frameAssets.ts`](../../../src/frontend/src/components/medallion/frameAssets.ts)) baked from the editable `frame-*.svg` source by [`scripts/gen-medallion-frame-rasters.mjs`](../../../src/frontend/scripts/gen-medallion-frame-rasters.mjs). A vector SVG in this per-node `<image>` would force the browser to re-rasterize ~90KB of paths at the new scale on **every** pan/zoom frame (×2 images × every node), which collapsed the classic theme to ~1 fps on a 100+-person tree; a bitmap is decoded once and GPU-scaled, keeping pan/zoom smooth.

### Medallion states
| State | Visual |
|---|---|
| Plain | Base gold frame; overlay opacity 0 |
| Selected (`selected`) | [`frame-selected.svg`](../../../src/frontend/src/assets/medallion/frame-selected.svg) (brighter gold) crossfades in (0.3 s) |
| Search match (`match`) | [`frame-match.svg`](../../../src/frontend/src/assets/medallion/frame-match.svg) (green-gold) crossfades in — **match wins over selected** |
| Selected→Match | href swaps at opacity 1 (instant color change, intentional, not a crossfade) |
| Keyboard focus (`:focus-visible`) | Gilt drop-shadow glow on the frame |
| Hover | Cursor pointer |

> There is **no dimmed/faded state** for non-selected nodes. All nodes stay at full opacity.

## '80s Film theme medallions {#eighties-film-theme-medallions}

When `uiStore.theme === 'eighties'`, [`PersonMedallion.vue`](../../../src/frontend/src/components/PersonMedallion.vue) renders [`EightiesMedallion.vue`](../../../src/frontend/src/components/medallion/eighties/EightiesMedallion.vue) instead of the classic gilt oval. The whole chrome re-skins via `[data-theme='eighties']` on `<html>` (see [app-shell-and-localization.md](app-shell-and-localization.md#theme-toggle)).

### Palette / canvas

| Token / element | Value |
|---|---|
| Canvas / tree background | Brushed-metal backdrop (see below) |
| Film body / dark mount (`--celluloid`) | `#0d0e10` |
| Panel / control background | `#1b1c1f` |
| Selection / search accent (`--signal`) | `#e6e8ea` (neutral, no colour) |
| Time-rail sprocket-hole dot (`--rail-perf`) | `#6a6a6a` (mid-grey) |
| Ink (text) | `#ededea` |

The warm parchment and gold are replaced throughout; there is **no neon**.

#### Brushed-metal backdrop

A brushed-steel photo (`film-backdrop.webp`, committed as an optimized SPA static asset — Vecteezy Free License; see `THIRD-PARTY-NOTICES.md`) fills the **fixed** `.tree-view__oak` container as `background-size: cover`. The canvas does **not** pan or zoom with the tree — it acts as the backdrop the subjects are photographed against. On mobile (`≤640 px` / coarse pointer) the image position shifts to `left` so the darker left region of the texture sits behind the tree; everywhere else it is centred. The same backdrop is applied to the **`/chronicle`** view in the Film theme, so entering the app and the tree share one surface.

`--canvas-bg` is set to the image URL, not a plain colour. A dedicated `--rail-perf` token (`#6a6a6a`) carries the sprocket-hole dot colour in `TimeRail.vue` (which previously reused `--canvas-bg` as a colour — that usage was replaced to prevent the dots disappearing when the canvas became an image).

### Epoch medallion rule ([`medallion/era.ts`](../../../src/frontend/src/components/medallion/era.ts))

Birth year is mapped to one of three period-accurate photo-card variants by hard cutoffs:

| Birth year | Era key | Component | Visual |
|---|---|---|---|
| `< 1900` | `cabinet` | [`CabinetCard.vue`](../../../src/frontend/src/components/medallion/eighties/CabinetCard.vue) | Sepia print on a cream (`#ece1c6`) mount; "Studio · Minsk" italic studio imprint; portrait via `sepia(0.72) saturate(0.95)` CSS filter |
| `1900 – 1944` | `gelatin` | [`GelatinPrint.vue`](../../../src/frontend/src/components/medallion/eighties/GelatinPrint.vue) | Matte B&W on a white (`#f4f2ec`) mount; portrait via `grayscale(1) contrast(1.08)` |
| `≥ 1945` or unknown | `film` | [`FilmFrame.vue`](../../../src/frontend/src/components/medallion/eighties/FilmFrame.vue) | Colour film frame — see below |

Unknown birth year (`null`) always resolves to `film`.

Within the `film` era a second cutoff, `filmVariant(birthYear)` (also in [`era.ts`](../../../src/frontend/src/components/medallion/era.ts)), picks the frame furniture: births **`≥ 1990`** render the holeless **edge-print** frame ([`EdgePrintFrame.vue`](../../../src/frontend/src/components/medallion/eighties/EdgePrintFrame.vue)); earlier film-era births (and unknown year) keep the **holed** frame ([`FilmFrame.vue`](../../../src/frontend/src/components/medallion/eighties/FilmFrame.vue)).

**Name layout (all Film cards).** Every Film card lays the **name above** the card and a **years chip below**. The name uses `fitName` ([`nameFit.ts`](../../../src/frontend/src/components/medallion/nameFit.ts)): it stays on **one line** unless a multi-word name would shrink to a squished single line, in which case it wraps onto **two balanced lines at a larger font** (the longer line is minimised; for a "Given Patronymic Surname" the surname drops to its own second line). Two lines are only adopted when they buy a bigger font than the one-line fit; the block grows **upward** into the open canvas above the card. (The Classic medallion keeps its single-line banner via `nameFontSize`.)

**Name backing band (all Film cards).** Behind every Film card name sits an **edge-fading translucent band**: a `<rect>` filled with the `#e80-name-fade` linear gradient (defined in `EightiesDefs`; `#0a0b0d` at 0 → 0.5 → 0.5 → 0 opacity left-to-right), sized from `g.nameMax` and the fitted name's line metrics, centred on the card. It fades to nothing at both edges so there are no hard chip edges, but is opaque enough in the middle to carry the name text against the bright metal backdrop. The band sits outside `.e80-card__art` so the search-match frame never interacts with it.

### Film frame card — holed, 1945–1989 ([`FilmFrame.vue`](../../../src/frontend/src/components/medallion/eighties/FilmFrame.vue))

- **Shape:** vertical dark-celluloid (`--celluloid`) rectangle with sprocket-hole strips on both sides.
- **Sprocket holes:** genuinely **transparent** — the perforation strips (and the body/shadow behind them) carry a per-card `<mask>` (`film-holes-{id}`) whose black hole rects (`data-test="perf-holes"`) punch through to whatever is behind the card: the `#5c5c5c` canvas, a branch line, or — on a search match — the halo glow bleeding through the perforations. The holes still **roll on hover** (the mask's hole group advances in lockstep with the photo gate). The match cue is the card halo, so the holes don't recolour for a match.
- **Portrait:** Kodachrome-grade CSS filter (`sepia(0.42) saturate(1.22) contrast(1.05) brightness(1.04) hue-rotate(-6deg)`).
- **Edge printing:** vertical text on both sprocket strips — `PHOTO 400NC` (left) and `GPX · 2` (right); monospace font, opacity 0.85.
- **Abrasion:** one deterministic vertical scratch + 2–3 dust specks per person, seeded from the person id via [`abrasion.ts`](../../../src/frontend/src/components/medallion/eighties/abrasion.ts) — stable across renders.
- **Hover flicker:** the grain overlay (`mix-blend-mode: overlay`) animates `film-flicker` at 3 steps / 0.5 s on hover. Disabled under `prefers-reduced-motion`.
- **Grain:** always visible (static); the flicker only animates the grain layer opacity.

### Edge-print frame — holeless, 1990+ ([`EdgePrintFrame.vue`](../../../src/frontend/src/components/medallion/eighties/EdgePrintFrame.vue))

A variant of the film card for the youngest generation. Shares the celluloid body, Kodachrome portrait, grain, seeded abrasion, name/years and selection glow, but **no sprocket holes**. Differences:

- **Solid side strips** carrying the edge text **centred** up each margin (not crowded against the photo).
- **Wider top/bottom borders** (`vB = 10` px, larger than the holed frame's 6) holding **frame-number marks in the four corners** (`data-test="edge-corners"`: `45A` / `025` top, `45` / `→` bottom).
- **Search match:** the celluloid body lightens to `#1b1d21` (`data-test="edge-body"`) — there are no holes to brighten.

### Per-epoch hover (eighties) {#per-epoch-hover-eighties}

Every card **lifts** on pointer hover (rise + slight scale + a deeper drop shadow). The motion is **epoch-specific** and applied to each card's own SVG group (`.e80-card`, `transform-box: fill-box` so the pivot is the card's own centre), composing with the layout transform rather than fighting it. It is defined once in [`themes/eighties.scss`](../../../src/frontend/src/styles/themes/eighties.scss) and is entirely disabled under `prefers-reduced-motion`.

| Card | Era | Hover |
|---|---|---|
| Cabinet · Gelatin | `< 1945` | Lift **+ a seeded ~2–4° tilt** — direction and angle are stable per person via [`hoverTilt.ts`](../../../src/frontend/src/components/medallion/eighties/hoverTilt.ts), exposed on the card as the `--hover-tilt` CSS variable |
| Film frame | `1945–1989` | Lift **+ a single film advance** — on hover the film (the photo `.film__gate` plus the sprocket holes `.film__holes`) glides one frame via a 0.7 s CSS transition so a duplicate frame enters through a fixed clip aperture, and settles back smoothly on leave. The holes roll a whole number of perforation pitches (192 px) and are body-clipped, so the advanced position matches rest exactly (no snap). Grain and abrasion stay static; the grain `film-flicker` continues |
| Edge-print | `≥ 1990` | **Lift only** (no advance — it has no sprocket holes) |

`hoverTilt` and `abrasion` share the seeded PRNG in [`seed.ts`](../../../src/frontend/src/components/medallion/eighties/seed.ts) but draw from distinct seed streams (`${id}#tilt` vs the bare id), so a card's tilt and its wear are uncorrelated.

### Film theme states

| State | Visual |
|---|---|
| Plain (holed) | Dark celluloid frame, transparent sprocket holes; name backed by edge-fade band |
| Plain (edge-print, `≥ 1990`) | Solid celluloid borders, no holes, corner frame numbers; name backed by edge-fade band |
| Selected | `--signal` (`#e6e8ea`) border stroke, 2 px, `data-test="sel-edge"` — applies to all card variants |
| Search match (`match`) | A **white frame** (`<rect class="e80-match-frame">`, `fill: none; stroke: #fff; stroke-width: 2; rx: 3`) drawn around the **whole matched card** — enclosing the name (above), the film frame, and the years chip (below) — placed slightly beyond the card edges and outside `.e80-card__art`. Filter-free: one vector stroke per match, reads on any backdrop value including the bright metal centre. The old `drop-shadow` glow is **removed** for match. |
| Hover | Every card lifts; pre-1945 prints also tilt (seeded); the film frame runs (gate advance + holes roll) atop the grain flicker; edge-print lifts only. All disabled under reduced motion — see [Per-epoch hover](#per-epoch-hover-eighties) |

> The classic gold-frame `frame-selected.svg` / `frame-match.svg` overlay images are **not used** in the Film theme.

### Shared SVG defs ([`EightiesDefs.vue`](../../../src/frontend/src/components/medallion/eighties/EightiesDefs.vue))

Injected once per `OakTree` via a `<defs>` block: `#film-shadow` (drop shadow filter), `#film-glow` (selection glow filter, referenced when `selected`), `#film-grain` (feTurbulence grain filter), `#e80-name-fade` (edge-fading linear gradient used by every Film card's name backing band).

### Roadmap — Film theme

- **Couple pairing** (rendering spouses born ≤ 5 years apart as a single side-by-side card) — **planned, not yet implemented**.
- **Per-epoch background morph** (canvas colour cross-fading as the user scrolls the time axis into different eras) — **future goal, not yet implemented**.

## Layout engine ([`treeLayout.ts`](../../../src/frontend/src/layout/treeLayout.ts))
Builds abstract `{x, y, role, generation}` nodes from people + unions:
- Constants: `GENERATION_YEARS=28`, `xGap=180`, `pxPerYear=14`, `spouseGap=205`, trunk depths 2/2.
- **Two modes via `fullTree`.** The app builds with **`fullTree: true`**, so the **whole connected family is always rendered** and the focus person serves **only as the centering anchor** (pinned to x=0) — choosing a default root low in the tree no longer hides the other branches. The default focus-scoped mode (no flag, used by tests) instead draws only the focus's ancestors, descendants, and own siblings.
- **Full-tree mode:** generations are measured relative to the focus (focus=0, ancestors negative, descendants positive) by walking the family graph undirected (parent −1, child +1, spouse same); the bloodline is laid out by a forest-tidy pass over its founders (no parents, not married-in), **married-in spouses** attached at `partner.x + 205`, then all x shifted so the focus sits at x=0. Only the focus's connected component is drawn; node order follows the source `people` list.
- **Focus-scoped mode** (default): tidy layout in both directions from focus (descendants + ancestors); **siblings** of focus placed beside the main tree in birth-year order; married-in spouses at `partner.x + 205`.
- **Year assignment** (`assignYears`): uses `birthYear`; if missing, estimates from parents (+28), children (−28), or spouse; fallback 1900.
- **Overlap separation** (`separateOverlaps`): same-generation rows pushed apart by card half-width (trunk 108 / branch 101 / root 101 / leaf 87, +14 gap), then re-centered and the focus re-anchored to x=0. *(This is a known pragmatic nudge — see [technical-debt.md](../technical-debt.md).)*
- **Links:** one descent link per (parent, child); one union link per 2-partner union.
- Throws on unknown `focusId`; silently skips dangling parent references.

### Orientation ([`projection.ts`](../../../src/frontend/src/layout/projection.ts))
`vertical`: X = spread, Y = time (newer = larger Y). `horizontal`: axes transposed (older left → newer right). Switching re-projects and re-fits the camera. Orientation persists in `localStorage['familytree.orientation']`. The **default** is responsive — **horizontal on mobile-class viewports (the mobile predicate: width < 1200 px or height < 560 px), vertical otherwise** — until the user explicitly toggles, after which the manual choice wins (see [search-and-navigation.md](search-and-navigation.md#orientation)).

## Time rail ([`TimeRail.vue`](../../../src/frontend/src/components/TimeRail.vue))
A parchment rail with year ticks, kept perfectly aligned to nodes (it consumes the same viewport transform the oak emits).
- **Vertical mode:** left of the oak, 88 px wide (64 px ≤640 px). **Horizontal mode:** below the oak, 62 px tall.
- **Tick tiers:** `minor` / `decade` (bolder) / `century` (boldest, larger). Density chosen by zoom so ticks never crowd closer than 56 px (horizontal) / 24 px (vertical); candidate steps 1,2,5,10,25,50,100,200,500.

### '80s film-strip rail (eighties theme)

When the Film theme is active (`theme === 'eighties'`, passed from [`TreeView`](../../../src/frontend/src/views/TreeView.vue)) the rail re-skins as a **perforated celluloid film strip**; geometry comes from [`railFilmStrip.ts`](../../../src/frontend/src/components/railFilmStrip.ts). All of it is scoped under `.time-rail--film`, so the Classic parchment rail is unchanged.

- **Celluloid body** with two **sprocket-hole columns** (canvas-coloured `radial-gradient` dots punched into the strip). The hole **pitch scales with zoom** — `sprocketPitch(scale.pxPerYear, viewport.k)`, clamped 9–34 px and tied to the current tick cell — and the strip **scrolls with pan** via `sprocketOffset`. Both are fed to an inline `background-size` / `background-position` (so the static SCSS holds only the hole pattern).
- **Detail:** a keykode **barcode** lane + a vertical **stock name** (`KODAK 5247 · SAFETY`) on the left, faint **frame-line dividers** behind the years (spaced 4× the sprocket pitch, so they scale with zoom and scroll with pan in register with the perforations), a warm **emulsion sheen**, and light **right-aligned** year labels (no parchment chip, no tick mark — the perforations are the marks).
- **Zoom in/out:** as the tick step refines (or a year scrolls in at an edge), each new year label **fades in** via a per-tick CSS **mount animation** — a `<TransitionGroup>` was avoided deliberately, since its per-frame `getBoundingClientRect` FLIP would thrash layout on every pan/zoom frame. Disabled under `prefers-reduced-motion`; the scroll-with-pan is direct manipulation and always tracks.
- **Responsive slim tier:** at **≤640 px** (and in horizontal orientation) the **stock name hides** and the barcode stays; horizontal lays the barcode along the top edge.

## Motion

The motion engine ([`motion/`](../../../src/frontend/src/motion/)) is GSAP-based; every animation checks `prefers-reduced-motion` and snaps instantly when reduced.

**What actually animates:**
| Trigger | Animation | Duration / ease |
|---|---|---|
| First view of the oak in a session | **Entrance ceremony** — the oak "grows" oldest→present (see below) | ~0.35× of a multi-second timeline; snaps to final view if reduced |
| Selection / search highlight changes | Medallion overlay opacity crossfade | 0.3 s `power1.out` |
| Search navigation | Camera pan/zoom glide to target | 0.35 s `power2.inOut` (see [search-and-navigation.md](search-and-navigation.md)) |
| Manual orientation toggle (vertical↔horizontal) | **Layout-switch glide** — medallions glide to new positions staggered by generation; branches + year axis cross-fade; camera re-fits (see below) | ~0.7 s `layoutSwitch`; instant under reduced motion / responsive auto-flip / first load |
| Pointer hover on a medallion | **Medallion hover lift** — the `.oak__medallion-card` scales to 1.03 (a calm, transform-only lift — no brighten/filter); suppressed during the entrance ceremony (`ceremonyActive` prop) and under reduced motion. (`hoverLift` in [`motion/interactions.ts`](../../../src/frontend/src/motion/interactions.ts), wired in [`OakTree.vue`](../../../src/frontend/src/components/OakTree.vue) via per-node `@pointerenter`/`@pointerleave`.) | 250 ms in / 300 ms out, `power1.out` |

When the ceremony does **not** run (already played this session, deep-link arrival, or reduced motion), the oak simply fades in (viewport 0→1, 0.15 s `power1.out`).

The `morph` and `cascade` tokens drive the popup↔dock morph and the medallion-open grow (see [person-details.md](person-details.md)); `layoutSwitch` drives the orientation glide (below). The other PR 3 micro-interactions — portrait fade-in, comes-alive shimmer, search-match pulse, lightbox expansion — were explored but deferred; only the hover lift shipped (see [roadmap.md](../roadmap.md)).

### Pan/zoom paint-shedding (eighties theme)

While a pan or wheel/pinch-zoom gesture is in flight the oak carries `.oak--panning`. The Film theme is paint-heavy per card, so during the gesture it drops detail that is imperceptible while the tree is in motion and restores it the instant the gesture ends — keeping a dense 100+-person tree smooth without changing the at-rest look. Shed during a gesture (`themes/eighties.scss`):

- the per-card **grain** overlay (`mix-blend-mode: overlay` — the costliest layer to repaint);
- the **rope** twist overlays + soft shadow (connectors render as just their solid red core);
- on the holed **FilmFrame** card, the sprocket-hole **`<mask>`** (composited onto the shadow, body and perf strips — the holes read as a solid film edge for the duration) and the **duplicate hover-advance portrait** (clipped out of view except mid-hover, so hiding it is invisible).

Measured on the 116-person tree, the FilmFrame sheds lift pan/zoom from ~16fps to ~22–28fps (the grain/rope sheds predate this). The whole oak viewport is also promoted to its own compositor layer (`will-change: transform`) for the duration.

### Entrance ceremony

Modules: [`useEntranceCeremony.ts`](../../../src/frontend/src/motion/useEntranceCeremony.ts) (gating/when), [`entrance.ts`](../../../src/frontend/src/motion/entrance.ts) (timeline/how), [`entranceCues.ts`](../../../src/frontend/src/motion/entranceCues.ts) (cue-sheet/what); wired in [`TreeView.vue`](../../../src/frontend/src/views/TreeView.vue).

The first time the oak and its layout are ready **in a browser session**, the camera plays a one-shot "grow the tree" sequence climbing the time axis from the oldest generation to the present.

- **Gating:** runs **once per session** (a flag at `sessionStorage['oak-entrance-played']`). It is **skipped** (and the flag set) when the user arrives via a `/person/:slug` deep link, and under **`prefers-reduced-motion`** (the view jumps straight to the final framed state).
- **The climb:** a soft gilt **dawn-light glow** with a white **star** core leads each generation, trailing a **comet trace**; the star darts ahead to gesture toward the next generation. The camera **glides continuously and slows — but never fully stops — as it centres each generation**, so a new generation is met in the **middle** of the frame. As the camera centres a band, that generation's **branches draw** (stroke-dashoffset), and its **medallions, union links, and year-strata era line** fade in.
- **Year strata:** faint era lines labelled with the band's median year ride along the time axis (one per generation), their numerals kept whole inside the frame, then gliding to the screen edges at the finale.
- **Finale:** the camera steps back to frame **only the most recent four generations** (not the whole tree, which can span centuries), and every gilt ring pulses once.
- **Orientation-aware:** plays in whichever orientation is active — a vertical **climb** or a horizontal **pan** (strata and comet trace mirror onto the active axis).
- **Replay:** a **"Grow the tree"** button (`data-test="entrance-replay"`, localized `entrance.replay`) at the bottom of the tree view replays it on demand; it is hidden while the ceremony is active and under reduced motion.
- **Tap-to-skip:** any pointer / wheel / touch / key input during the ceremony immediately skips it to the final framed view (capture-phase handlers on the stage).
- **Pacing:** the whole timeline runs at ~0.35× (an owner-tuned calm speed).

### Layout-switch glide

Modules: [`layoutFlip.ts`](../../../src/frontend/src/motion/layoutFlip.ts) (pure blend math), [`useLayoutMorph.ts`](../../../src/frontend/src/composables/useLayoutMorph.ts) (the tween); wired in [`TreeView.vue`](../../../src/frontend/src/views/TreeView.vue), rendered by [`OakTree.vue`](../../../src/frontend/src/components/OakTree.vue).

When the user **manually** toggles orientation, the oak *glides* to its new arrangement instead of snapping, over one ~700 ms timeline (`layoutSwitch` token):

- **Per-generation node glide:** medallions travel to their new positions in a ripple **oldest generation first**, each easing over its own window (a linear global driver `t:0→1`; the per-node stagger + `power2.inOut` ease live in `layoutFlip`). Implemented by interpolating between the two `projectLayout` results (the from/to orientations) — Vue keeps ownership of every transform.
- **Branches + union links cross-fade:** they fade out as the glide starts and fade back in at the new geometry once the nodes land (so inter-generation links never stretch mid-flight). The year axis ([`TimeRail`](../../../src/frontend/src/components/TimeRail.vue)) cross-fades the same way.
- **Camera re-fits** to the new orientation's focus band within the same window (reusing the search camera glide).
- **Instant (no glide)** under `prefers-reduced-motion`, on a **responsive auto-flip** (window crossing the slim breakpoint), and on first load — there is no prior state to glide from. A second toggle mid-glide finishes the in-flight morph instantly before starting the next.

## Formatting ([`format/`](../../../src/frontend/src/format/))
- **Year span (medallion):** `formatYearSpan(birthYear, deathYear)` → `"1762–1828"`, living `"1962–"`, birth-only-unknown `"–1900"`, both unknown `""` (line hidden). No `~` approx marker (bare years).
- **Lifespan (detail):** `formatLifespan(birth, death)` works from `LifeEvent` objects and **does** prefix `~` for approximate years (`"~1762–1828"`).
- **Name:** `formatPersonName` localizes given + surname and joins with a space (used in detail/rail; the medallion localizes each part itself).
- **[VocationIcon](../../../src/frontend/src/components/VocationIcon.vue):** inline SVG for `teacher`/`church`/`writer`/`office`/`other`; renders nothing for unknown vocations.
