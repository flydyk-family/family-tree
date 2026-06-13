# Feature: Person Details, Panel Rail & Media

← back to [features index](README.md) · [reference index](../README.md)

Covers selecting a person, the right-hand **panel rail**, the **PersonPopup** ("bigger view"), the **PersonDetail** content, and **media / living portraits**.

Components: `PanelRail.vue`, `DockPanel.vue`, `StatsPanel.vue`, `PersonDetail.vue`, `PersonPopup.vue`, `MediaLightbox.vue`, `VocationIcon.vue`.

## Stores

- **`familyStore`** — `people`, `unions`, `focusId`, `loading`, `error`. `load()` fetches `/api/family/graph`, sets `focusId` to the default-root person. `defaultRootId` getter falls back to `people[0]`. `setFocus(id)` re-roots the tree (used by search).
- **`selectionStore`** — `selectedId`, `detail`, `mode` (`'normal'|'expanded'`), `loading`, `error`. `open(id)` fetches `/api/people/:id` (race-guarded; no refetch if already loaded). `expand()`/`collapse()` toggle mode. `close()` resets.
- **`panelStore`** — `personPanels[]`, `statsMinimized`, `railMode` (`'chips'|'rectangles'`), `biggerViewId`. Invariant: **exactly one person expanded at a time**. Key actions: `openPerson`, `expandPerson`, `minimizePerson`, `minimizeAllPersons`, `closePerson`, `expandRail`/`collapseRail`, `expandStats`, `openBiggerView`/`closeBiggerView`, `undock`.

## Panel rail (`PanelRail.vue`)
An `<aside>` over the canvas (top-right). Contains: the pinned **stats panel**, a mobile arrow toggle, and the **person panels** stack.

**Desktop (≥1200 px wide AND ≥560 px tall):**
- Person panels are `expanded` or `minimized` (never chips). Stats starts **expanded**.
- A person popped out as the bigger view is hidden from the rail.
- Undock (⤢) button available on person panels.

**Mobile (<1200 px OR <560 px tall):**
- **Chips mode** (default): 48×48 chip buttons hugging the right edge; one letter per person, `⚜` for stats. Tap → open person / expand stats.
- **Rectangles mode**: full-width panels (capped at 360 px). `←` expands the rail (rectangles + minimize all); `→` collapses to chips (membership preserved).
- Stats starts **minimized**. Undock is disabled (`biggerable:false`).

### DockPanel states & controls
`chip` (glyph only) / `minimized` (header bar) / `expanded` (header + body). Header buttons, fixed order: **Undock ⤢ · Expand/Minimize · Close ✕**. Stats panel is `pinned` (🔒) and **not closable**.

## PersonPopup — "bigger view" (`PersonPopup.vue`)
A modal overlay rendered when `panel.biggerViewId` is set. Opened by a **desktop tree-node click** (`openBiggerView`) or the undock ⤢ button. **Mobile node clicks never open it.**

- Structure: full-viewport scrim (`z-index 60`) + `section role="dialog" aria-modal="true"`; auto-focuses the dialog on mount. Width `min(560px, 100vw−32px)`, height `min(82vh, 720px)`, glass blur (falls back to opaque parchment if `backdrop-filter` unsupported).
- Contains `<PersonDetail>` (reads `selectionStore` — same person as the rail).

| Action | Result |
|---|---|
| Scrim click / Esc / ⤡ dock button | `closeBiggerView()` → returns to rail; **person stays open** |
| ✕ close button | `closePerson(id)` → removes the person from the rail entirely |

No prev/next navigation inside the popup.

## PersonDetail content (`PersonDetail.vue`)
Shared by the rail panel and the popup.

- **Header:** 84×84 circular portrait (video → still → initials, see below; clickable → lightbox), full localized name, optional `née {maidenName}`, formatted lifespan (with `~` for approximate years), vocation icon + label.
- **Summary:** localized `summary`.
- **Expanded mode** (toggle button): biography (`white-space: pre-line`), residences (`{place} {from}–{to|present}` with optional 🗺 map link), social links by type.
- **Loading / error:** localized status / error text (e.g. an invalid deep-link id surfaces the fetch error).

## Media / living portraits

URLs: `/media/portraits/{encodeURIComponent(filename)}`. In production served from R2 via a Pages Function; in dev from a local `media/` folder or proxied from production. **Without media, the UI degrades to initials.** See [ci-cd.md](../ci-cd.md#media).

**Tree node (medallion):** still image only; null portrait → initials. **No `@error` fallback on the SVG `<image>`** — a broken portrait URL shows a broken-image box, *not* initials. *(QA edge case.)*

**Detail panel — three-tier fallback chain:**
1. **Video** (`portraitVideo`): `<video autoplay muted loop playsinline>` with the still as poster. Autoplay is **unconditional** (not gated/in-view) and always muted — browsers that block muted autoplay may not start it; the fallback only fires on a real `@error`.
2. **Still** (`portrait`): `<img>` with `@error` → tier 3.
3. **Initials.**
Failure flags reset when a different person opens.

**Lightbox (`MediaLightbox.vue`):** opens on portrait click (Teleported to body, `z-index 80`). Items: video first (if any), then still. Navigation: ←/→ buttons + arrow keys + dot indicators (hidden for a single item). Close: ✕ / Esc / scrim. Focus moves to the close button on open and returns to the trigger on close. Video error → falls back to still; sole-image error → closes.

## Stats (`useFamilyStats` + `StatsPanel.vue`)
Computed: `members` (count), `earliestBirthYear`, `withPortraits` (has portrait filename), `living` (no death year). The rail's **StatsPanel shows these 4**; the [Chronicle page](app-shell-and-localization.md#chronicle--first-visit) shows the same 4 **plus** a `generations` count (computed from the layout). Empty roster → zeros and em-dash.

## QA edge cases
- Broken portrait URL in a **tree node** → broken image, no initials fallback (differs from the detail panel).
- Muted-autoplay video may be suppressed by browser policy (esp. iOS/Firefox) without triggering the error fallback.
- The popup and the rail panel always show the **same** person (shared `selectionStore`).
- `gallery[]` exists in the model but is empty in seed data and not surfaced in the UI.
