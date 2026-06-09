# Dockable, stackable panel rail + mobile hardening — design

**Date:** 2026-06-09
**Status:** Approved (brainstorm) — pending implementation plan
**Area:** `src/frontend` (Vue 3 SPA)

## Summary

Replace the two independent right-side surfaces in the Tree view — the **stats
panel** and the **person popup** — with a single **dockable, stackable panel
rail**. Both become panels of the same kind: each has a title bar (icon · title ·
controls), can be **minimized** or **expanded**, and stacks vertically on the
right. The rail is responsive:

- **Wide screens (≥ 768px):** a fixed-width rail docked beside the tree. Stats is
  pinned at the top; person panels scroll beneath it. An expanded person panel can
  pop out to a **"bigger view"** — the existing centered glass popup — for reading
  long biographies.
- **Narrow screens (< 768px):** the same column, full-width, with two extra
  affordances — **chips** (panels collapse to a vertical column of squares on the
  right edge to free the tree) and a single **← / → arrow** that toggles the whole
  rail between chips and full-width rectangles. No "bigger view" here.

Plus an **item-1 fix**: a slim mobile **menu header** so the navigation/search/
language/orientation controls stop wrapping off-screen.

This is purely a frontend change. The API, layout engine, and data model are
untouched.

## Goals

1. On narrow screens, **no control is hidden off-screen**; the tree keeps as much
   space as possible.
2. **Stats is reachable on mobile** (today it's `display:none` below 960px).
3. The **person popup becomes a dockable panel** that can be minimized,
   un-minimized, expanded, and closed — and multiple persons can be open at once,
   stacked.
4. Stats and person panels share **one consistent panel chrome** (icon, title,
   controls) so the two are visually distinguishable but behave alike.

## Non-goals

- No backend, layout-engine, or `family.json` changes.
- No new person data, search, or navigation features beyond what exists.
- No change to the Chronicle / Members / Timeline views' content — only the shared
  AppBar header is restyled for mobile.
- Drag-to-reorder panels is **out of scope** (stack order is open-order).

## The panel model

### Panel identity & types

Two panel types share one chrome:

| Type      | Icon  | Title              | Closable | Pinned |
|-----------|-------|--------------------|----------|--------|
| **Stats** | ⚜     | "Chronicle stats"  | No       | Yes (top) |
| **Person**| 👤    | person's full name | Yes      | No     |

Every panel renders a **title bar**: `icon · title · control buttons`. The icon +
title let the user tell stats from a person, and one person from another, at a
glance — including when minimized.

### Panel states

- **Minimized** — title bar only (the "rectangular block"). Controls: **expand
  (▢)**, and **close (✕)** for persons.
- **Expanded** — full content. Controls: **bigger view (⤢, desktop only)**,
  **minimize (–)**, **close (✕)** for persons. Stats expanded shows the four
  figures; stats has no close.

**Invariant:** at most **one person panel is expanded at a time**. Expanding a
person minimizes any other expanded person. Stats expansion is independent of this
invariant (stats may be expanded alongside an expanded person — it just stays
pinned at the top).

### Person panel content

The expanded person panel shows **exactly the content the current popup shows**:
portrait/initial, full name, *née* maiden name, lifespan, vocation, summary, and
the existing **normal ⇄ expanded (biography / residences / links)** toggle. To
avoid duplication, this content is extracted into a shared presentational
component (`PersonDetail.vue`) rendered by **both** the docked panel and the
bigger-view modal.

### Desktop rail (≥ 768px)

```
┌── tree ──────────────────┐ ┌─ rail (≈360px) ─┐
│                          │ │ ⚜ Chronicle  – │ ← pinned, not closable, no-scroll
│         oak              │ │   Members   48  │
│      (pan / zoom)        │ ├─────────────────┤
│                          │ │ 👤 Symon   ▢ ✕ │ ┐
│                          │ │ 👤 Anna  ⤢ – ✕ │ │ scrollable
│                          │ │   …expanded…    │ │ person
│                          │ │ 👤 Maryja  ▢ ✕ │ ┘ column
└──────────────────────────┘ └─────────────────┘
```

- The rail is a flex column docked right of the tree, fixed width (~360px — wider
  than today's 310px so biographies read). It does **not** overlap the tree.
- **Stats** occupies a pinned, non-scrolling region at the top.
- **Person panels** occupy a scrollable region beneath stats. Opening a new person
  appends it expanded (minimizing the previously-expanded one); the column scrolls
  while stats stays put.

**Bigger view.** An expanded person's **⤢** button pops it out into the existing
centered glass `PersonPopup` (scrim + blur) for distraction-free reading. While the
modal is open, the person remains in the rail (as a minimized bar). Closing the
modal returns focus to the rail. Bigger view exists **only** on wide screens.

### Mobile rail (< 768px)

The same stack, full-width, with **chips** and **one arrow** added (and bigger-view
removed). Two collective display modes, toggled by a single arrow tab positioned
just under the stats item:

**State 1 — Chips (default).** Every panel is a square chip in a vertical column on
the **right edge**; stats chip (⚜) pinned on top, then person chips (initials). The
tree gets the rest of the width. Arrow shows **←**.

**State 2 — Rectangles.** Tapping **←** expands **all** chips together into
full-width **minimized rectangles** (title bars) stacked vertically; stats on top.
Arrow flips to **→** (collapse back to chips).

**State 3 — One expanded.** In rectangles mode, tapping a minimized rectangle
expands it (full-width content); others stay minimized (single-expanded invariant);
the column scrolls while stats stays fixed at the top.

Transitions:

| From | Action | To |
|------|--------|----|
| Chips | tap **←** arrow | Rectangles, all minimized |
| Chips | tap a **chip** | Rectangles, **that panel expanded** (state 3) |
| Rectangles | tap **→** arrow | Chips |
| Rectangles | tap a minimized bar | that bar expanded (state 3) |
| any (no person open) | **click a person on the tree** | Rectangles, the new person expanded (state 3) |

Stats on mobile (per approval): participates as the **top chip** in chips-mode and
the **top fixed rectangle** in rectangles-mode; never closable.

**Rectangle width.** A rectangle fills the full width on narrow screens but is
capped at the desktop rail width (`min(100%, var(--rail-width))` ≈ 360px,
right-anchored), so on wider phones / landscape it reads "like desktop" rather than
stretching edge to edge.

## Control bar (item 1) — mobile menu header

Below 768px the current AppBar row (tabs + search + language + orientation) wraps
and pushes controls off-screen, and the large title/subtitle eats vertical space.
Replace it on mobile with a **slim single-row header**:

```
[☰]   Family Chronicle   [⌕]
```

- **☰** opens a dropdown sheet with **Views** (Chronicle / Tree / Members /
  Timeline), **Language** (RU / BE / EN), and **Layout** (↕ vertical / ↔
  horizontal).
- **⌕** reveals the search field **inline** in the header (replacing the brand
  area); Esc or blur collapses it back to the icon.
- The big title/subtitle collapse to the compact brand in the bar, reclaiming
  height for the tree.

Desktop AppBar is unchanged.

## Architecture

New and changed units, each with one clear purpose:

| Unit | Kind | Responsibility |
|------|------|----------------|
| `stores/panelStore.ts` | Pinia store | Source of truth for the rail: open panels & order, each person's min/expanded state, the single `expandedPersonId`, `statsMinimized`, mobile `railMode` ('chips' \| 'rectangles'), and `biggerViewId`. Enforces the single-expanded invariant and the transitions above. |
| `components/DockPanel.vue` | Presentational | The shared chrome: title bar (icon, title, control buttons via props/slots), minimized vs expanded body slot, chip rendering. Emits `expand` / `minimize` / `close` / `bigger`. Knows nothing about stats vs person. |
| `components/PanelRail.vue` | Container | Lays out the rail: pinned stats + scrollable person column (desktop) and chips-column + arrow + rectangles (mobile). Owns the responsive switch and the ←/→ arrow. Reads/writes `panelStore`. |
| `components/PersonDetail.vue` | Presentational | The person content (extracted from today's `PersonPopup`): portrait, name, lifespan, vocation, summary, biography/residences/links toggle. Rendered by both the docked person panel and the bigger-view modal. |
| `components/StatsPanel.vue` | Changed | Renders its four figures **inside a DockPanel**; loses its own border chrome. Content logic unchanged. |
| `components/PersonPopup.vue` | Changed | Becomes the **bigger-view modal** only (scrim + glass dialog wrapping `PersonDetail`). Desktop-only. |
| `components/AppBar.vue` | Changed | Desktop layout unchanged; adds the mobile menu header (☰ / brand / ⌕) + dropdown sheet below 768px. |
| `stores/selectionStore.ts` | Changed | Keeps its one job — fetching **the expanded person's detail** + the normal/expanded biography mode. Because only one person is expanded at a time, a single detail fetch (as today) still suffices; minimized bars/chips show the name from the already-loaded `PersonSummary`. Panel list/order/states move to `panelStore`, which drives the fetch when `expandedPersonId` changes. |
| `views/TreeView.vue` | Changed | Renders `PanelRail` instead of the standalone `StatsPanel` + `PersonPopup`; wires tree `@select` → `panelStore.openPerson(id)` (→ state 3 on mobile). |

### State & routing

- The route `/person/:id` continues to deep-link a person: on load it opens that
  person **expanded** (state 3 on mobile). The route reflects the **currently
  focused/expanded** person; additional open panels are session state and are not
  encoded in the URL. Closing the focused person navigates to `/tree`.
- `panelStore` holds an ordered list of person panel descriptors `{ id, state }`
  plus `expandedPersonId`. `openPerson(id)` adds-or-focuses and expands it
  (minimizing others); `minimize`/`expand`/`close` mutate one; stats is modeled as
  a fixed leading entry that ignores `close`.

### Responsive switch

Two tokens are added to `tokens.scss`: a breakpoint `$bp-rail: 768px` and a
`--rail-width: 360px` (the desktop rail width, reused as the mobile rectangle cap).
The breakpoint drives the desktop-rail ⇄ mobile-chip-rail switch and the AppBar
header swap. The existing ad
hoc 640px / 960px media queries in `TreeView`/`PersonPopup`/`AppBar` are
consolidated onto this token. Below the breakpoint the rail is an **overlay** on
the tree's right edge (tree uses full width); at/above it the rail is a **flex
sibling** beside the tree.

### Focus / accessibility

- Panels are `role="region"` with `aria-label` = title; control buttons have
  localized `aria-label`s; the bigger-view modal keeps `role="dialog"`
  `aria-modal="true"` and Esc-to-close.
- The ☰ menu sheet is keyboard-navigable and closes on Esc / outside-click.
- Single-expanded changes move focus to the newly expanded panel.

## Localization

New keys in `i18n/messages/{ru,be,en}.ts`:

- `panel.minimize`, `panel.expand`, `panel.close`, `panel.biggerView`,
  `panel.collapseToChips` (→ arrow), `panel.expandPanels` (← arrow),
  `panel.statsTitle` (reuse `stats.title`).
- `nav.menu`, `nav.views`, `nav.language`, `nav.layout` for the mobile sheet.

ru is primary; be / en mirror it. A messages parity test already guards key sets.

## Testing

- **panelStore** (Vitest): open/focus/close, single-expanded invariant, stats
  not-closable, `railMode` toggles, chip-tap → state 3, tree-select → state 3,
  deep-link opens expanded.
- **DockPanel**: renders minimized vs expanded vs chip; emits the right events; no
  close button when `closable=false`.
- **PanelRail**: stats pinned & non-scrolling; person column scrolls; responsive
  rendering (chips/arrow below breakpoint, side rail above); arrow transitions.
- **PersonDetail**: shared content renders identically for panel and modal.
- **AppBar**: desktop row intact; mobile menu sheet opens and lists views /
  language / layout; nothing wraps off-screen.
- **PersonPopup**: retained tests, re-scoped to the bigger-view modal.
- **Mobile QA (gstack):** dogfood the narrow-screen flows (chips ⇄ rectangles,
  chip-tap, tree-select, menu header) and fix visual issues found.

## Implementation notes

- Build the panel chrome with the **frontend-design** skill so the rail/chips read
  as engraved Family-Chronicle furniture (gilt borders, parchment gradients,
  Cinzel titles), not generic cards.
- Keep components small and focused; `PanelRail` is the only unit that knows the
  responsive layout, so the desktop/mobile difference lives in one place.

## Out of scope / future

- Drag-to-reorder or detach/float panels.
- Persisting open-panel sets across reloads.
- Bigger-view on mobile (intentionally omitted).
