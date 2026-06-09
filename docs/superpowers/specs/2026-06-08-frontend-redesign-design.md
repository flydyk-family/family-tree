# Frontend Redesign — Design Spec

- **Date:** 2026-06-08
- **Status:** Draft for review
- **Branch:** `claude/condescending-antonelli-7ec7e8`
- **Design system:** see [`DESIGN.md`](../../../DESIGN.md) (visual tokens, type, components)
- **Prototype:** interactive v1 — `.superpowers/brainstorm/.../tree-prototype.html` (validated continuous axis + V↔H flip)

## 1. Purpose

Re-skin and re-shape the family-tree SPA into a vintage **"chronicle page"** — a sepia
heraldic-engraving look (light & warm, "little gothic") — and add a **vertical↔horizontal
orientation switch** for the tree on both mobile and desktop. The information architecture
must make room for the roadmap (family selector, search, directory/table, members, timeline,
edit) without building all of it now.

## 2. Goals & non-goals

**Goals**
- A coherent, beautiful framed-page visual per `DESIGN.md`, applied across the SPA.
- A **continuous, zoom-adaptive time axis** (position = birth year; tick density follows zoom),
  presented inside a **static decorative rail** (frame fixed, ticks/era-bands dynamic).
- **Orientation switch** (vertical ⇄ horizontal) that re-lays-out the oak and moves the time
  axis (left rail ⇄ bottom rail), on desktop and mobile.
- Richer **person medallions** (engraved frames + nameplates, colour portraits) — no flat/plastic look.
- Roadmap-ready **chrome/IA**: top tab nav + control cluster (search, language full-name, orientation),
  stats panel, with hooks for future views.
- Keep tests green; add tests for the new layout/axis logic.

**Non-goals (this iteration)**
- No edit/write UI. No real portrait assets pipeline (placeholders remain until provided).
- No full build-out of Members / Timeline / Directory views — tabs may route to **placeholders**.
- No backend/data-model changes (read-only graph from `/api` as today).
- No dark mode.

## 3. Locked design decisions

See `DESIGN.md` "Decisions log". In brief: sepia heraldic engraving; framed chronicle page
(adaptive SVG/CSS chrome over a parchment texture); brighter/greener; no crest; controls = B,
stats panel = A; Cinzel (light) title; continuous adaptive axis; **v1 visual baseline**;
colour portraits with an optional heirloom tint.

## 4. Information architecture

- **Top tab nav:** `Chronicle` · `Tree` (default, built) · `Members` · `Timeline`.
  Only **Tree** is functional this iteration; the others are visible **placeholders** that
  reserve the slot for roadmap work (Members → directory/table; Timeline → time view).
- **Control cluster:** search (jump/highlight person — wire to a simple client filter now,
  full search later), **language selector** (full name: Русский / Беларуская / English),
  **orientation toggle** (Vertical / Horizontal).
- **Family selector** (roadmap multi-family): reserve a slot in the title/bar area; not built now.
- **Stats panel:** computed from the loaded graph (counts) — real values, A-skin card.

## 5. The dynamic tree + axis (core engineering)

The current layout hardwires **time = Y** (`treeLayout.ts`: `y = scale.yForYear`). To support
the flip cleanly, refactor to an **orientation-agnostic** model:

- **Layout produces abstract coordinates** per node: `time` (from birth year) and `spread`
  (tidy sibling layout). Layout math stays orientation-free.
- **A projector** maps `(time, spread) → (x, y)` by orientation:
  - *vertical:* `x = spread`, `y = yForYear(time)` (present at top, older at bottom — as today).
  - *horizontal:* `x = xForYear(time)`, `y = spread` (older left, newer right).
- **`timeScale.ts`** already does continuous mapping + `viewportTicks` (adaptive `NICE_STEPS`).
  Extend it to expose the axis in either direction; reuse `chooseTickStep` unchanged.
- **TimeRail component** (replaces bare `YearAxis`): a framed rail that renders ticks **and**
  optional **era bands** (century/era ranges) positioned from the *same* viewport transform,
  so they pan/scale with the oak. Rail sits left (vertical) or bottom (horizontal).
- **Pan/zoom** (`usePanZoom`) is already orientation-neutral; keep. On flip, recompute layout,
  re-fit (`focusBounds`), and animate the transpose.
- **Branches/unions** redraw from projected coordinates; descent curves bend along the time axis
  (vertical → S-curve in Y; horizontal → S-curve in X).

**Engineering follow-up (carried from the original spec):** replace the pragmatic
`separateOverlaps` nudge with a contour-based tidy layout so medallions never overlap by
construction — especially important since cards are large and the flip changes the packing axis.

## 6. Component architecture (Vue)

New / changed under `src/frontend/src/`:

- **`components/AppFrame.vue`** (new) — ornamental page border + corners (CSS now; raster asset slot later).
- **`components/AppBar.vue`** (rework) — TabNav + control cluster; hosts the controls below.
  - `components/TabNav.vue`, `components/SearchField.vue`, `components/LanguagePicker.vue`
    (rework to full language names), **`components/OrientationToggle.vue`** (new).
- **`components/TimeRail.vue`** (new; replaces/absorbs `YearAxis.vue`) — framed rail, dynamic ticks + era bands, orientation-aware.
- **`components/OakTree.vue`** (rework) — consume projected coords; orientation prop; branch/union redraw; flip transition.
- **`components/PersonMedallion.vue`** (rework) — engraved frames (keep classic-gilt / modern-double-rule era split), richer nameplate (gilt inner rule, shadow, vignette), colour portrait or cameo silhouette placeholder.
- **`components/StatsPanel.vue`** (new) — A-skin card; counts from the graph.
- **`components/PersonPopup.vue`** (restyle to tokens).
- **`layout/treeLayout.ts`** (refactor) — emit `(time, spread)`; add `layout/projection.ts` (new) for orientation projection.
- **`layout/timeScale.ts`** (extend) — directional axis helpers.
- **`stores/`** — add UI state: `orientation` ('vertical'|'horizontal'), `activeTab`, persisted to localStorage + reflected in the route/query where useful.
- **`styles/tokens.scss`** (rework) — replace palette with the `DESIGN.md` tokens; add control/panel/medallion tokens; load Cinzel / EB Garamond / UnifrakturMaguntia.

## 7. Theming & assets

- All colours via CSS custom properties from `tokens.scss` (per `DESIGN.md`).
- Fonts: self-host or Google/Bunny Fonts (Cinzel, EB Garamond, UnifrakturMaguntia) — pick at impl time; must cover Cyrillic.
- **Chrome-as-raster (optional):** `AppFrame` and panel backgrounds may use a high-res parchment/ornament
  image (the reference art, upscaled, or regenerated) as a background layer; the oak stays SVG on top.
  v1 baseline ships CSS-drawn chrome; raster is a drop-in enhancement.

## 8. Orientation switch — behaviour

- Toggle in the top bar (segmented Vertical | Horizontal), default **vertical**; choice persisted.
- On switch: recompute projected coordinates, move the TimeRail (left ⇄ bottom), re-fit the view,
  animate the transpose (~300ms). Pan/zoom state reset to a sensible fit.
- Mobile: both orientations supported; horizontal is often better on narrow-tall phones for deep lineages.

## 9. Testing strategy

- **Unit (Vitest):**
  - `projection.ts` — `(time,spread)→(x,y)` for both orientations; round-trip/identity checks.
  - `timeScale.ts` — directional ticks; `chooseTickStep` density at sample zooms (extend existing tests).
  - `treeLayout.ts` — abstract `(time,spread)` output stable regardless of orientation.
  - Stores — orientation/tab state + persistence.
  - Components — TimeRail tick/era rendering, OrientationToggle, PersonMedallion era variants, StatsPanel counts.
- **Integration:** existing API tests unchanged (no backend change).
- Keep the current 132 frontend + 36 backend tests green; add the above.

## 10. Scope summary

**In:** new visual system + tokens; AppFrame/chrome; reworked AppBar + controls (tabs, search,
full-name language, orientation toggle); TimeRail with continuous adaptive ticks + era bands;
orientation-agnostic layout + projection + flip; richer medallions; StatsPanel with real counts;
restyled popup; tests.

**Out (reserved/placeholder):** Members/Timeline/Directory views, family selector, edit mode,
real portrait assets, dark mode, contour layout (noted as follow-up), raster chrome assets (optional later).

## 11. Open questions

1. Tabs: ship `Members`/`Timeline` as disabled placeholders, or hide until built? (Default: visible-but-disabled.)
2. Search this iteration: live highlight/jump on the current graph, or defer entirely? (Default: simple client-side highlight.)
3. Fonts: self-host vs CDN. (Default: CDN now, self-host before release.)
