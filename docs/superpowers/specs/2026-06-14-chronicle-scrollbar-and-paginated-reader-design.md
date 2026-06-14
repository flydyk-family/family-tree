# Chronicle scrollbar + paginated person reader — design

**Date:** 2026-06-14
**Status:** approved in brainstorming (visual iteration with the owner via the brainstorm companion); pending implementation plan
**Scope:** restyle the scroll experience in the **person popup** and the **docked rail**, replace the popup's whole-card scroll with a fixed header + scrollable body, remove the More/Less toggle in favour of a **paginated biography**, and give the rail an always-reserved, decorated scrollbar gutter. Frontend only (`src/frontend`). Builds on the popup↔dock morph from PR #80 (now on `main`) and must not regress it.

## Why

Today the popup (`.popup__dialog`) scrolls as a single block, so the header (portrait, name, years, vocation) scrolls away with the text — the owner wants the header to stay put while only the content scrolls (see the owner's sketch: the scroll track begins *below* the header). The biography is gated behind a "More" button; the owner wants it always present but **paginated** when long, so the card never becomes an endless wall of text. The native browser scrollbar also clashes with the parchment-and-gilt aesthetic, and in the rail the scrollbar appears/disappears with content, shifting layout. The owner wants a custom gilt scrollbar whose gutter is **always reserved and decorated**, so the space reads as intentional ornament rather than emptiness.

Decisions reached in brainstorming:

- **Popup reading model: hybrid.** Fixed header; the body scrolls (for structured data); the long biography is **paged inside** the scrolling body. (Owner picked this over pure-scroll and pure-paged.)
- **Scrollbar look: engraved vine.** A custom overlay scrollbar (native bar hidden) with a faint oak/vine motif down the gutter and a gilt thumb bearing a small leaf. Reused by the popup body and the rail.
- **Rail scope: the rail stack only.** The right-side column of panels scrolls with the vine scrollbar and an always-reserved decorated gutter. Individual expanded panels keep growing naturally (no new per-panel internal scroll).
- **More/Less: removed everywhere.** No `normal`/`expanded` mode. Every surface always shows full content; the biography is paginated so the rail panels stay bounded.

## 1. `ChronicleScroll.vue` — the custom gilt scrollbar (new, reusable)

A wrapper that turns its default slot into a scroll viewport with the native scrollbar hidden and a **vine-decorated gutter overlaid on the right**.

- **Structure:** a relatively-positioned root containing (a) a `.cs-view` scroll viewport (`overflow-y: scroll`, native bar hidden via `scrollbar-width: none` + `::-webkit-scrollbar { width: 0 }`) holding `<slot/>`, with right padding equal to the gutter width so content never sits under the gutter; and (b) a `.cs-gutter` absolutely positioned on the right carrying the vine motif (an inline SVG data-URI background, `repeat-y`) and a `.cs-thumb`.
- **Always-reserved + decorated:** the gutter is always rendered, so the reserved width never changes (no layout shift). When content does **not** overflow, the thumb is hidden and only the vine motif shows — the "idle" decorated state the owner validated.
- **Thumb behaviour:** on scroll, JS sets thumb height = `viewH / scrollH × trackH` (min ~30 px) and thumb top from `scrollTop`. The thumb is **draggable** (pointer drag maps back to `scrollTop`). A `ResizeObserver` on the viewport and content recomputes on resize, content change, and locale switch.
- **Reduced motion / a11y:** native keyboard scrolling and wheel still work (the viewport is a real scroll container); the gutter is decorative (`aria-hidden`). The thumb is a presentation element, not a focus target — keyboard users scroll the viewport directly.
- **Props:** none required (slot-driven). Gutter width is a CSS custom property (`--cs-gutter: 14px`) so the popup and rail can tune it.
- **Pure-logic split:** the geometry (given `scrollTop`, `scrollH`, `viewH`, `trackH` → `{ thumbH, thumbTop }`, and the inverse for drag) lives in a pure helper (`scrollThumb.ts`) so it is unit-testable without a DOM.

Used by: the **popup body** (§3) and the **rail stack** (§4).

## 2. `ChroniclePager.vue` — paginated biography (new, reusable)

Splits a long text into height-fitting pages with a gilt page control.

- **Behaviour:** fills the height its parent gives it (CSS-controlled), measures how many words fit, and breaks the text into pages. Renders the current page plus a centered control: `‹  1 / N  ›`. `‹` disabled on the first page, `›` on the last.
- **Short text:** if the whole text fits one page, render it with **no control** (so short biographies look untouched).
- **Re-pagination:** recompute on resize (`ResizeObserver`) and when the text changes (locale switch, different person). Clamp the current page into range after a recompute so a resize never strands the reader past the last page.
- **Measuring approach:** a pure splitter `paginateText(words, fits)` where `fits(wordCount) → boolean` is injected; it binary-searches the largest prefix that fits, then repeats from the remainder. The DOM measurer (an off-screen probe element matching the page's width/typography) supplies `fits`. This keeps the page-breaking algorithm unit-testable with a synthetic `fits` and no real layout.
- **a11y:** the control buttons are real `<button>`s with `person.prevPage` / `person.nextPage` labels; the indicator uses `person.pageOf` (e.g. "{current} / {total}"). The text region gets `aria-live="polite"` so a page turn is announced.
- **Reduced motion:** page changes swap content with no transition (or a minimal cross-fade gated on `prefers-reduced-motion`).

Used by: the biography block in both the popup and the rail `PersonDetail`.

## 3. `PersonHeader.vue` — extracted shared header (new)

Pull the header out of `PersonDetail` so the popup can pin it while the body scrolls, without duplicating markup.

- **Contains:** the portrait/media button + lightbox trigger + media-failure fallback chain (video → still → initials), and the name / maiden name / lifespan / vocation block.
- **State:** owns the `videoFailed` / `imageFailed` / `lightboxOpen` refs that currently live in `PersonDetail` (and the `Teleport`ed `MediaLightbox`), reset when the person changes.
- **Morph contract:** keeps the `data-cascade` attributes on the portrait and heading so the grow-from-medallion cascade (`captureGrowMorph`) still staggers them in.
- Consumed by both `PersonDetail.vue` (rail) and `PersonPopup.vue` (popup).

## 4. State change — drop the popup mode

In `selectionStore`:

- Remove `mode: 'normal' | 'expanded'`, `expand()`, and `collapse()`.
- Content is no longer gated; `open()` no longer resets a mode.
- `PopupMode` type and its references are deleted.

## 5. Popup — `PersonPopup.vue`

Restructure the dialog from "one scrolling card" into **fixed header + scrolling body**:

```
.popup__dialog            (flex column; overflow: hidden; keeps data-flip-id)
  ├── PersonHeader        (flex: 0 0 auto — pinned; data-cascade pieces)
  └── ChronicleScroll     (flex: 1 1 auto — the only scroll region)
        ├── summary       (lead paragraph; data-cascade)
        ├── ChroniclePager(biography)   (bounded height; data-cascade)
        ├── residences    (data-cascade)
        └── links         (data-cascade)
```

- The scroll track now starts **below** the header (matches the sketch).
- Remove the More/Less footer entirely.
- Keep `✕` close and the right-edge dock chevron (`.popup__dock-chevron`) exactly as they are.
- **Morph preservation:** `data-flip-id="dock-card-${biggerViewId}"` stays on `.popup__dialog`; the dock clone (`makeDialogClone`) already forces `overflow: hidden`, so a static snapshot of the new inner-scroll structure flies correctly; `data-cascade` stays on the header + body blocks for the grow cascade. The dialog itself changes from `overflow-y: auto` to `overflow: hidden` (scroll moves inside `ChronicleScroll`).
- The biography pager gets a bounded, view-relative height (e.g. capped so residences/links remain reachable by scrolling); short bios collapse to a single page.

## 6. Rail — `PanelRail.vue` + `PersonDetail.vue`

- **`PanelRail.vue`:** replace the native-scroll `.rail__stack--scroll` with `ChronicleScroll` wrapping the `v-for` of `DockPanel`s, so the rail stack gets the vine scrollbar and the always-reserved decorated gutter. Preserve the rail's pointer-events model (`.rail` is `pointer-events: none`; panels are `pointer-events: auto`) — the `ChronicleScroll` viewport must let background clicks through where there is no panel (viewport `pointer-events: none`, panels re-enable). Keep mobile behaviour (chips/rectangles) unchanged; the vine scroll applies in the scrollable (desktop / rectangles) case.
- **`PersonDetail.vue`:** now `PersonHeader` + body blocks (summary + `ChroniclePager` biography + residences + links). Remove the More/Less footer and all `mode` references; always render full content. No new internal scroll — the panel grows and the rail-stack `ChronicleScroll` handles overflow.

## 7. i18n

- **Remove:** `person.expand` ("More") and `person.collapse` ("Less") from `ru` / `be` / `en`.
- **Add:** `person.prevPage`, `person.nextPage`, `person.pageOf` (e.g. ru "{current} из {total}", en "{current} / {total}", be analog) across all three locales. `messages.spec.ts` (key-parity test) enforces all three stay in sync.

## Module shape

- **`components/ChronicleScroll.vue`** (new) + **`scroll/scrollThumb.ts`** (new, pure geometry).
- **`components/ChroniclePager.vue`** (new) + **`text/paginateText.ts`** (new, pure splitter).
- **`components/PersonHeader.vue`** (new) — extracted from `PersonDetail`.
- **`components/PersonPopup.vue`** — restructured body; chrome + morph hooks unchanged.
- **`components/PersonDetail.vue`** — header via `PersonHeader`, paged bio, footer removed.
- **`components/PanelRail.vue`** — stack wrapped in `ChronicleScroll`.
- **`stores/selectionStore.ts`** — `mode`/`expand`/`collapse` removed.
- **`i18n/messages/{ru,be,en}.ts`** — string changes above.

## Delivery

New branch off `main`, PR back into `main` (squash). TDD throughout. The owner reviews + merges (no self-merge). Docs synced on PR via the `update-docs-for-pr` skill/hook.

## Testing

- **Unit (pure, no DOM):**
  - `scrollThumb` — thumb height/top from `(scrollTop, scrollH, viewH, trackH)`; min-height clamp; no-overflow → hidden; drag inverse (thumb delta → `scrollTop`) including clamping at both ends.
  - `paginateText` — single page when it all fits (→ no control); exact-fit boundary; multi-page split with an injected `fits`; empty / whitespace input; page-clamp after the predicate tightens (resize-shrink).
- **Component:**
  - `ChronicleScroll` — renders slot in the viewport; gutter always present; thumb hidden when content fits, shown + sized when it overflows; drag moves `scrollTop`; `ResizeObserver` recompute (mocked).
  - `ChroniclePager` — first/last disable the right/left control; indicator text via `person.pageOf`; single page hides the control; `aria-live` on the text region.
  - `PersonHeader` — media fallback chain (video→still→initials), lightbox open/close + focus return, locale re-localizes the name (ports the existing `PersonDetail` media specs).
  - `PersonDetail` — no More/Less control; biography + residences + links always rendered; biography routed through `ChroniclePager`.
  - `PersonPopup` — header sits outside the scroll region; body is a `ChronicleScroll`; `data-flip-id` on the dialog; `✕` closes, dock chevron / scrim / Esc route through the morph (assert store after `nextTick`).
  - `PanelRail` — the person stack is wrapped in `ChronicleScroll`; pointer-events let background clicks through.
  - `selectionStore` — `mode`/`expand`/`collapse` gone; `open()` works without them.
  - `messages` — key parity holds after the string changes.
- **Type + whole-suite:** `vue-tsc` clean; full Vitest suite green.
- **Live verification (owner-confirmed):** fixed header stays put while the body scrolls; vine gutter reserved + decorated in popup and rail; pager turns pages; **dock/undock morph still animates** (the headless preview starves rAF, so the morph feel is confirmed live).

## Out of scope

- Per-panel internal scroll inside an expanded rail card (owner chose "rail stack only").
- Paginating residences/links (only the biography is paged; they flow and scroll).
- Mobile chip/rectangle redesign (unchanged).
- Any backend / data-shape change.
