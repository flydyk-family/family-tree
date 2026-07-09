# Feature: Search & Navigation

← back to [features index](README.md) · [reference index](../README.md)

Covers search, pan/zoom, `/person/:slug` deep links, the Members page, and orientation. Stores: [`uiStore`](../../../src/frontend/src/stores/uiStore.ts) (`orientation`, `search`, `searchCursor`), [`familyStore`](../../../src/frontend/src/stores/familyStore.ts) (`focusId`), plus selection/panel stores from [person-details.md](person-details.md#stores).

## Routing & deep links ([`router/index.ts`](../../../src/frontend/src/router/index.ts), [`views/TreeView.vue`](../../../src/frontend/src/views/TreeView.vue))
History mode: `createWebHistory()` (no hash).

| Path | Name | Component |
|---|---|---|
| `/` | `tree` | `TreeView` |
| `/chronicle` | `chronicle` | `ChronicleView` |
| `/members/:slug?` | `members` | `MembersView` |
| `/person/:slug` | `person` | `TreeView` |

**`/person/:slug` behavior:**
- The slug is `<given>-<surname>-<birthYear>-<id>`, e.g. `/person/franciszek-kowalski-1788-p-0003`. The name is the **English** name (or a Cyrillic→Latin transliteration of `ru`/`be` when `en` is absent), diacritics folded to ASCII; the birth year is omitted when unknown.
- **Resolution is frontend-only** ([`utils/personSlug.ts`](../../../src/frontend/src/utils/personSlug.ts)): the trailing `p-<digits>` id is the source of truth — `extractPersonId` recovers it and the existing `GET /api/people/{id}` fetches the person. The name part is decorative; a truncated or stale name still resolves.
- **Backward compatible:** legacy `/person/p-0003` links still work (the bare id is a valid trailing-id match), and the URL self-heals to the canonical slug via `router.replace` once the person summary is loaded.
- Valid id → person panel expands in the rail and `selection.open(id)` fetches detail. (Entering via the URL does **not** open the popup — only desktop tree-node clicks do.)
- Invalid/unknown id → fetch fails; `selectionStore.error` is set and shown in the panel; the panel still opens with the raw id.

**URL ⇄ selection sync (two-way):**
- URL → store: a watcher extracts the id from the slug and drives `openPerson` / `minimizeAllPersons`.
- Store → URL: expanding a person `router.replace`s to the canonical `/person/:slug`; clearing replaces back to `/`.
- Tree-node click `router.push`es `/person/:slug` (adds history). A guard prevents redundant double-navigation.
- Browser **Back** from `/person/:slug` → `/` clears the selection and closes detail.

## Members page (read-only) {#members-page-readonly-membersslug}

`/members/:slug?` ([`views/MembersView.vue`](../../../src/frontend/src/views/MembersView.vue)) is a searchable master-detail roster, separate from the oak tree. It shares the same friendly-slug scheme as `/person/:slug` (`personSlug`/`extractPersonId`) for its optional `:slug` param, so a Members deep link is shareable the same way.

**Layout:** a two-column grid — a **roster index** ([`MembersIndex.vue`](../../../src/frontend/src/components/MembersIndex.vue)) on the left, a **per-person dossier** ([`MemberDetail.vue`](../../../src/frontend/src/components/MemberDetail.vue)) on the right; single column on narrow viewports (`max-width: 720px`). Selecting a roster row or a relative chip `router.push`es the canonical `/members/:slug`, so Back/forward navigate between selections. With no selection, a hint prompts picking someone.

**Roster index:** a live substring search box (`data-test="members-search"`, same [`personMatchesQuery`](#search-membersvue-composablesusesearchmatchests) predicate as the tree's nav-bar search) plus a chip row beneath it — a **surname** filter (`data-test="filter-surname"`, distinct localized surnames), a **sort** control (`data-test="filter-sort"`, name A–Z or by birth year), and a **Clear** button (`data-test="filter-clear"`, shown only when a search/filter/non-default sort is active). Each row shows a thumbnail (or an empty placeholder), full name, and a `birth – death` year span; a footer shows the match count and an empty-state message when nothing matches. (The mockup's Generation and Place filters are deferred — Place needs residence data not carried in the roster payload.)

**Dossier ([`MemberDetail.vue`](../../../src/frontend/src/components/MemberDetail.vue)):** fetches `GET /api/people/{id}` fresh on selection (not the summary already in the store) to get full detail. A framed portrait medallion + name + `née …` + lifespan sit beside a **Find on tree** button that navigates to `/person/:slug` and glides the oak camera to that person on arrival. Below, a **field-tablet grid** (given name, surname, maiden name, sex, vocation, **Born** = date + place, **Died** = date + place), then **Biography** and **Residences** side-by-side in double-bordered gilt panels (biography only when non-empty in the current locale; residences as place + optional year span), then the same read-only [photo grid](person-details.md#photo-grid) used elsewhere (`can-edit` forced `false` here).

**Immediate-family cluster ([`MemberFamilySheet.vue`](../../../src/frontend/src/components/MemberFamilySheet.vue), [`composables/useRelatives.ts`](../../../src/frontend/src/composables/useRelatives.ts)):** a **bottom sheet** overlaying the dossier (owned by `MembersView`, not the scrolling dossier). A handle (`data-test="family-sheet-handle"`) toggles **peek** (parents, spouse(s), children) and **expanded** (adds siblings); the handle is disabled when there are no siblings. Only non-empty groups render, as clickable chips (portrait thumb + name + year span); clicking a chip selects that relative. `deriveRelatives` is pure/side-effect-free: siblings share at least one parent id (half-siblings included, self excluded); spouses/children come from any union that includes the person; each group sorts by birth year then id.

**Read-only in this cut:** the dossier fields, biography, residences, and photo grid are **display-only** — there is no in-app editor UI yet (the backend `PUT /api/people/{id}/profile` ships dormant; see [features/backend-api.md](backend-api.md#put-apipeopleidprofile)). No add/remove-relative or relationship-editing controls exist. These are later cuts (1b: scalar editor; 1c: residence editing + map picker; 2: add/remove people + relationship editing).

**Entry point:** the **Members** tab in the app bar now navigates here (previously a disabled placeholder) — see [features/app-shell-and-localization.md](app-shell-and-localization.md#tabs-tabnavvue).

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

## Search ([`SearchField.vue`](../../../src/frontend/src/components/SearchField.vue), [`composables/useSearchMatches.ts`](../../../src/frontend/src/composables/useSearchMatches.ts)) {#search-membersvue-composablesusesearchmatchests}
A live, client-side, case-insensitive substring search. The predicate ([`personMatchesQuery`](../../../src/frontend/src/composables/useSearchMatches.ts)) is shared between the tree's nav-bar search and the [Members roster](#members-page-readonly-membersslug) search.

**Matches against** (in the current locale): given name, surname, **maiden name**, `"given surname"`, and `"surname given"`.

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
- Searching by a person's **maiden name** now surfaces them in both the tree nav-bar search and the Members roster — this was previously a non-match.
- The Members page has **no editing affordances** in this cut — a signed-in editor sees the same read-only dossier as an anonymous visitor; do not test for scalar-field edit controls, residence editing, or add/remove-relative actions there yet.
