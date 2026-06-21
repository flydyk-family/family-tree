# Header reorganization — design

**Date:** 2026-06-21
**Status:** Approved for planning
**Area:** `src/frontend` — app bar / header

## Problem

The desktop header packs six control clusters into a single flex row
(`AppBar.vue` → `.app-bar__row--desktop`):

`TabNav` · `SearchField` · `LanguagePicker` · `OrientationToggle` · `ThemeToggle` ·
`SignInControl`

The row uses `flex-wrap: wrap`, so at intermediate desktop widths (~1440px) the
`SignInControl` slot drops onto a second line; everything only sits inline at very
wide widths (~1920px). Below the responsive breakpoint the controls live in the ☰
mobile sheet. The result is an unstable header that reflows depending on viewport
width — the issue flagged in the `frontend-signin-followups` memory (follow-up #1).

Separately, the header is vertically expensive: a control row, then a centered
49px title, then a 21px italic subtitle — ~130–140px consumed before the content
(the oak / chronicle) begins.

## Goals

- A header that is **stable at every desktop width** — no second-line wrap.
- **Reclaim vertical space** for the tree without losing the app's signature
  centered "Family Chronicle" identity.
- Group the **set-and-forget display preferences** (language, theme, orientation)
  behind one affordance.
- Give sign-in a **deliberate, fixed placement** that never wraps, with a proper
  signed-in treatment.

## Non-goals (deferred)

- **Custom sign-in button** replacing Google's rendered GIS button
  (`frontend-signin-followups` #2). The default GIS button stays as the
  signed-out state for now.
- **GIS button locale sync** to the app i18n locale (`frontend-signin-followups`
  #3).
- **Google `picture` avatar.** The signed-in avatar is initials-based; wiring the
  `picture` claim from the ID token is a later enhancement.
- Any change to the mobile header *structure* (☰ · brand · ⌕ stays).

## Chosen approach

**Approach A — tidy the control row + single-tier compacted masthead.** Keep the
centered masthead identity but fold it into a single header band, and consolidate
secondary controls. (Alternatives considered: a brand-left unified bar that
retires the centered title, and a two-tier utility-bar + contextual-toolbar split.
Both were heavier changes than the row-crowding problem warrants.)

### 1. Desktop header — one tier, three columns

Replace the two-tier layout (control row + separate centered title block) with a
single header band laid out as a CSS grid:

```
grid-template-columns: 1fr auto 1fr;
align-items: center;
```

- **Left column (justify start):** `TabNav` — Chronicle / Tree (Members and
  Timeline remain `disabled` with the "Coming soon" title).
- **Center column:** the masthead — title "Family **Chronicle**" with the
  "Lineage · {earliest birth} — {current year}" subtitle beneath it. The subtitle
  computation is unchanged from today's `subtitle` computed. The title font size
  drops from 49px to a smaller display size (**~22px starting point, tunable
  during implementation** — final value chosen against the real fonts/themes).
- **Right column (justify end):** three fixed/predictable-width items in order —
  **Search**, **Settings** popover button, **Account** control.

No `flex-wrap`. The right column's items have stable widths, so the header does
not reflow across desktop widths. This reclaims the vertical space previously
taken by the separate title tier (~70px).

### 2. Search collapse on narrow desktop

The search pill (`SearchField`) shows in full above a width threshold. Below it,
search collapses to a single `ti-search` icon button that expands into the field
on click — the same reveal affordance the mobile bar already uses (`searchOpen`).
This keeps the centered title from colliding with the side clusters at the
narrow end of the desktop range.

The threshold is a container/viewport width breakpoint (exact value chosen during
implementation against the real control widths). The collapsed icon and the
expanded field both bind the same `uiStore.search` model, so search state is
preserved across the transition.

### 3. Settings popover — new `SettingsMenu.vue`

A single icon button (`ti-adjustments-horizontal`) with an accessible label
("Settings", `t('settings.label')`) opens an anchored popover panel containing
three labelled groups, all rendered **inline** (no nested dropdown-within-popover):

- **Language** — flag + native-name options rendered as a flat list. Reuses the
  locale option data (`useLocaleStore().options`) and the existing flag/name
  markup, selecting via `setLocale`. (See "Component reuse" for how this relates
  to `LanguagePicker`.)
- **Theme** — `ThemeToggle` as-is (Classic / Film).
- **Orientation** — `OrientationToggle` as-is (Vertical / Horizontal). Always
  present regardless of the active view (decision: predictable location over
  context-hiding).

Behavior:

- Opens/closes on the trigger button; `aria-expanded` and `aria-haspopup="menu"`
  on the button, `aria-controls` pointing at the panel.
- **Click-away** (backdrop or focus-out) and **Esc** close the popover.
- On close, focus returns to the trigger button.
- The panel is anchored to the trigger, right-aligned within the header.

### 4. Account control — evolve `SignInControl.vue`

A fixed-width slot that never wraps, with two states:

- **Signed out** (and GIS configured): render the existing default Google GIS
  button (`renderSignInButton`) — placement only, no restyle. When GIS is not
  configured (`VITE_GOOGLE_CLIENT_ID` absent), the slot renders nothing, as today.
- **Signed in:** an **initials avatar** button. Initials are derived from
  `auth.name` (fall back to `auth.email`). Clicking opens an account-menu popover
  containing:
  - the signed-in identity line (`auth.name` / `auth.email`),
  - the **Editor** badge when `auth.canEdit`,
  - a **Sign out** action (existing `signOut` flow, including
    `disableAutoSelect`).

  Popover behavior mirrors the Settings popover: `aria-expanded`/`aria-haspopup`,
  click-away + Esc to close, focus returns to the avatar trigger.

The wide inline "Signed in as … [Editor] [Sign out]" cluster is removed in favor
of the avatar + menu, keeping the slot width constant.

### 5. Mobile — structure unchanged, groups realigned

The mobile header row (☰ · brand · ⌕) and the search reveal are unchanged. The ☰
sheet is reorganized so its preference groups mirror the desktop Settings popover:
Language / Theme / Orientation grouped together (under a Settings-style grouping),
with the account control at the bottom. Both surfaces then present the same mental
model. No new mobile behavior is introduced.

### 6. Component reuse

- `ThemeToggle` and `OrientationToggle` are self-contained segmented groups and
  are reused as-is inside both the Settings popover (desktop) and the ☰ sheet
  (mobile).
- **Language inside the Settings popover:** to avoid a nested dropdown inside a
  popover, the popover renders the locale options inline rather than embedding the
  collapsible `LanguagePicker`. This is achieved by either (a) adding a flat/inline
  variant to `LanguagePicker`, or (b) rendering the option list directly in
  `SettingsMenu` from `useLocaleStore().options`. The plan picks one; both reuse
  the same store and option shape. `LanguagePicker` (collapsible) may still be used
  standalone in the mobile sheet if convenient.

### 7. i18n

- Add `settings.label` ("Settings") in all three locales (ru primary / be / en).
- Reuse existing keys: `auth.*` (signIn, signOut, signedInAs, editorBadge,
  signInFailed), `theme.*`, `orientation.*`, `picker.*`, `nav.*`, `brand.*`,
  `search.*`.

### 8. Accessibility

- Both popovers: labelled trigger, `aria-expanded`, `aria-haspopup`, Esc to close,
  focus return on close, click-away dismissal.
- The collapsed search icon button carries `aria-label` from `search.label` and
  `aria-expanded` reflecting the open state.
- The avatar button carries an `aria-label` identifying it as the account menu.
- Existing `data-test` hooks are preserved where they still apply; new hooks added
  for the Settings popover trigger/panel and the account avatar/menu.

## Components touched

- `AppBar.vue` — rewritten desktop layout (3-column grid, compacted masthead,
  search collapse, Settings + Account slots); mobile sheet group realignment.
- `SettingsMenu.vue` — **new** popover hosting Language / Theme / Orientation.
- `SignInControl.vue` — account-menu + initials avatar (signed-in state); GIS
  button unchanged for signed-out.
- `LanguagePicker.vue` — optional inline variant for popover hosting (or option
  list rendered directly in `SettingsMenu`).
- i18n messages (`en.ts`, `ru.ts`, `be.ts`) — add `settings.label`.

## Tests

- `AppBar.spec.ts` — update: language/theme/orientation are no longer direct
  children of the desktop row; tests open the Settings popover first. Add coverage
  for the 3-column layout presence (tabs / masthead / right cluster), the search
  collapse affordance, and the Settings + Account slots.
- `SettingsMenu.spec.ts` — **new**: opens/closes (click, Esc, click-away), hosts
  the three preference controls, focus return.
- `SignInControl.spec.ts` — update: signed-in renders an avatar that opens a menu
  with identity / Editor badge / Sign out; signed-out still renders the GIS mount;
  unconfigured renders nothing.
- `LanguagePicker.spec.ts` — update only if an inline variant is added.

## Documentation

Per the repo's docs-with-the-PR rule, update `docs/reference/` (header / controls
behavior) and the README/CLAUDE.md overview if the observable header description
changes, in the **same PR**. Run the `update-docs-for-pr` skill at PR time.

## Risks / open items

- **Title size** is intentionally left tunable; the ~22px starting point is
  validated against both themes (Film / Classic) and the three locales during
  implementation.
- **Search threshold** value is chosen against real control widths during
  implementation.
- **Popover stacking / z-index** must coordinate with existing header `z-index`
  layers (`.app-bar` is `z-index: 20`) and the mobile sheet/backdrop.
