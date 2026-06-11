# Search: center the tree on found people

**Date:** 2026-06-10
**Status:** Approved

## Goal

Typing in the nav-bar search box should not just highlight matching people — the
oak should *navigate* to them: the camera pans (and, when needed, zooms) so the
matched person's medallion sits in the middle of the tree area. Search becomes a
way to travel the tree, including to people whose branch is not currently
rendered.

## Behavior

### Matching

- The match universe is the **whole loaded family graph** (`familyStore.people`),
  not just the currently rendered layout.
- A person matches when the query (trimmed, whitespace-collapsed,
  case-insensitive) is a substring of their **localized given name, surname, or
  the full name in either order** ("Имя Фамилия" and "Фамилия Имя" both work)
  in the current UI locale. The tree highlight uses the same shared predicate.
- Matches are ordered **youngest first** (birth year descending). People with no
  birth year sort last (treated as oldest).

### Camera

- **Live while typing:** after a **300 ms debounce**, the camera moves so the
  current match's medallion is centered in the tree area.
- **Enter cycles:** pressing Enter in the search box advances to the next match
  (youngest → oldest), **wrapping around** after the last. Changing the query
  resets the cycle to the youngest match.
- **Zoom rule ("readable zoom"):** if the current scale `k < 0.8`, the move also
  zooms to `k = 1` (natural card size — the same cap the initial fit uses).
  At `k ≥ 0.8` the zoom is left untouched; the move is pan-only.
- **Glide:** the camera animates over **~350 ms with ease-in-out**. Any user
  gesture (pointer drag, wheel, pinch) **cancels** an in-flight glide
  immediately. With `prefers-reduced-motion`, the camera jumps instantly.
- A search-driven camera move counts as "user adjusted": a later container
  resize must not snap the view back to the initial fit.
- **No matches or blank query:** the camera does not move.

### Re-focus (must-have)

- If the current match is **not present in the rendered layout** (its branch is
  not reachable from the current focus person), the tree **re-roots onto the
  match** via `familyStore.setFocus(matchId)`. The layout rebuilds and the
  match's medallion — now the layout root — is centered.
- The re-focus **persists** after the search is cleared, exactly like any other
  navigation. There is no automatic "restore previous focus".

### Match-count indicator

- The search field shows a small **`current / total`** counter at its right edge
  — e.g. `2 / 5` — where *current* is the 1-based position of the match the
  camera targets and *total* is the number of matches in the whole graph.
- Blank query → indicator hidden. Non-blank query with zero matches → a muted
  `0` so it is visible that nothing was found.
- Works wherever the search field renders (desktop row, mobile ⌕ row), on any
  tab — the count derives from the graph, not from the tree view.
- Accessibility: the counter is a `role="status"` span that announces its
  text content (the changing numbers); the localized string (i18n key
  `search.matches` in ru / be / en) is attached as a `title` tooltip —
  an `aria-label` here would override the live region's announcement.

### Match highlight (Variant A — antique gold)

The current outline-only highlight (a brighter stroke on the portrait ring) is
too subtle. Instead, a matching card's **whole cartouche changes color** to an
"illuminated" gold within the heraldic palette:

| Card part            | Regular                          | Match                                  |
| -------------------- | -------------------------------- | -------------------------------------- |
| Scroll body fill     | `#f6eed2`                        | `--match-paper: #f8e7af` (new token)   |
| Scroll body stroke   | `--ink-soft`, 0.9                | `--gilt-deep` (`#876626`), 1.4         |
| Roll-end stroke      | `--bark-dark`, 0.8               | `--gilt-deep`, 0.8                     |
| Portrait ring        | `--gilt` (`#b7913f`), 3.4        | `--gilt-deep`, 4.5                     |
| Name / dates text    | unchanged                        | unchanged                              |
| Portrait tint        | unchanged                        | unchanged                              |

- Fill/stroke changes get a **~0.2 s transition** so highlights fade in/out as
  the user types rather than flicker.
- **Selection beats match on the ring:** a card that is both selected and a
  match keeps the selection ring (`--leaf-deep`) while the scroll surfaces stay
  gold. Selection styling is otherwise unchanged.
- Mechanism: pure CSS — extend the existing `.oak__node--match :deep(...)`
  rules in `OakTree.vue` to cover `.oak__scroll-body`, `.oak__scroll-roll`, and
  the gilt band; add the `--match-paper` token to `tokens.scss`.

## Architecture

Match logic lives in a shared composable (it spans the whole graph and is needed
by both the search field and the tree). The `uiStore` carries the search query
and the Enter-cycling cursor. `TreeView` resolves the camera target and may
change focus; `OakTree` executes camera moves.

```
SearchField ──setSearch(q)───────────────► uiStore.search   (resets searchCursor to 0)
SearchField ──Enter──advanceSearchCursor()─► uiStore.searchCursor++
useSearchMatches() ── computed over familyStore.people + uiStore.search
            │         + localeStore.currentLocale → { matches, total, currentIndex }
            ├──► SearchField: "current / total" indicator
            └──► TreeView:
                   watch [query (debounced 300 ms), searchCursor]:
                     target = matches[cursor % total]
                     if target ∉ layout → familyStore.setFocus(target.id)
                     :center-request="{ id: target.id, seq: ++seq }" → OakTree
OakTree ── watch [layout, centerRequest] (flush post):
             node found → usePanZoom.centerOn(node) → animated glide
```

### Component / module changes

- **`stores/uiStore.ts`** — add `searchCursor: number`. `setSearch()` resets it
  to 0; new action `advanceSearchCursor()` increments it.
- **`composables/useSearchMatches.ts`** (new) — the computed match list:
  locale-aware matching, youngest-first ordering, missing-birth-years-last;
  exposes `matches`, `total`, and `currentIndex` (cursor modulo total, 1-based
  for display).
- **`components/SearchField.vue`** — `@keydown.enter` →
  `ui.advanceSearchCursor()` when the query is non-blank; renders the counter.
- **`views/TreeView.vue`** — consumes `useSearchMatches()`; debounced watcher
  resolves the target, calls `familyStore.setFocus` for off-layout targets, and
  passes `center-request` to `OakTree`. The request is `{ id, seq }` with a
  monotonically increasing `seq`, so consecutive requests for the **same**
  person (e.g. Enter when there is a single match, after the user panned away)
  still re-trigger centering.
- **`components/OakTree.vue`** — new optional
  `centerRequest: { id: string; seq: number } | null` prop; a `flush: 'post'`
  watcher finds the node in `layout.nodes` and drives the camera. The search-centering command supersedes the auto-refit a layout change
  would otherwise trigger. Extends the match-highlight CSS (see above). The
  existing `isMatch` highlight predicate stays (rendered nodes only).
- **`interactions/panZoom.ts`** — new pure `centerOn(point, size, currentK):
  Viewport` returning the viewport that puts `point` at the screen center,
  applying the readable-zoom rule (`k < 0.8 → 1`, else keep `k`).
- **`interactions/usePanZoom.ts`** — new `animateTo(viewport, durationMs)`:
  requestAnimationFrame loop, ease-in-out interpolation of `{x, y, k}`; sets
  `userAdjusted`; cancelled by `pointerdown` / `wheel` / `touchstart`; instant
  when `prefers-reduced-motion`. A `centerOn(point)` convenience combines the
  pure helper with `animateTo`.
- **`styles/tokens.scss`** — add `--match-paper: #f8e7af`.
- **i18n (`ru` / `be` / `en`)** — add `search.matches` aria-label for the
  counter.

## Edge cases

- Cursor index is always `cursor % matches.length` — never out of range when
  the match list shrinks mid-cycle.
- Re-focus rebuilds the layout with new coordinates; the camera centers on the
  target's **new** position. The glide animates viewport numbers while the
  content swaps — acceptable, since the scene changed anyway.
- The re-focused person is by definition in the new layout (they are its root),
  so centering after a re-focus always finds its node.
- Orientation flip while searching: the existing unconditional re-fit stays;
  the centering watcher re-fires against the newly projected coordinates and
  re-centers the current target.
- Enter when the target does not change (single match, or wrap back to the same
  person): the sequenced `center-request` re-triggers the glide, so the camera
  returns to the match even after the user panned away.
- Enter in a `type=search` input also fires a native `search` event that
  re-reports the unchanged value; `setSearch` treats an unchanged query as a
  no-op so it cannot reset the cycling cursor the keydown just advanced.
- Guards (all no-ops): blank query, empty match list, unmounted SVG.

## Error handling

No new failure modes — all inputs are in-memory, already-validated data. The
guards above degrade every unexpected state to "camera does not move".

## Testing

- `panZoom.spec.ts` — `centerOn` math: centers the point; keeps `k ≥ 0.8`;
  raises `k < 0.8` to 1.
- `uiStore.spec.ts` — `setSearch` resets the cursor; `advanceSearchCursor`
  increments it.
- `useSearchMatches.spec.ts` — locale-aware matching; youngest-first ordering;
  missing birth years last; index wrap.
- `TreeView.spec.ts` — matches resolved over **all** people; off-layout target
  → `setFocus` called and `center-request` passed; cycling wraps; `seq`
  increments on repeated requests for the same person.
- `OakTree.spec.ts` (fake timers) — `centerRequest` prop drives the camera;
  a repeated request for the same id (new `seq`) re-centers; drag cancels the
  glide; no movement when the prop is null; match class lands on the node group
  (drives all card-surface styles).
- `SearchField.spec.ts` — Enter advances the cursor only when non-blank;
  indicator renders `current/total`, hidden when blank, `0` when no matches.
- Post-implementation: live verification (gstack browse/QA) against the dev
  server — typing pans, Enter cycles, off-tree person re-roots the oak, the
  gold highlight reads clearly among regular cards.

## Out of scope (YAGNI)

- Shift+Enter reverse cycling.
- Visually distinguishing the *currently centered* match from other matches
  (the centered one is, by definition, mid-screen).
- Restoring the previous focus after the search is cleared.
