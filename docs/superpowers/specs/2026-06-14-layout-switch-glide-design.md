# Layout-switch glide (vertical ↔ horizontal) — design

**Date:** 2026-06-14
**Status:** approved (owner), ready for implementation plan
**Program:** oak motion design — this is **PR 4b**, the second half of the original
motion spec §6 (`docs/superpowers/specs/2026-06-12-oak-motion-design.md`). PR 4a
(popup ↔ dock shared-element morph + medallion-open grow) shipped in
[#80](https://github.com/flydyk-family/family-tree/pull/80).

## Goal

When the user flips the oak between **vertical** and **horizontal** orientation,
the tree should **glide** to its new arrangement instead of snapping. The
medallions travel to their new positions in a per-generation ripple (oldest →
newest), the branches and time axis cross-fade, and the camera re-frames — all in
one ~700 ms timeline (`layoutSwitch` token).

Today the flip is instantaneous: `layout = projectLayout(base, ui.orientation)`
recomputes, `OakTree` re-renders every node `<g transform="translate(x,y)">` and
branch path at once, and the orientation watcher calls `fit()` so the camera
snaps.

## Decisions (owner-approved)

| Question | Decision |
|---|---|
| Headline motion | **Per-generation glide** — nodes ripple to new positions, staggered oldest→newest (echoes the entrance ceremony rhythm). |
| Branches / union links | **Cross-fade out/in** — fade out as the glide starts, fade back in at the new geometry once nodes land (matches spec §6; avoids inter-generation links stretching while parents/children move in different stagger windows). |
| Trigger | **Manual toggle only.** A responsive auto-flip (window crossing the breakpoint) and first load switch instantly — there is no "from" state to glide from. |
| Technique | **Tween the data** (approach B): interpolate between the two pure `projectLayout` results and let Vue render. Chosen over a per-node FLIP because it keeps Vue in sole ownership of every transform (no GSAP-vs-binding conflict, no wrapper `<g>` per node), the core logic is a pure, unit-testable function, and it matches the existing camera-glide paradigm (`glideTo` already tweens reactive `viewport` data → Vue renders). The dock morph and this share the motion *grammar* — `tokens.ts`, reduced-motion snap, state-first, finish-in-flight — even though they use different positioning mechanisms, because they are different motion categories (shared-element mount-transition vs. continuous re-layout of persistent elements). |

## Architecture

Three pieces; everything else (`projectLayout`, `glideTo`, the motion tokens) is
reused unchanged.

### 1. `src/frontend/src/motion/layoutFlip.ts` — pure (no GSAP, no DOM)

The reserved module name from the original spec. The heart of the feature, fully
unit-testable:

- `blendLayout(from: TreeLayout, to: TreeLayout, t: number): TreeLayout` — returns
  a layout whose node positions are `lerp(from, to)` using **each node's local
  progress** (the per-generation stagger is computed here), with `bounds` lerped
  too. Link endpoints follow the blended node positions.
- `branchFade(t: number): number` — the cross-fade opacity envelope (≈1→0 over the
  first window, ~0 across the middle, 0→1 over the last window).

### 2. `src/frontend/src/composables/useLayoutMorph.ts` — owns the one tween

Watches `ui.orientation`. On a qualifying (manual) flip it:

1. captures `from = projectLayout(base, prevOrientation)` and
   `to = projectLayout(base, nextOrientation)`,
2. finishes any in-flight morph instantly (interruption discipline, as in 4a),
3. runs a single **linear** GSAP scalar `t: 0 → 1` over the `layoutSwitch` token.

Exposes a reactive `displayLayout` (the blended layout while morphing; the plain
projected layout when idle) and `morphProgress`. Under `prefers-reduced-motion`
it does not tween — it settles `displayLayout` to the target immediately.

### 3. Wiring — `TreeView`, `OakTree`, `TimeRail` (small additive changes)

`TreeView` already owns `baseLayout`, `ui.orientation`, and `oakRef`, so it hosts
`useLayoutMorph` and passes `displayLayout` to `OakTree` in place of today's
`layout`.

- **`OakTree`** renders from the layout it is given (unchanged), plus: the
  `oak__branches` and `oak__unions` group opacity is bound to
  `branchFade(morphProgress)`, and the branch curve *form* (the
  vertical-vs-horizontal `branchPath` shape) keys off the effective orientation
  (target form once past the midpoint — invisible at the swap, so no pop). The
  camera re-fit is an **animated** fit (reusing `glideTo`) to the new
  orientation's framing over the same window, replacing the instant `fit()` on the
  orientation watcher when motion is allowed.
- **`TimeRail`** opacity-cross-fades on the flip, driven by `TreeView` (which
  already wraps the rail in an opacity transition for the entrance).

## The stagger math

- **Global driver:** one GSAP scalar `t: 0 → 1`, **linear**, over `layoutSwitch`
  (700 ms). Easing is applied **per node** so it never double-applies.
- **Generation order:** distinct generations sorted oldest → newest (ascending
  generation; deepest ancestors first, since focus = 0 / ancestors negative /
  descendants positive), indexed `0 … G-1`.
- **Per-node local progress:**
  - `start(gen) = STAGGER_SPAN × index/(G−1)` — each generation begins slightly
    after the previous.
  - `local = clamp((t − start) / TRAVEL, 0, 1)`, then eased `power2.inOut`.
- **Lerp:** `node.x = from.x + (to.x − from.x) × eased(local)` (same for `y`);
  `bounds` lerped for the camera target. Positions only — medallion size and
  content are untouched.
- **Starting tunables:** `STAGGER_SPAN ≈ 0.15` (~100 ms of generation spread),
  `TRAVEL ≈ 0.85` (~600 ms per-node glide) → "~600 ms travel, ~700 ms total" per
  spec §6. Both are named constants (cf. the ceremony's `CEREMONY_TIME_SCALE`),
  expected to be tuned on the owner's live review.

## The 700 ms timeline

| Window | Nodes | Branches + unions | Year axis | Camera |
|---|---|---|---|---|
| 0 – ~120 ms | oldest generation begins gliding | fade **out** (→0) | fade **out** | begins glide |
| ~120 – ~580 ms | each generation ripples in to its new spot | hidden (~0); geometry swaps to the new orientation under cover | hidden | gliding to new framing |
| ~580 – 700 ms | newest generation lands | fade **in** (→1, new geometry) | fade **in** (new orientation) | settles |

Read as: *branches dissolve → medallions ripple across, oldest-first → branches
and the time axis resolve in the new orientation*, with the camera re-framing
throughout.

## Edge cases

- **Reduced motion** (`prefers-reduced-motion`): instant switch — no blend, no
  cross-fade, no camera glide (today's behavior). `useLayoutMorph` short-circuits
  via the existing `prefersReducedMotion()` helper.
- **Interruption** (rapid toggles): a second flip calls `inFlight.finish()` first
  — snaps the running morph to its target, then starts the next. No stranded nodes,
  no stacked tweens.
- **Manual-only guard:** the morph fires only on an explicit toggle — skip the
  watcher's first (immediate) run and require `ui.orientationExplicit === true`.
  The responsive auto-flip uses `applyResponsiveOrientation` (never sets the
  explicit flag) and first load is the immediate run, so both switch instantly;
  only `setOrientation` animates.

## Testing

- **`layoutFlip.spec.ts`** (pure, no DOM): `blendLayout` lerps positions at
  t = 0 / 0.5 / 1; per-generation `start` offsets ordered oldest→newest and
  bounded to `[0, STAGGER_SPAN]`; `branchFade` ≈ 0 across the middle and 1 at both
  ends.
- **`useLayoutMorph.spec.ts`** (GSAP mocked, as in `popupDock.spec`): an explicit
  toggle captures from/to and runs one tween; reduced-motion → no tween, instant
  settle; interruption finishes the in-flight morph; **no** morph on the initial
  tick or a responsive flip.
- **Component checks** (light): `OakTree` branch-group opacity tracks
  `morphProgress`; `TimeRail` cross-fades on orientation change.

## Non-goals

- **Branch path-morphing** (MorphSVG) — branches cross-fade, not geometrically
  morph, exactly as spec §6 deferred. Link topology is unchanged by an orientation
  flip, so there is nothing to re-route.
- **Animating the responsive auto-flip or first load.**
- Any change to the layout math, the data model, or the API.

## Reused seams (no change)

- `layout/projection.ts` — `projectLayout(base, orientation)`, the two endpoints.
- `motion/camera.ts` — `glideTo` for the camera re-fit.
- `motion/tokens.ts` — `layoutSwitch` (700 ms `power2.inOut`), already defined.
- `motion/reducedMotion.ts` — `prefersReducedMotion()`.
- `stores/uiStore.ts` — `orientation` / `orientationExplicit` / `setOrientation`.
