# Feature: Search & Navigation

← back to [features index](README.md) · [reference index](../README.md)

Covers search, pan/zoom, `/person/:id` deep links, and orientation. Stores: [`uiStore`](../../../src/frontend/src/stores/uiStore.ts) (`orientation`, `search`, `searchCursor`), [`familyStore`](../../../src/frontend/src/stores/familyStore.ts) (`focusId`), plus selection/panel stores from [person-details.md](person-details.md#stores).

## Routing & deep links ([`router/index.ts`](../../../src/frontend/src/router/index.ts), [`views/TreeView.vue`](../../../src/frontend/src/views/TreeView.vue))
History mode: `createWebHistory()` (no hash).

| Path | Name | Component |
|---|---|---|
| `/` | `tree` | `TreeView` |
| `/chronicle` | `chronicle` | `ChronicleView` |
| `/person/:id` | `person` | `TreeView` |

**`/person/:id` behavior:**
- Valid id → person panel expands in the rail and `selection.open(id)` fetches detail; URL stays at `/person/:id`. (Entering via the URL does **not** open the popup — only desktop tree-node clicks do.)
- Invalid/unknown id → fetch fails; `selectionStore.error` is set and shown in the panel; the panel still opens with the raw id.

**URL ⇄ selection sync (two-way):**
- URL → store: a watcher drives `openPerson` / `minimizeAllPersons`.
- Store → URL: expanding a person `router.replace`s to `/person/:id`; clearing replaces back to `/`.
- Tree-node click `router.push`es `/person/:id` (adds history). A guard prevents redundant double-navigation.
- Browser **Back** from `/person/:id` → `/` clears the selection and closes detail.

## Pan / zoom ([`interactions/panZoom.ts`](../../../src/frontend/src/interactions/panZoom.ts), [`usePanZoom.ts`](../../../src/frontend/src/interactions/usePanZoom.ts))
| Input | Effect |
|---|---|
| Mouse wheel | Zoom about the cursor (`exp(−deltaY*0.0015)`) |
| Left-drag | Pan — only after a **4 px** threshold (so a click still selects); pointer capture acquired then |
| 1-finger touch | Pan |
| 2-finger touch | Pinch-zoom about the midpoint |

- **Zoom limits:** scale `0.2`–`6.0`.
- **No on-screen zoom buttons.** SVG uses `touch-action: none` and prevents default on `touchmove`.
- **Initial framing (`fit`):** frames the **default-root family** — the `isDefaultRoot` person plus two descendant generations (children + grandchildren) and each tier's co-parents, via a depth-2 BFS in [`focusBounds.ts`](../../../src/frontend/src/layout/focusBounds.ts) (`defaultRootFocusBounds`; falls back to the 2-most-recent-generation band when there is no default root). 60 px padding, capped at natural size (`maxScale: 1`) so it never over-zooms on large screens. The oak starts at opacity 0 and fades in after the first fit.
  - **Desktop** fits the whole box (`contain`). **Mobile-class viewports** (the mobile predicate) fit the box's **short time/generation axis** and let the wider sibling spread overflow (pannable) so cards stay legible instead of letterboxing to an unreadable scale; the overflowing axis is **anchored on the root** so gen0 stays in view, and only when that axis actually overflows.
- **Re-fit:** on container resize **only if the user hasn't adjusted the camera**; on orientation switch, **always** (coordinate space transposes).

## Search ([`SearchField.vue`](../../../src/frontend/src/components/SearchField.vue), [`composables/useSearchMatches.ts`](../../../src/frontend/src/composables/useSearchMatches.ts))
A live, client-side, case-insensitive substring search.

**Matches against** (in the current locale): given name, surname, `"given surname"`, and `"surname given"`. **Does not match maiden name.**

**UI ([`SearchField.vue`](../../../src/frontend/src/components/SearchField.vue)):**
- `<input type="search">` (`data-test="search-input"`).
- Counter (`data-test="search-count"`): `"1 / N"` with matches; `"0"` (faint) when a query has no match; hidden when empty.
- Enter-hint `↵` shown only when there is more than one match.
- Placeholders — ru: `Поиск по имени…`, be: `Пошук па імені…`, en: `Search by name…`.

**Behavior:**
- Match order: youngest first by `birthYear` (null years last).
- **Typing** debounces 300 ms before the camera moves; **Enter** advances the cursor immediately and cycles (wraps around) through matches.
- The camera **glides** (0.35 s) to center the current match; if zoomed below the readable threshold (`k < 0.8`), it jumps to `k = 1`.
- Search **never re-roots** the tree: because the whole connected family is always rendered ([oak-tree.md](oak-tree.md#layout-engine-treelayoutts)), every match is already on the canvas, so search only glides the camera.
- Matched medallions get the green-gold `--match` overlay (wins over selection).
- **No match:** counter `"0"`, no error, camera doesn't move, Enter is a no-op.
- **Clearing** resets `search` and `searchCursor`; highlights vanish; camera doesn't move.

Search state is session-only (not persisted; not in the URL).

## Orientation
`uiStore.toggleOrientation()` / `setOrientation()` flip vertical ↔ horizontal, persisted in `localStorage['familytree.orientation']` and restored on load. The toggle UI lives in the app bar (desktop) or the hamburger sheet (mobile) — see [app-shell-and-localization.md](app-shell-and-localization.md). Orientation is **not** carried in the URL (shared links don't preserve it).

**Responsive default:** until the user makes an explicit choice, orientation follows the viewport — **horizontal on mobile-class viewports** (the mobile predicate `(max-width: 1199.98px), (max-height: 559.98px)`, [`MOBILE_MEDIA_QUERY`](../../../src/frontend/src/composables/useMediaQuery.ts)), **vertical otherwise** — applied via `uiStore.applyResponsiveOrientation()` as the screen crosses the breakpoint. The moment the user toggles (or a stored orientation is restored), `orientationExplicit` is set and the responsive default **stops overriding** the manual choice for the rest of the session.

## QA notes
- Drag-then-release over a node must **not** select it (4 px threshold guards this).
- Enter keeps cycling even though the native `search` input re-fires its event (guarded in `uiStore.setSearch`).
- Re-issuing the same search target after a manual pan still re-centers (a sequence value forces it).
