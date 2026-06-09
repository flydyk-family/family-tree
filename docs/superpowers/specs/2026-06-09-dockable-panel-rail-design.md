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

- **Desktop mode (width ≥ 1200px and height ≥ 560px):** a fixed-width rail docked
  beside the tree. Stats is pinned at the top; person panels scroll beneath it.
  Clicking a person opens a **"bigger view"** popup; the dock/undock buttons move it
  between the popup and an in-rail expanded block.
- **Compact mode (width < 1200px or height < 560px — phones either orientation,
  tablets portrait, narrow/short windows):** the same column, full-width, with two
  extra affordances — **chips** (panels collapse to a vertical column of squares on
  the right edge to free the tree) and a single **← / → arrow** that toggles the
  whole rail between chips and full-width rectangles. No "bigger view" here.

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

### Desktop rail (desktop mode — width ≥ 1200px and height ≥ 560px)

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

**Bigger view & docking (desktop).** On desktop, **clicking a person on the tree
opens the centered glass `PersonPopup`** (scrim + blur) for distraction-free
reading — not an immediate rail block. The popup and the docked block are
**mutually exclusive**: while the popup is open the person is removed from the
rail. Controls:

- Popup **dock (⤡)** → returns the person to the rail as an **expanded block**;
  **✕** closes the person entirely; scrim/Esc dock back (non-destructive).
- Rail bar **maximize (▢)** → expands the bar **in the rail** (never opens the
  popup); rail bar/block **undock (⤢)** → opens the popup.
- Opening a different person closes the current popup.

Implementation note: only the tree-click path opens the popup (after navigation
settles); the rail's `expandPerson` never sets `biggerViewId`, so route
round-trips from expanding a bar cannot pop it out. Bigger view exists **only** in
desktop mode.

### Mobile / compact rail (compact mode — width < 1200px or height < 560px)

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

### Responsive switch & supported viewports

There are **two layout modes**, selected by one rule (a single shared media query
`MOBILE_MEDIA_QUERY`, mirrored by the SCSS tokens so JS and CSS agree):

- **Compact** — `width < 1200px` **OR** `height < 560px`. Slim ☰ menu header
  (tabs/search/language/orientation move into a dropdown sheet) + overlay chip
  rail. Used by phones (either orientation), tablets in portrait, and any narrow
  or short window (incl. landscape phones and narrow desktop windows).
- **Desktop** — `width ≥ 1200px` **AND** `height ≥ 560px`. Full nav row + masthead
  title + a fixed `--rail-width: 360px` overlay rail on the right.

The 1200px width threshold is chosen so the full nav row (tabs + search + language
+ orientation) renders at **natural width with no shrinking or clipping** in the
widest locale (Russian); measured natural fit is ≈ 1150px, so 1200 leaves breathing
room. The nav labels are additionally `flex: 0 0 auto` (only the search field
flexes) so a label can never be clipped even at the boundary.

Tokens in `tokens.scss`: `$bp-rail: 1200px`, `$bp-rail-short: 560px`,
`--rail-width: 360px`. The query is `(max-width: 1199.98px), (max-height: 559.98px)`.
The rail is a `position: absolute` overlay in both modes (the tree/oak canvas keeps
full width); `pointer-events` pass through the rail's empty regions so the tree
stays interactive beneath it.

**Supported viewport matrix** — no clipping, no shrink-below-usable, no overlap in
either orientation (panels overlaying the tree *while open* is by design):

| Class | Examples | Mode |
|-------|----------|------|
| Phone portrait | 360×640, 390×844, 412×915 | Compact |
| Phone landscape | 667×375, 844×390, 932×430 | Compact (short height) |
| Tablet portrait | 768×1024, 820×1180 | Compact (narrow) |
| Tablet landscape / narrow desktop | 1024×768, 1180×800 | Compact (`<1200w`) |
| Laptop / desktop | 1280×720, 1366×768, 1440×900, 1920×1080 | Desktop |
| Resized window | any `<1200w` or `<560h` | Compact |

**Layout invariants** (verified by viewport-matrix QA):

1. **No text** — labels, tabs, button captions, or input placeholders — is clipped,
   overflowed, overlapped, or partially hidden by another element, in any supported
   size or orientation. (The 1200/560 thresholds keep the desktop bar above the
   width where any label would shrink; `flex: 0 0 auto` labels are belt-and-braces.)
2. No control overlaps another except by design (panels overlaying the tree while
   open; the modal scrim).
3. When all panels are collapsed/closed, the **tree area is ≥ 60% of the viewport**
   — compact: chips hug the right edge → oak ≈ full width; desktop: 360px overlay
   rail collapses to a small stats bar → oak ≈ 91% width / ≈ 69% area.
4. The minimize (▢→–) toggle button keeps a **fixed header slot** across a panel's
   minimized/expanded states, so toggling does not move the button under the cursor
   (order is always `undock · toggle · close`).

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
