# Oak Motion Design — a unified GSAP motion system

**Date:** 2026-06-12
**Status:** approved in brainstorming (visual-companion session); pending implementation plan
**Owner decisions baked in:** motion personality **A — Ceremonial unfurl**; implementation approach **2 — GSAP everywhere** (single motion system); entrance plays **once per browser session**; entrance concept **v8 — backdrop years, vertical climb, step-back reveal**.

## 1. Goal

Give the family-tree app a distinctive, cohesive motion language built on GSAP (v3.13+, all plugins free):

1. A signature **entrance ceremony** — the oak and the years timeline grow together, bottom→up, with the camera riding along and a replay button.
2. **Camera choreography** — one engine for all programmatic camera motion (search centering, deep links, ceremony).
3. **Micro-interactions** — hover, selection, search-match, popup open/close, media moments.
4. **Flip transitions** — popup↔dock shared-element morph and the vertical↔horizontal layout switch.

Three.js was evaluated and rejected (full SVG rewrite, bundle cost, readability loss). Generic tree-diagram libraries rejected (the custom layout engine is the product's identity).

## 2. Architecture

New module **`src/frontend/src/motion/`** — the single boundary for all motion. Components call `motion` functions at lifecycle points and **never import `gsap` directly**.

| File | Responsibility |
| --- | --- |
| `tokens.ts` | The timing language: durations + easings as TS constants (`ceremony` ≈ 4 s `power2.inOut`; `glide` 350 ms `power2.inOut`; `feedback` 300 ms `power1.out`; `morph` 450 ms `power2.inOut`; `cascade` 400 ms; `layoutSwitch` 700 ms). Written to `:root` CSS custom properties at startup so any SCSS usage shares the same values. |
| `reducedMotion.ts` | Reactive `prefersReducedMotion` (matchMedia + listener) — the only place the media query is read. Every entry point checks it and jumps to end state. |
| `camera.ts` | Replaces the hand-rolled `animateTo` easing in `usePanZoom.ts`: GSAP tween on a `{x, y, k}` proxy applying the existing viewport transform per tick. Interruption via `killTweensOf`. Used by search centering, deep links, and the ceremony. |
| `entrance.ts` | Builds the ceremony timeline from layout data (see §3). Exposes a **pure cue-sheet builder** (phases, camera beats, axis waypoints, backdrop-year positions) separable from GSAP for unit testing. Candidate for dynamic import (repeat sessions skip the code). |
| `popupDock.ts` | Flip shared-element morphs: popup↔rail panel/chip, and the lightbox expansion (§5). |
| `layoutFlip.ts` | Vertical↔horizontal layout transition (§6). |

**State-first rule:** Pinia store actions stay synchronous and instantly correct. Motion is layered on top and never gates state, tests, deep links, or reduced-motion users.

**Migration (the “everywhere” part):** the search-centering glide moves onto `camera.ts`; the oak viewport fade-in and medallion selection/match color transitions move from CSS `transition:` rules to GSAP tweens fired by Vue watchers. No CSS transitions remain on the tree; trivial UI-chrome transitions outside the tree may stay CSS but must consume the token custom properties.

## 3. The entrance ceremony (“v8”)

### Composition — three plans

1. **Third plan (backdrop years):** era hairlines spanning the full width plus giant translucent year numerals (gilt, ~15% fill-opacity, Georgia/serif), one per generation band. Each stratum **surfaces from the parchment** (fade + ~12 px upward drift) the moment the growth front reaches its years. During the ceremony these ARE the timeline; the regular TimeRail/YearAxis UI is hidden and fades in with the other controls at the finale.
2. **Second plan (dawn light):** a soft gilt radial-gradient glow (no SVG filters) rising along the trunk line, marking the growth front.
3. **First plan (the oak):** branches draw via `stroke-dashoffset` (dash length = real path length), medallions settle (fade + scale 0.7→1) just behind the growth front, generation by generation, with pauses between levels.

### Growth-front sync rule

One shared growth front: for every generation level, that level’s branches, its medallions, its backdrop stratum, and the conceptual axis progress all animate **in the same timeline window**, with waypoints derived from the layout’s per-generation year bands (`timeScale.ts`). Holds for any family data.

### Camera policy

- **Ride:** fit-width zoom (whole tree breadth always in frame), strictly **vertical climb** bottom→up following the growth front. No lateral tracking, ever — a wide generation (e.g. ~30 people born within ~20 years) **blossoms outward simultaneously** (inner→outer pair stagger). Accepted trade-off: very wide families render smaller medallions during the ride. *(A “manuscript sweep” alternative — camera tracking a wide row left→right in birth order — was prototyped and rejected by the owner.)*
- **Finale:** one **step-back** to today’s fitted view; every medallion ring **pulses gilt once** (`#e3cf93`, ~0.5 s); controls fade in.

### Backdrop year placement

- During the ride each numeral is laid inside the **ride camera’s horizontal window** (fixed margin; eras alternate right/left anchoring) — never cropped at any zoom.
- On step-back the numerals **glide outward to their corresponding screen edges**, positions computed from the two camera windows (ride and fit) — whole at every moment, for any tree shape and viewport.
- Hairlines always span full width (cropping a line is fine); only numerals reposition.
- Optional flavor (off by default): backdrop drifts at ~0.85× camera speed for parallax depth, at the cost of exact era-line/generation alignment.

### Rules

| Rule | Behavior |
| --- | --- |
| Frequency | Auto-plays once per browser session (`sessionStorage["oak-entrance-played"]`), on first tree-view mount. |
| Deep links | `/person/:id` marks played and skips straight to the centered person. |
| Interruption | Any wheel / drag / tap / key during the ceremony kills the timeline and jumps to the final fitted view (years at corner positions, axis UI restored). |
| Replay | A “⟳ Grow the tree” control (gilt parchment button, bottom-right with the tree-view controls; i18n ru «Вырастить дерево» / be «Вырасціць дрэва» / en “Grow the tree” + aria-label) replays anytime via `playEntrance({ force: true })`. |
| Reduced motion | Instant static tree and axis as today; replay button hidden. |
| Duration | ≈ 4 s for the seed family (31 people); scales with generation count, target < 6 s. |
| Media | The ceremony **never waits for the network** (§5). |

## 4. Micro-interactions

All read `tokens.ts`; all are GSAP tweens (personality A — calm, no overshoot).

- **Medallion hover:** lift to scale ~1.03 + ring brightens, 250 ms `power1.out`; reverse 300 ms.
- **Selection:** ring tween to deep-leaf green, 350 ms (replaces CSS transition).
- **Search match:** one gold ring pulse — the same pulse as the ceremony finale — then steady gold highlight. Search centering glide itself runs on `camera.ts` (350 ms, unchanged behavior incl. interruption).
- **Popup open/close (no docking):** glass card fades up 8 px; content cascades portrait → name → details, ~400 ms total.

## 5. Media-aware motion (stills & living portraits)

Context: medallions render still portraits (SVG `<image>` from R2 `/media/*`, monogram fallback); `PersonDetail` shows the still or an inline autoplaying muted living clip (still as poster); `MediaLightbox` full-screens them with video→still error fallback.

- **Portrait fade-in:** when a medallion still finishes loading (during or after the ceremony) it fades in over ~300 ms over the tinted-disc placeholder — no pop-in; the ceremony never blocks on media.
- **Comes-alive shimmer:** when the popup’s living clip starts playing (poster = still, so pixels are continuous), a one-time subtle ring shimmer marks the moment; no looping animation over a playing video.
- **Dock morph × video:** the Flip flight is transform-only (GPU-composited) — the clip keeps playing through the morph. Documented fallback if jank appears on weak devices: swap to poster for the flight. Docking to a minimized bar unmounts the body (video stops naturally).
- **Lightbox expansion:** the lightbox stage grows out of the popup’s portrait disc (Flip shared-element), scrim fades; close reverses. ~400 ms. Error-fallback logic untouched.

## 6. Flip transitions

- **Popup↔dock morph:** store state flips instantly; Flip captures the source bounds and animates the destination from them — glass card shrinks/glides into its rail slot (or grows out of it on undock ⤢), border-radius morphing, content cross-fading. ~450 ms `power2.inOut`. Rail in chips mode → the chip is the target. Rail neighbors reflow via the same Flip capture. A second dock/undock completes the in-flight morph instantly first.
- **Layout switch (vertical↔horizontal):** nodes glide to new positions **staggered by generation** (~600 ms, echoing the ceremony rhythm); branches cross-fade out/in (200 ms each side) rather than path-morph (MorphSVG noted as optional later upgrade — link topology is unchanged); year axis cross-fades between orientations; camera re-fits within the same timeline. ~700 ms total.

## 7. Testing

- **Cue-sheet unit tests (Vitest):** `entrance.ts`’s pure builder — generation windows, year-band waypoints, ride/final backdrop positions, wide-band handling — asserted as numbers, no GSAP, no DOM.
- **Reduced motion:** both `matchMedia` branches; every entry point jump-to-end verified.
- **State-first:** store/component tests keep asserting state synchronously; `PersonMedallion.spec` updated where it assumes CSS transitions.
- **Camera adapter:** tween proxy applies clamped transforms; interruption kills tweens.
- **Live verification per PR** via preview tooling (note: headless preview starves `requestAnimationFrame` — force a paint before judging animations).

## 8. Performance

- gsap core + Flip ≈ 30 KB gzipped (~one font). Optional dynamic import of `entrance.ts`.
- Ceremony cost: stroke/opacity tweens on ~200 SVG nodes + one viewport transform per tick (same per-tick cost as today’s glide). No SVG filters anywhere.
- Morphs are transform-only; playing videos never re-rasterize.

## 9. Delivery — four PRs off `main` (owner reviews; no self-merge)

1. **Motion foundation:** gsap dep, `motion/` module (tokens, reducedMotion, camera), migrate existing glide/fades/medallion tweens. Zero new UX — proves no regressions.
2. **The ceremony:** entrance timeline, backdrop years, dawn light, step-back + pulse, replay button, session gating, deep-link skip, interruption.
3. **Choreographed interactions:** popup cascade, comes-alive shimmer, portrait fade-in, hover lift, search pulse, lightbox expansion.
4. **Flip transitions:** popup↔dock morph, layout-switch glide.

PR 1 is prerequisite; PRs 2–4 are mutually independent.

## 10. Out of scope / future

- Idle motion (leaf sway, ambient shimmer) after the ceremony.
- Parallax backdrop flavor (§3, off by default).
- MorphSVG branch morphing on layout switch.
- Any change to layout math, data model, or API.
