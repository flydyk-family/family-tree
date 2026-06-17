# Feature: Person Details, Panel Rail & Media

← back to [features index](README.md) · [reference index](../README.md)

Covers selecting a person, the right-hand **panel rail**, the **PersonPopup** ("bigger view"), the **PersonDetail** content, and **media / living portraits**.

Components: [`PanelRail.vue`](../../../src/frontend/src/components/PanelRail.vue), [`DockPanel.vue`](../../../src/frontend/src/components/DockPanel.vue), [`StatsPanel.vue`](../../../src/frontend/src/components/StatsPanel.vue), [`PersonDetail.vue`](../../../src/frontend/src/components/PersonDetail.vue), [`PersonHeader.vue`](../../../src/frontend/src/components/PersonHeader.vue), [`PersonDossier.vue`](../../../src/frontend/src/components/PersonDossier.vue), [`PersonPopup.vue`](../../../src/frontend/src/components/PersonPopup.vue), [`ChronicleScroll.vue`](../../../src/frontend/src/components/ChronicleScroll.vue), [`ChroniclePager.vue`](../../../src/frontend/src/components/ChroniclePager.vue), [`MediaLightbox.vue`](../../../src/frontend/src/components/MediaLightbox.vue), [`VocationIcon.vue`](../../../src/frontend/src/components/VocationIcon.vue).

## Stores

- **[`familyStore`](../../../src/frontend/src/stores/familyStore.ts)** — `people`, `unions`, `focusId`, `loading`, `error`. `load()` fetches `/api/family/graph`, sets `focusId` to the default-root person. `defaultRootId` getter falls back to `people[0]`. `setFocus(id)` changes the layout's centering anchor; the whole connected tree is rendered regardless (search no longer calls it).
- **[`selectionStore`](../../../src/frontend/src/stores/selectionStore.ts)** — `selectedId`, `detail`, `loading`, `error`, `cache` (id → detail). `open(id)` serves from a **per-session cache** when the person was viewed before (instant — no fetch, no loading flash); otherwise it fetches `/api/people/:id` (race-guarded) and caches the result. The seed data is read-only, so cached details never go stale; `close()` resets the selection but **keeps the cache**. There is no `mode`/`expand()`/`collapse()` — the old "normal vs expanded" biography toggle was removed in favour of an always-visible **paginated, scrolling reader** (see PersonDetail content below). The rail feeds each panel from `cache` directly (not the shared `detail`) so a panel keeps its content while minimized.
- **[`panelStore`](../../../src/frontend/src/stores/panelStore.ts)** — `personPanels[]`, `statsMinimized`, `railMode` (`'chips'|'rectangles'`), `biggerViewId`. Invariant: **exactly one person expanded at a time**. Key actions: `openPerson`, `expandPerson`, `minimizePerson`, `minimizeAllPersons`, `closePerson`, `expandRail`/`collapseRail`, `expandStats`, `openBiggerView`/`closeBiggerView`, `undock`.

## Panel rail ([`PanelRail.vue`](../../../src/frontend/src/components/PanelRail.vue))
An `<aside>` over the canvas (top-right). Contains: the pinned **stats panel**, a mobile arrow toggle, and the **person panels** stack.

**Desktop (≥1200 px wide AND ≥560 px tall):**
- Person panels are `expanded` or `minimized` (never chips). Stats starts **expanded**.
- A person popped out as the bigger view is hidden from the rail.
- Undock (⤡) button available on person panels.

**Mobile (<1200 px OR <560 px tall):**
- **Chips mode** (default): 48×48 chip buttons hugging the right edge; one letter per person, `⚜` for stats. Tap → open person / expand stats.
- **Rectangles mode**: `←` expands the rail (rectangles + minimize all); `→` collapses to chips (membership preserved). Per-state widths — a **minimized** person panel keeps the compact rail width (`min(100%, 360 px)`), a **maximized** one fills the full width; both hug the right edge, so the min↔max width change animates from the right (maximize opens right→left, minimize closes left→right). The pinned stats panel stays capped at the 360 px rail width.
- Stats starts **minimized**. Undock is disabled (`biggerable:false`).

### DockPanel states & controls
`chip` (glyph only) / `minimized` (header bar) / `expanded` (header + body). Header buttons, fixed order: **Undock ⤡ · Expand/Minimize · Close ✕**. Stats panel is `pinned` (🔒) and **not closable**.

**Minimize ↔ maximize is animated and the body stays mounted.** The panel body is always rendered; minimizing collapses it via a `0fr↔1fr` CSS grid row (≈150 ms) rather than unmounting — so the person's detail (and its current biography page / scroll position) survives a min→max round-trip with no refetch and no re-render. The panel and its body sit on their own compositor layers (`will-change: transform`) so the collapse composites instead of repainting the oak behind it. Honours `prefers-reduced-motion` (instant).

## PersonPopup — "bigger view" ([`PersonPopup.vue`](../../../src/frontend/src/components/PersonPopup.vue))
A modal overlay rendered when `panel.biggerViewId` is set. Opened by a **desktop tree-node click** (`openBiggerView` — which **grows the popup out of the clicked medallion** with a content cascade, see below) or the undock ⤡ button. **Mobile node clicks never open it.**

- Structure: full-viewport scrim (`z-index 60`) + a `.popup__shell` wrapping the `section role="dialog" aria-modal="true"` (auto-focuses on mount) and a **floating dock control** (`.popup__dock-chevron`, `data-test="popup-dock"`) just off the dialog's right edge — a chevron that, on hover/focus, grows a rounded-square glass body and ticks toward the rail to show where the card returns. The shell lets the control sit outside the dialog's scroll area. Width `min(560px, 100vw−32px)`, height `min(82vh, 720px)`, glass blur (falls back to opaque parchment if `backdrop-filter` unsupported).
- The dialog is a **flex column with a fixed header and a scrolling body**: a `PersonHeader` (portrait + name + lifespan) stays pinned at the top while a `ChronicleScroll`-wrapped `PersonDossier` (summary + paginated biography + residences + links) scrolls beneath it. The dialog itself is `overflow: hidden` — there is no page-level scrollbar; scrolling happens inside the body via the custom **vine scrollbar** (16 px gutter). Reads `selectionStore` (`detail`/`loading`/`error`) — same person as the rail.

| Action | Result |
|---|---|
| Scrim click / Esc / floating dock chevron | `closeBiggerView()` → returns to rail; **person stays open** |
| ✕ close button | `closePerson(id)` → removes the person from the rail entirely |

No prev/next navigation **between people** inside the popup. (The biography itself has page ‹/› controls — see ChroniclePager below.)

### Popup motion — open / dock / undock ([`popupDock.ts`](../../../src/frontend/src/motion/popupDock.ts), [`useDockMorph.ts`](../../../src/frontend/src/composables/useDockMorph.ts))
All three share one **deterministic FLIP** (GSAP core `fromTo`/`from`/`to` — not the Flip plugin): capture a source element's screen rect before the state change, then animate the dialog from it (translate + scale + fade, ~450 ms `morph` token). State is mutated first (synchronous, instantly correct); the morph is layered on top. A second morph completes the in-flight one instantly before starting the next. Under `prefers-reduced-motion` everything is instant.

- **Open (medallion click → `openFrom`).** The dialog **grows out of the clicked medallion** (found by `data-node-id`), and its content **cascades** in — the portrait, the heading, then the summary (the `[data-cascade]` blocks) fade + rise, staggered (`cascade` token). Close still docks to the rail.
- **Undock (rail ⤡ → `undock`).** The dialog flies from the rail card's rect, **growing out of** the slot. The dialog and the rail card pair by `data-flip-id` (`dock-card-{id}`).
- **Dock (dock chevron / scrim / Esc → `closeBiggerView`).** The rail card lives inside the rail's scrollable (clipping) container, so a short-lived **clone of the dialog** in the top layer flies from the dialog's rect and **shrinks into** the slot (fading out as the real rail card fades in beneath it) — unclipped and symmetric with undock. Neighbouring rail panels glide as they reflow (the rail's scrollbar is suppressed during the morph so it doesn't shake). The **✕** close has no rail target, so it is always instant.

Desktop only — the popup never opens on mobile.

## PersonDetail content ([`PersonDetail.vue`](../../../src/frontend/src/components/PersonDetail.vue))
A thin shell composed of a **PersonHeader** + a **PersonDossier**. There is **no More/Less expand toggle** — everything is shown, with the long biography in a paginated reader.

- **[`PersonDetail.vue`](../../../src/frontend/src/components/PersonDetail.vue)** is **prop-driven** (`detail` / `loading` / `error`), not a store reader. In the **rail** each panel is fed its own person's detail from `selectionStore.cache` (so it survives minimize); the **popup** composes `PersonHeader` + `PersonDossier` directly from `selectionStore`. Renders localized loading / error status when there's no detail (e.g. an invalid deep-link id surfaces the fetch error).
- **Header ([`PersonHeader.vue`](../../../src/frontend/src/components/PersonHeader.vue)):** 84×84 circular portrait (video → still → initials, see below; clickable → lightbox), full localized name, optional `née {maidenName}`, formatted lifespan — the **full `день.месяц.год`** when the day and month are known (`01.01.1861–19.03.1916`), else `MM.YYYY` or the year alone, with `~` for approximate dates — vocation icon + label. (The tree medallion still shows only the compact year span.)
- **Dossier ([`PersonDossier.vue`](../../../src/frontend/src/components/PersonDossier.vue)):** localized `summary`; the **biography** in a paginated reader (ChroniclePager); residences (`{place} {from}–{to|present}` with optional 🗺 map link); social links by type. Each block carries `data-cascade` for the popup-open content cascade.

### Vine scrollbar ([`ChronicleScroll.vue`](../../../src/frontend/src/components/ChronicleScroll.vue))
A custom overlay scrollbar styled to the heraldic skin, used on the **rail panel stack** (desktop + mobile rectangles) and inside the **popup body**. The native bar is hidden (`scrollbar-width: none` / `::-webkit-scrollbar { width: 0 }`); an absolutely-positioned **gutter** painted with a repeating engraved-vine SVG is always present (so the rail reserves a decorated strip even when nothing scrolls), with a draggable gilt **thumb** on top. The thumb is shown **only when the content overflows** and sized/positioned from the scroll metrics; dragging it scrolls the viewport. Gutter width is themeable via `--cs-gutter` (16 px in the popup). The gutter is click-through (`pointer-events: none`) so it never blocks the oak beneath the rail; only the thumb is interactive.

### Paginated biography reader ([`ChroniclePager.vue`](../../../src/frontend/src/components/ChroniclePager.vue))
Splits a long biography into fixed-height pages (height from `--pager-page-h`: rail `min(48vh, 460px)`, popup `min(42vh, 340px)`). It measures with an off-screen probe at the real page width and **greedy binary-searches** the largest token run that fits ([`paginate()`](../../../src/frontend/src/text/paginateText.ts)). When there is **more than one page** it shows a centred control — `‹` prev / `next` `›` buttons (disabled at the ends) and a localized `{current} of {total}` count (`person.pageOf`); a single page shows the full text with no control. Pages preserve paragraph breaks and never open on a blank line. Re-paginates on width/height changes (coalesced) but skips work while the panel is collapsed (height 0) — so a minimized panel re-paginates only when re-expanded.

## Media / living portraits

URLs: `/media/portraits/{encodeURIComponent(filename)}`. In production served from R2 via a Pages Function; in dev from a local `media/` folder or proxied from production. **Without media, the UI degrades to initials.** See [ci-cd.md](../ci-cd.md#media).

**Tree node (medallion):** still image only; null portrait → initials. **No `@error` fallback on the SVG `<image>`** — a broken portrait URL shows a broken-image box, *not* initials. *(QA edge case.)*

**Detail panel — three-tier fallback chain:**
1. **Video** (`portraitVideo`): `<video autoplay muted loop playsinline>` with the still as poster. Autoplay is **unconditional** (not gated/in-view) and always muted — browsers that block muted autoplay may not start it; the fallback only fires on a real `@error`.
2. **Still** (`portrait`): `<img>` with `@error` → tier 3.
3. **Initials.**
Failure flags reset when a different person opens.

**Lightbox ([`MediaLightbox.vue`](../../../src/frontend/src/components/MediaLightbox.vue)):** opens on portrait click (Teleported to body, `z-index 80`). Items: video first (if any), then still. Navigation: ←/→ buttons + arrow keys + dot indicators (hidden for a single item). Close: ✕ / Esc / scrim. Focus moves to the close button on open and returns to the trigger on close. Video error → falls back to still; sole-image error → closes.

## Stats ([`useFamilyStats`](../../../src/frontend/src/composables/useFamilyStats.ts) + [`StatsPanel.vue`](../../../src/frontend/src/components/StatsPanel.vue))
Computed: `members` (count), `earliestBirthYear`, `withPortraits` (has portrait filename), `living` (no death year). The rail's **StatsPanel shows these 4**; the [Chronicle page](app-shell-and-localization.md#chronicle--first-visit) shows the same 4 **plus** a `generations` count (computed from the layout). Empty roster → zeros and em-dash.

## QA edge cases
- Broken portrait URL in a **tree node** → broken image, no initials fallback (differs from the detail panel).
- Muted-autoplay video may be suppressed by browser policy (esp. iOS/Firefox) without triggering the error fallback.
- The popup and the rail panel always show the **same** person (shared [`selectionStore`](../../../src/frontend/src/stores/selectionStore.ts)).
- Re-opening a person viewed earlier in the session (e.g. maximizing a docked panel after switching people) is served from the store cache — **no new `/api/people/:id` request** (verify in DevTools → Network).
- `gallery[]` exists in the model but is empty in seed data and not surfaced in the UI.
- The biography **page count is layout-dependent** — it changes with the page-height tokens (rail vs popup) and on resize, so the same person can show a different "N of M" in the rail vs the popup. A short biography shows **no** pager control.
- The vine **gutter is always visible** on the rail/popup; the **thumb only appears when content overflows** the viewport. The gutter is decorative and click-through.
- Minimizing then re-maximizing a rail panel keeps the **same biography page and scroll position** (the body is not unmounted) and triggers **no** `/api/people/:id` refetch.
