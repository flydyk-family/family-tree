# Dock control v2 + a reliable dock/undock morph — design

**Date:** 2026-06-14
**Status:** approved in brainstorming (visual iteration with the owner); pending implementation plan
**Scope:** a revision of PR #80 (the popup↔dock half of the oak-motion spec §6) based on owner review. Lands as **new commits on the existing `feat/popup-dock-morph` branch**, updating PR #80 — not a new PR.

## Why this revision

Owner review of the first cut surfaced two problems:

1. **The dock control didn't fit.** The corner `⤡` was cryptic; the replacement gilt edge-tab clashed with the glass popup (wrong material), and its hover nudge pushed the arrow *outside* the tab.
2. **The morph was invisible — dock/undock was instant.** The control used GSAP **Flip**'s "swap by `data-flip-id`" across the popup's `v-if` mount/unmount. In practice Flip did not fly the *newly mounted* element from the removed one's bounds, so nothing animated (independent of `prefers-reduced-motion`).

This design fixes both: a glass-native control with a satisfying hover, and a deterministic morph that is guaranteed to animate.

## 1. Dock control — a chevron that builds itself into a button

Replaces the gilt tab. `✕` (destructive close) stays in the corner, unchanged.

- **Placement:** on the existing `.popup__shell`, floating ~12 px **off** the dialog's right edge, vertically centered (it points at the rail, which is always top-right). Keeps `data-test="popup-dock"`.
- **Rest:** a single `›` chevron (`ti-chevron-right` equivalent — the app draws its own glyph), **optically centered**, low-contrast (`--ink-soft`/tertiary), with **no visible body** — it floats just off the edge.
- **Hover / focus-visible:** a **rounded-square glass body** (the dialog's own material: translucent fill + hairline `--glass-border`, ~9 px radius) **scales in (~0.4→1) and fades** in behind the chevron over ~190–200 ms (gentle ease). Simultaneously the chevron **brightens** to `--ink` and performs a **confident directional tick** — travels **~7 px right, briefly holds at the far point, then eases back to center** (~480 ms total) — leading the eye toward the rail. It should *suggest "dock,"* not flinch (amplitude/timing are tunable, but err bold over shy). The glyph always returns to and rests at center, and never leaves the body.
- **Affordance / a11y:** a real `<button>` — `aria-label` = the existing i18n key `panel.dock` (no new strings), keyboard `Enter`/`Space`, and a `:focus-visible` ring that's visible even at rest (since there's no body at rest).
- **Reduced motion:** the body appears without the scale/fade and the chevron does not tick; click still docks (instantly).

## 2. Dock / undock flight — deterministic FLIP

Drop GSAP **Flip** entirely (and its `gsap/Flip` import + registration). Rebuild the morph as an explicit FLIP we fully control, preserving the **state-first** rule (the Pinia store mutates synchronously and stays correct; motion is layered on top).

**Pairing:** the popup dialog and the person's rail card already share `data-flip-id="dock-card-${id}"`. We use that to locate the source and destination elements.

**Sequence** (in `useDockMorph`):
1. **Capture (before mutate):** record the **source** element's screen rect — the element currently present for that person: the **rail card** on undock, the **dialog** on dock — via `[data-flip-id="dock-card-${id}"]`. Also record the rects of the other rail cards (for reflow, below).
2. **Mutate** the store synchronously (`undock(id)` / `closeBiggerView()`), then `await nextTick()`.
3. **Play:** find the now-present **destination** element (same flip-id), measure its rect, and animate it **from** the source rect:
   `gsap.fromTo(dest, { x: dx, y: dy, scaleX: sx, scaleY: sy, opacity: 0.35, transformOrigin: 'top left' }, { x: 0, y: 0, scaleX: 1, scaleY: 1, opacity: 1, duration: morph, ease, clearProps: 'transform,opacity' })`
   where `{dx, dy, sx, sy}` is the FLIP inverse of `(sourceRect, destRect)`.
   - **Undock:** destination = the **dialog** → it **grows out of** the rail slot.
   - **Dock:** destination = the **rail card** → it **shrinks in** from the popup's rect.

**Neighbour reflow:** for each *other* rail card that changed position between the before/after captures, `gsap.from(el, { x: prevLeft − newLeft, y: prevTop − newTop, duration: morph, ease, clearProps: 'transform' })` so the rail panels **glide** as the slot opens/closes instead of jumping.

**Tokens / guards:** `morph` (450 ms, `power2.inOut`). **Reduced motion** → skip all of the above (instant, state already correct). **Re-entrancy** → a second dock/undock **finishes the in-flight tween(s) first** (`progress(1)`).

**Purity for testing:** the FLIP inverse is a pure function `flipInvert(source, dest) → { x, y, scaleX, scaleY }` (numbers in, numbers out — no DOM, no GSAP), unit-tested directly.

## Module shape

- **`motion/popupDock.ts`** (rewrite): exports `flipInvert(source, dest)` (pure) and `captureDockMorph(id)` → `{ play(): DockMorph | null }` / `DockMorph.finish()`, implemented with `gsap.fromTo` / `gsap.from`. Remains the **only** file importing `gsap`; the `gsap/Flip` import and `registerPlugin(Flip)` are removed. Reduced-motion gate unchanged (returns `null`).
- **`composables/useDockMorph.ts`**: thread the person **id** into the capture — `undock(id)` uses `id`; `dock()` reads `panel.biggerViewId` **before** mutating. Same `finish → capture → mutate → nextTick → play` ordering.
- **`PersonPopup.vue`**: replace the gilt `.popup__dock-tab` with the floating-chevron button (`.popup__dock-chevron`): a `<button>` with the chevron glyph and the rounded-square body (a `::before` or a body span that scales/fades on hover/focus) and the chevron-tick keyframe. Keep `.popup__shell`, the dialog's `data-flip-id`, and `✕`.
- **`DockPanel.vue` / `PanelRail.vue`**: unchanged — they already carry `data-flip-id`, which both the morph and the reflow read by selector.

## Delivery

New commits on `feat/popup-dock-morph` → updates PR #80. TDD throughout, two-stage review per task. The animation feel is **verified live with the owner** (the headless preview starves `requestAnimationFrame`, so automated checks cover wiring + the pure math, and the owner confirms the visible motion).

## Testing

- **Unit (no DOM/GSAP):** `flipInvert` — translate + scale from two rects, including equal rects → identity, and off-origin cases.
- **Unit (GSAP mocked):** `captureDockMorph` — reduced motion → `null`; `play()` calls `gsap.fromTo` with the `morph` token, the computed inverse, and `clearProps`; `finish()` → `progress(1)`; missing source/destination → `null` (no throw).
- **Unit:** `useDockMorph` — correct id passed (dock reads `biggerViewId` pre-mutate; undock uses its arg); state-first ordering (mutation before any await, play after `nextTick`); re-entrancy finishes the prior morph; reduced-motion still mutates without playing.
- **Component:** `PersonPopup` renders the floating-chevron button (`data-test="popup-dock"`), the dialog carries `data-flip-id`, and dock/scrim/Esc route through the morph (assert store state after `nextTick`); `✕` still closes instantly.
- **Whole-suite + `vue-tsc` + live** verification before updating the PR.

## Out of scope

- A drag/"pull-to-dock" gesture (considered, set aside — the floating chevron is a press control).
- Any change to the layout-switch morph (that is PR 4b).
