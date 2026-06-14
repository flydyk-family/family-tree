# Choreographed interactions — three medallion & media micro-interactions

**Date:** 2026-06-15
**Status:** approved in brainstorming; pending implementation plan
**Parent spec:** [`2026-06-12-oak-motion-design.md`](2026-06-12-oak-motion-design.md) §4–§5 (this is the third of that program's four delivery PRs — "Choreographed interactions", scoped down by the owner).

## 1. Goal

The oak-motion program's PR 3 ("Choreographed interactions") originally listed six items
across spec §4–§5. An inventory against the landed code found that three are **already
shipped** and one is moot:

- **Selection highlight** and **search-match highlight** — done, via the GSAP overlay
  crossfade to the green-gold / gold frame image ([`fade.ts`](../../../src/frontend/src/motion/fade.ts),
  [`PersonMedallion.vue`](../../../src/frontend/src/components/PersonMedallion.vue)).
- **Popup open cascade** — done in PR #80 (`[data-cascade]` stagger).
- **Dock-morph × video** (transform-only flight) — done in PR 4a.

The owner scoped this PR to the **three remaining micro-interactions** that genuinely add
motion the app lacks:

1. **Medallion hover lift** — a calm scale + frame brighten on pointer hover.
2. **Portrait fade-in** — the medallion still fades in over its dark mount once it loads.
3. **Comes-alive shimmer** — a one-shot "border brighten + breath" on the popup portrait
   when its living clip starts playing.

**Explicitly out of scope** (owner's call): search-match pulse, lightbox expansion, the
popup close-cascade, and reviving the finale pulse (see §6).

This stays inside the program's architecture: every tween reads `motion/tokens.ts`, checks
`prefersReducedMotion()`, and is a GSAP tween fired by a Vue handler/watcher — components
never import `gsap` directly. Personality A (calm, no overshoot) holds throughout.

## 2. Architecture

One new module, **`src/frontend/src/motion/interactions.ts`**, holds the two genuinely new
tween helpers. The portrait fade-in reuses the existing opacity helpers — no new code path
for it beyond wiring.

| Unit | Responsibility | Depends on |
| --- | --- | --- |
| `motion/interactions.ts` (new) | `hoverLift(card, lifted)` and `comesAliveShimmer(ring)` — self-contained GSAP tweens, each with a reduced-motion jump-to-end branch. | `gsap`, `motion/tokens`, `motion/reducedMotion` |
| `motion/fade.ts` (existing) | `fadeTo` / `setOpacity` — reused as-is for the portrait fade-in. | — |
| `PersonMedallion.vue` | Seeds the still `<image>` at opacity 0; fades it on load (incl. the cached-on-mount path). | `fade.ts` |
| `OakTree.vue` | Per-node `@pointerenter`/`@pointerleave` → `hoverLift`; gated while the entrance ceremony is active. | `interactions.ts` |
| `PersonDetail.vue` | `<video>` `@playing` → `comesAliveShimmer`, fired once per popup mount. | `interactions.ts` |

**State-first rule (unchanged):** none of this gates store state, deep links, tests, or
reduced-motion users. Motion is layered on top.

## 3. Medallion hover lift

- **Trigger:** [`OakTree.vue`](../../../src/frontend/src/components/OakTree.vue)'s per-node
  `<g class="oak__node">` already owns `@click`; add `@pointerenter`/`@pointerleave` that
  call `hoverLift(cardEl, true)` / `hoverLift(cardEl, false)`, where `cardEl` is that node's
  inner `.oak__medallion-card` group.
- **Tween:** scale the `.oak__medallion-card` group `1.0 → 1.03` (in: 250 ms `power1.out`;
  out: 300 ms `power1.out`) about its own centre, plus a faint frame brighten
  (`filter: brightness(~1.06)` on the gold frame `<image>`). The lift lives on the **child**
  card group, so it composes with the node's layout `translate` without fighting it.
  `overwrite: 'auto'` so a fast enter→leave doesn't stack.
- **Gating:** no-op while the entrance ceremony is active (the ceremony drives node
  transforms; a hover tween on the same subtree would conflict). OakTree learns this from a
  boolean prop fed by `TreeView`, which already owns `entranceActive` and already threads
  `entrance-cues` down the same way.
- **Reduced motion:** `hoverLift` is a no-op (the resting state is the only state).
- **Input:** pointer devices only. Touch has no hover, so there is nothing to trigger and
  nothing to clean up; we do not add focus-driven lift in this PR.

## 4. Portrait fade-in

- **Where:** the still `<image>` in [`PersonMedallion.vue`](../../../src/frontend/src/components/PersonMedallion.vue)
  (the SVG medallion portrait). The monogram fallback (no portrait) is unaffected.
- **Mechanism:** seed the `<image>` at opacity 0 (`setOpacity`), then `fadeTo(imageEl, 1)`
  (~300 ms `feedback`) on the image's `@load`. It reveals over the existing dark
  `.oak__mount` ellipse, which already serves as the tinted-disc placeholder — **no new
  element**.
- **Cached images:** if the image is already complete at mount (`complete` /
  `naturalWidth > 0`), fade immediately rather than waiting for a `@load` that won't fire.
- **Reduced motion:** `fadeTo` already branches to `gsap.set` (instant) — the still simply
  appears on load.
- **Scope:** medallion stills only. The popup portrait already arrives inside the growing
  FLIP card (PR #80) and is not double-faded here.

## 5. Comes-alive shimmer

- **Trigger:** the `<video>` in [`PersonDetail.vue`](../../../src/frontend/src/components/PersonDetail.vue)
  gains `@playing`, which calls `comesAliveShimmer(portraitEl)` where `portraitEl` is the
  `.detail__portrait` circle (an 84 px disc with a `1px solid var(--glass-border)` ring —
  the shimmer target).
- **Once per mount:** a flag guards against re-firing. `loop` restarts do not re-emit
  `playing`, but the flag makes the once-only behaviour explicit and survives any future
  pause/resume. Reset when a different person is shown (alongside the existing media-failure
  resets).
- **Tween ("border brighten + breath"):** a one-shot, there-and-back timeline built on the
  `feedback` token (≈300 ms each way, symmetric ease) that tweens the ring's border-color
  `--glass-border → --gilt → --glass-border` and scales the disc `1.0 → 1.03 → 1.0`. Subtle
  by design — it marks the moment without pulling the eye off the playing clip. No looping
  animation over the video.
- **Reduced motion:** no-op.

## 6. Out of scope / noted

- **Search-match pulse**, **lightbox expansion**, and the **popup close-cascade** — deferred
  by the owner; not built here.
- **Orphaned finale pulse:** [`entrance.ts`](../../../src/frontend/src/motion/entrance.ts)
  pulses `.oak__gilt-band`, a class that exists in **no live component** (the medallion was
  redesigned to image frames after that code was written), so the ceremony's "every
  medallion pulses gilt at the finale" is already a dead no-op. This PR does **not** revive
  it; it is recorded as known dead code in
  [`technical-debt.md`](../../reference/technical-debt.md).

## 7. Testing

- **`interactions.spec.ts`** (new, mirrors `fade.spec.ts`): GSAP mocked; assert `hoverLift`
  and `comesAliveShimmer` target the right element/props/durations, and that each takes the
  reduced-motion `gsap.set` jump-to-end branch.
- **`PersonMedallion.spec`:** the still seeds at opacity 0 and fades on load; the
  cached-on-mount path fades immediately; the monogram fallback path is untouched.
- **`PersonDetail.spec`:** `@playing` fires the shimmer exactly once; a second `playing`
  does not re-fire; reduced motion → no shimmer; the once-flag resets on person change.
- **`OakTree.spec`:** pointer-enter/leave call hover-lift; hover is gated (no-op) while the
  ceremony is active.
- State-first / store tests keep asserting synchronously. Run Vitest with `--pool=forks`.

## 8. Docs (land in the same PR)

- [`features/oak-tree.md`](../../reference/features/oak-tree.md) — add the hover-lift and
  portrait-fade-in rows.
- [`features/person-details.md`](../../reference/features/person-details.md) — document the
  comes-alive shimmer.
- [`roadmap.md`](../../reference/roadmap.md) — move these three off the roadmap into shipped;
  update the live-vs-roadmap callout.
- [`technical-debt.md`](../../reference/technical-debt.md) — record the orphaned finale pulse.

## 9. Delivery

One PR off `main` (`feat/choreographed-interactions`) → owner reviews and merges; no
self-merge. Animation *feel* is judged by the owner in a real browser — the headless preview
starves `requestAnimationFrame` and reports a 0×0 viewport, so the hover lift, fade, and
shimmer can't be felt there; the reduced-motion jump-to-end paths and event wiring **can** be
verified headless and in unit tests.
