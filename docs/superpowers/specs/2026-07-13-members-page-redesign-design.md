# Members Page Redesign — "Family Chronicle" (Classic theme)

Date: 2026-07-13 · Status: approved for implementation

## Goal

Re-skin the read-only **Members page** (`/members/:slug?`) to match the "Family Chronicle"
reference mockup from a **layout and visual-design** perspective, in the **Classic** theme.
The page must keep the app's quality bar: responsive/adaptive on all supported screen sizes,
mobile-friendly, no visual or functional bugs.

**Scope discipline:** this is a *redesign*, not an editing feature. Editing stays out of scope
(the profile-override `PUT` endpoint remains dormant). The layout must be **ready** for editing
affordances (pencils, add/remove) to drop in later without restructuring — but **no inert
controls are rendered now**. No "button that does nothing".

## Non-goals

- Wiring any edit/save action (given/surname/sex/vocation/birth-death, residences, relationships).
- Inventing navigation items the app does not have (the mockup shows MAP/MEDIA/REPORTS — omit).
- Redesigning the Film theme. Everything uses theme tokens so Film degrades sanely, but Film is
  not the design target and is only sanity-checked.
- Changing the master–detail data flow, routing, or the profile/graph API contracts beyond one
  additive DTO field (below).

## Current state (baseline)

Master–detail, already structurally close to the mockup:

- `views/MembersView.vue` — two-column layout (roster | detail), drill-down below 720px with a
  back control, family bottom-sheet overlay.
- `components/MembersIndex.vue` — search + Surname filter + Sort + Clear + count; portrait/name/years rows.
- `components/MemberDetail.vue` — circular portrait + name + lifespan + Find-on-tree pill,
  field tablets, biography + residences panels, read-only photo grid.
- `components/MemberFamilySheet.vue` — collapsible bottom sheet; parents/spouse/siblings/children as chips.

Data: roster runs on `PersonSummary[]` from `familyStore` (`/api/family/graph`); detail from
`/api/people/{id}`. `PersonSummary` has **no place data**.

## Design decisions (resolved with owner)

1. **Header:** enhance the **shared** app bar (`AppBar`/`TabNav`) app-wide — crest mark + real-tab
   nav icons + existing account slot. Verify every page stays clean.
2. **Edit affordances:** **omit** now; keep components layout-ready (a default-off `editable` seam).
3. **Filters:** implement **all three** (Generation, Surname, Place) + Sort, all functional.

## Target design

### A. Shared header — `AppBar.vue`, `TabNav.vue`

- Add a compact **heraldic crest mark** at the far-left of the desktop bar (before the nav):
  a shield + oak + coronet, hand-drawn SVG matching the app idiom (`AppFrame` corners), token-gilt,
  `aria-hidden`. Hidden below a width threshold so it never crowds the bar.
- Add an **inline icon** to each of the four real nav tabs: Chronicle (scroll), Tree (oak),
  Members (figures), Timeline (hourglass, still disabled). Icons are small, before the label.
- Masthead title/subtitle, search, Settings popover, and the account slot (already an initials
  avatar → the mockup's "G") are unchanged.
- Mobile: hamburger sheet behavior unchanged; crest not shown in the compact bar.
- **Verification:** Chronicle, Tree, Members at desktop / narrow-desktop / mobile, both themes.

### B. Roster — `MembersIndex.vue`

- **Search field** with an inset magnifier glyph; placeholder "Search name or place…". Roster
  search is extended to also match birth place (so the placeholder is honest).
- **Filter chips** styled like the mockup pills (uppercase label + caret + small icon):
  - **Generation** — options `Generation {n}` derived from `familyGenerations` (see F).
  - **Surname** — existing distinct localized surnames.
  - **Place** — distinct localized birth places (from the new `birthPlace` summary field).
- Second control row: **Sort: A–Z ▾** (name / birth year, existing) and a **Clear** link
  (resets query + all filters + sort).
- **Rows:** portrait (or initials) + serif-caps name + italic years. Selected row: gilt
  frame/fill + a **fleuron/diamond marker** at the right edge.
- **Footer:** bottom-left **"N members"** count.
- **Botanical branch** SVG anchored at the column's bottom corner (`BotanicalCorner.vue`,
  `aria-hidden`), sitting behind the list, non-interactive.

### C. Detail — `MemberDetail.vue`

- **Portrait** in an ornate **oval gilt frame with a coronet finial** (replaces the plain ring),
  token-gilt so Film degrades. Falls back to initials as today.
- **Name** (serif caps) + **lifespan** with a small centered **ornament divider**
  (`OrnamentDivider.vue`). **Find on tree** gold gradient pill (existing action, refined style).
- **Field tablets** in the mockup grid:
  - Row 1: Given name · Sex · Vocation
  - Row 2: Surname · Birth details (date + place sub-line) · Death details (date + place sub-line)
  - Maiden name under Surname.
  Each tablet reserves a **top-right edit seam** — an `editable` prop (default `false`) gates a
  slot; nothing renders now, but the pencil drops in later with no restructuring.
- A decorative **coat-of-arms** (shield + laurel) SVG top-right of the fields (`CoatOfArms.vue`,
  `aria-hidden`), reflowing/hiding on narrow.
- **Biography** + **Residences** framed panels side-by-side (existing), residence rows gain a
  **house glyph**. "+ Add residence" and per-row edit/delete are **omitted**; the panel header and
  rows reserve their slots (default-off `editable` seam) for the later cut.
- The existing **read-only photo grid** (`PersonPhotos`) stays below the columns, unchanged
  (only shows at ≥2 tiles, as today).

### D. Family drawer — `MemberFamilySheet.vue`

- Handle relabeled **"Drag up for more details"** with a chevron; still a click/keyboard toggle
  (no real drag gesture required).
- Expanded content in the mockup's **three columns**:
  - **Parents** — up to two, oval portrait + name + years.
  - **Spouse** — oval portrait + name + years + **"Married {year}"** when `marriageYear` exists.
    (Year only — the mockup's exact date/place is not in our data; do not invent it.)
  - **Children** — a portrait-card row + **"View all children (N) →"** when truncated.
- **Siblings** render as an extra same-styled section **only when the person has siblings**
  (keeps real data; the mockup's featured person simply has none shown).

### E. Backend — one additive field

- `PersonSummaryDto` gains `LocalizedTextDto? BirthPlace`; `MappingConfig` maps `src.Birth.Place`.
- Frontend `PersonSummary` type gains `birthPlace: LocalizedText | null`; the graph mapping/parse
  carries it through.
- Enables the Place filter and place-aware roster search. No new endpoints; contract is additive.

### F. Generation derivation — `familyGenerations.ts`

- Pure util: `generation(personId) = 1 + max(parent generations)`, founders (no known parent in
  the graph) = **Generation 1**. Computed once over `people` (`parents` refs). Deterministic,
  independent of any focus person. Returns a `Map<id, number>` + a sorted list of present
  generations for the filter options. Memoized in the roster via `computed`.

### G. New presentational components (isolated, `aria-hidden`)

- `heraldry/CrestMark.vue` — header crest.
- `heraldry/CoatOfArms.vue` — detail shield + laurel.
- `heraldry/BotanicalCorner.vue` — roster corner branch.
- `heraldry/OrnamentDivider.vue` — small rule/fleuron between name and lifespan.
- Nav-tab icons — a small inline icon per tab (in `TabNav` or a tiny `NavIcon` map).

Each is pure SVG/CSS, token-driven, no logic — so `MembersIndex`/`MemberDetail`/`AppBar` stay focused.

## Responsive & adaptive

- Keep the existing breakpoints: two-column desktop; **≤720px** drill-down (roster → detail with a
  back button); family bottom-sheet.
- Field tablets grid: `repeat(auto-fit, minmax(...))` reflow (existing pattern).
- Family three-column layout stacks vertically on narrow.
- Decorative SVG (crest, coat-of-arms, botanical) are `aria-hidden`, non-interactive, and hide or
  shrink at small sizes so they never overlap content or force horizontal scroll.
- Touch targets ≥44px preserved on rows, chips, handle, and family cards.

## Design-ready for editing (no inert controls)

- `MemberDetail` tablets, the residences panel, and family cards accept a default-`false`
  `editable` prop that gates edit slots. With `editable=false` (today) nothing extra renders.
- Component seams (slots / reserved corners) are placed where the mockup shows pencils / add /
  delete, so the later editing cut is additive.

## Accessibility

- Decorative art `aria-hidden`; informative controls keep labels.
- Filters are real `<select>`/labelled controls (keyboard + screen-reader reachable).
- Selected roster row keeps `aria-selected`; family cards are buttons with names.
- Focus-visible rings via existing `--gilt` token pattern.

## Testing

- Update `MembersIndex.spec.ts`, `MemberDetail.spec.ts`, `MemberFamilySheet.spec.ts`,
  `MembersView.spec.ts` for the new markup/labels.
- Add tests: `familyGenerations` util; Generation + Place filter behavior; place-aware search;
  "View all children"; siblings-only-when-present.
- Backend: extend the `PersonSummaryDto` mapping test to assert `BirthPlace`.
- Keep i18n message-parity test green (add keys to ru/be/en together).

## Delivery

Branch `claude/members-page-redesign-36c10f` (already off `main`). Spec → plan
(`docs/superpowers/plans/`) → subagent-driven build → code review + accept (subagents) →
QA (both breakpoints, both themes) → docs sync (`docs/reference/` + overview) → PR into `main`.
No self-merge.
