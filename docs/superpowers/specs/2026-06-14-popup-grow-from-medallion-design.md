# Popup grows from the clicked medallion — design

**Date:** 2026-06-14
**Status:** approved in brainstorming (owner chose "grow + cascade"); pending implementation plan
**Scope:** a small addition to **PR #80** (same `feat/popup-dock-morph` branch) — the spec §4 "popup open" motion, realized as a shared-element grow from the medallion plus a content cascade. Reuses the FLIP machinery built for the dock morph.

## Why

Clicking a medallion on the tree opens the bigger-view popup (`onSelect` → `openBiggerView`), but with **no animation** — it just appears. The rail↔popup dock morph already gives the app a shared-element motion language; the medallion-open should match it: the popup should **grow out of the medallion you clicked**, and its content should **cascade in**.

## Behaviour

On a desktop medallion click:

1. **Grow (FLIP).** The glass dialog flies from the clicked medallion's screen rect to its centered resting place — translate + scale + fade — exactly mirroring "undock grows from the rail card." ~450 ms (`motionTokens.morph`). Reuses `flipInvert` + `gsap.fromTo`.
2. **Cascade.** Inside the dialog, the content reveals in sequence — portrait → name/lifespan → detail rows — each fading and rising a few px, staggered (~80 ms apart, ~400 ms total, `motionTokens.cascade`). Kept gentle so the grow stays the hero motion.

Both layers start together (state-first: open the store synchronously, then animate on the next tick).

### Boundaries

- **Close is unchanged** — the popup still docks back to the rail (existing morph) or `✕` removes it. Only the *open-from-medallion* path is new.
- **Reduced motion** → instant: no grow, no cascade (the existing `prefersReducedMotion()` gate returns null / the cascade is skipped).
- **Desktop only** — medallion clicks never open the popup on mobile (`onSelect` already guards `!isMobile`).
- **The medallion stays in the tree** and does **not** carry the dialog's `data-flip-id`, so the dock morph (which pairs the dialog with the rail card by `dock-card-{id}`) is untouched.
- **Re-entrancy / interruption:** opening a new medallion while a popup is open completes any in-flight morph first, then grows from the new medallion (same `finish()`-first guard as the dock morph).

## Architecture

Reuse and extend the existing seams; no new top-level module.

- **`motion/popupDock.ts`** — add `captureGrowMorph(sourceEl: Element): { play(id: string): DockMorph | null } | null`:
  - Null under reduced motion.
  - Captures `sourceEl`'s screen rect now (before the open mutation).
  - `play(id)`: finds the dialog (`[data-flip-id="dock-card-${id}"]`); if absent → null. Flies it from the source rect via `flipInvert` + `gsap.fromTo` (translate + scale + fade, `morph` token, `clearProps`). Then **cascades** the dialog's `[data-cascade]` descendants: `gsap.from(items, { opacity: 0, y: 8, duration: cascade, ease, stagger })`. Returns a `DockMorph` whose `finish()` completes both.
  - Shares `flipInvert`, `rectOf`, the `DockMorph` type, and the reduced-motion gate with `captureDockMorph` (no duplication of the FLIP math).
- **`composables/useDockMorph.ts`** — add `openFrom(sourceEl: Element | null, mutate: () => void): Promise<void>`: `finish()` the in-flight morph → `captureGrowMorph(sourceEl)` → `mutate()` (synchronous) → `await nextTick()` → `play(id)`. Mirrors the existing `morph()` orchestration.
- **`components/OakTree.vue`** — add `:data-node-id="node.id"` to the medallion `<g>` so the clicked medallion is findable by id.
- **`components/PersonDetail.vue`** — add `data-cascade` to the three reveal blocks, in visual order: the portrait, the name/lifespan/vocation identity block, and the details body. (PersonDetail is shared with the rail panel; the attribute is harmless there because only the morph — scoped to the open dialog — queries it.)
- **`views/TreeView.vue`** — in `onSelect(id)`, capture the medallion element (`document.querySelector('[data-node-id="…"]')`) **before** opening, and run the open through `useDockMorph().openFrom(medallionEl, () => panel.openBiggerView(id))` in the existing `router.push(...).finally(...)` flow (desktop branch only). The route/rail wiring is otherwise unchanged.

The medallion's rect is captured synchronously at click time (the camera does not move on select, so the rect is still valid when the dialog mounts a tick later).

## Testing

- **Unit (GSAP mocked):** `captureGrowMorph` — null under reduced motion; `play(id)` null when no dialog; the grow `gsap.fromTo` gets the `flipInvert` of the source rect + the `morph` token + `clearProps`; the cascade `gsap.from` targets the dialog's `[data-cascade]` items with the `cascade` token + a stagger; `finish()` completes the tweens.
- **Unit:** `useDockMorph.openFrom` — captures before mutate, plays after `nextTick`, finishes an in-flight morph first, reduced-motion still opens without playing.
- **Component:** the medallion `<g>` carries `data-node-id`; `PersonDetail` exposes `[data-cascade]` blocks in order.
- **Whole-suite + `vue-tsc` + live** verification (the headless preview starves rAF, so the owner confirms the visible grow + cascade feel; automated checks cover wiring + the pure math).

## Delivery

New commits on `feat/popup-dock-morph` → updates **PR #80**. TDD, two-stage review per task, live sign-off with the owner.

## Out of scope

- A symmetric "shrink back into the medallion" on close (close still docks to the rail).
- The other §4 micro-interactions (hover lift, selection/search pulses) — those remain PR 3.
