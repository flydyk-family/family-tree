# Feature: Person Details, Panel Rail & Media

← back to [features index](README.md) · [reference index](../README.md)

Covers selecting a person, the right-hand **panel rail**, the **PersonPopup** ("bigger view"), the **PersonDetail** content, and **media / living portraits**.

Components: [`PanelRail.vue`](../../../src/frontend/src/components/PanelRail.vue), [`DockPanel.vue`](../../../src/frontend/src/components/DockPanel.vue), [`StatsPanel.vue`](../../../src/frontend/src/components/StatsPanel.vue), [`PersonDetail.vue`](../../../src/frontend/src/components/PersonDetail.vue), [`PersonPopup.vue`](../../../src/frontend/src/components/PersonPopup.vue), [`MediaLightbox.vue`](../../../src/frontend/src/components/MediaLightbox.vue), [`VocationIcon.vue`](../../../src/frontend/src/components/VocationIcon.vue).

## Stores

- **[`familyStore`](../../../src/frontend/src/stores/familyStore.ts)** — `people`, `unions`, `focusId`, `loading`, `error`. `load()` fetches `/api/family/graph`, sets `focusId` to the default-root person. `defaultRootId` getter falls back to `people[0]`. `setFocus(id)` re-roots the tree (used by search).
- **[`selectionStore`](../../../src/frontend/src/stores/selectionStore.ts)** — `selectedId`, `detail`, `mode` (`'normal'|'expanded'`), `loading`, `error`. `open(id)` fetches `/api/people/:id` (race-guarded; no refetch if already loaded). `expand()`/`collapse()` toggle mode. `close()` resets.
- **[`panelStore`](../../../src/frontend/src/stores/panelStore.ts)** — `personPanels[]`, `statsMinimized`, `railMode` (`'chips'|'rectangles'`), `biggerViewId`. Invariant: **exactly one person expanded at a time**. Key actions: `openPerson`, `expandPerson`, `minimizePerson`, `minimizeAllPersons`, `closePerson`, `expandRail`/`collapseRail`, `expandStats`, `openBiggerView`/`closeBiggerView`, `undock`.

## Panel rail ([`PanelRail.vue`](../../../src/frontend/src/components/PanelRail.vue))
An `<aside>` over the canvas (top-right). Contains: the pinned **stats panel**, a mobile arrow toggle, and the **person panels** stack.

**Desktop (≥1200 px wide AND ≥560 px tall):**
- Person panels are `expanded` or `minimized` (never chips). Stats starts **expanded**.
- A person popped out as the bigger view is hidden from the rail.
- Undock (⤡) button available on person panels.

**Mobile (<1200 px OR <560 px tall):**
- **Chips mode** (default): 48×48 chip buttons hugging the right edge; one letter per person, `⚜` for stats. Tap → open person / expand stats.
- **Rectangles mode**: full-width panels (capped at 360 px). `←` expands the rail (rectangles + minimize all); `→` collapses to chips (membership preserved).
- Stats starts **minimized**. Undock is disabled (`biggerable:false`).

### DockPanel states & controls
`chip` (glyph only) / `minimized` (header bar) / `expanded` (header + body). Header buttons, fixed order: **Undock ⤡ · Expand/Minimize · Close ✕**. Stats panel is `pinned` (🔒) and **not closable**.

## PersonPopup — "bigger view" ([`PersonPopup.vue`](../../../src/frontend/src/components/PersonPopup.vue))
A modal overlay rendered when `panel.biggerViewId` is set. Opened by a **desktop tree-node click** (`openBiggerView` — which **grows the popup out of the clicked medallion** with a content cascade, see below) or the undock ⤡ button. **Mobile node clicks never open it.**

- Structure: full-viewport scrim (`z-index 60`) + a `.popup__shell` wrapping the `section role="dialog" aria-modal="true"` (auto-focuses on mount) and a **floating dock control** (`.popup__dock-chevron`, `data-test="popup-dock"`) just off the dialog's right edge — a chevron that, on hover/focus, grows a rounded-square glass body and ticks toward the rail to show where the card returns. The shell lets the control sit outside the dialog's scroll area. Width `min(560px, 100vw−32px)`, height `min(82vh, 720px)`, glass blur (falls back to opaque parchment if `backdrop-filter` unsupported).
- Contains `<PersonDetail>` (reads `selectionStore` — same person as the rail).

| Action | Result |
|---|---|
| Scrim click / Esc / floating dock chevron | `closeBiggerView()` → returns to rail; **person stays open** |
| ✕ close button | `closePerson(id)` → removes the person from the rail entirely |

No prev/next navigation inside the popup.

### Popup motion — open / dock / undock ([`popupDock.ts`](../../../src/frontend/src/motion/popupDock.ts), [`useDockMorph.ts`](../../../src/frontend/src/composables/useDockMorph.ts))
All three share one **deterministic FLIP** (GSAP core `fromTo`/`from`/`to` — not the Flip plugin): capture a source element's screen rect before the state change, then animate the dialog from it (translate + scale + fade, ~450 ms `morph` token). State is mutated first (synchronous, instantly correct); the morph is layered on top. A second morph completes the in-flight one instantly before starting the next. Under `prefers-reduced-motion` everything is instant.

- **Open (medallion click → `openFrom`).** The dialog **grows out of the clicked medallion** (found by `data-node-id`), and its content **cascades** in — the portrait, the heading, then the summary (the `[data-cascade]` blocks) fade + rise, staggered (`cascade` token). Close still docks to the rail.
- **Undock (rail ⤡ → `undock`).** The dialog flies from the rail card's rect, **growing out of** the slot. The dialog and the rail card pair by `data-flip-id` (`dock-card-{id}`).
- **Dock (dock chevron / scrim / Esc → `closeBiggerView`).** The rail card lives inside the rail's scrollable (clipping) container, so a short-lived **clone of the dialog** in the top layer flies from the dialog's rect and **shrinks into** the slot (fading out as the real rail card fades in beneath it) — unclipped and symmetric with undock. Neighbouring rail panels glide as they reflow (the rail's scrollbar is suppressed during the morph so it doesn't shake). The **✕** close has no rail target, so it is always instant.

Desktop only — the popup never opens on mobile.

## PersonDetail content ([`PersonDetail.vue`](../../../src/frontend/src/components/PersonDetail.vue))
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

**Lightbox ([`MediaLightbox.vue`](../../../src/frontend/src/components/MediaLightbox.vue)):** opens on portrait click (Teleported to body, `z-index 80`). Items: video first (if any), then still. Navigation: ←/→ buttons + arrow keys + dot indicators (hidden for a single item). Close: ✕ / Esc / scrim. Focus moves to the close button on open and returns to the trigger on close. Video error → falls back to still; sole-image error → closes.

## Stats ([`useFamilyStats`](../../../src/frontend/src/composables/useFamilyStats.ts) + [`StatsPanel.vue`](../../../src/frontend/src/components/StatsPanel.vue))
Computed: `members` (count), `earliestBirthYear`, `withPortraits` (has portrait filename), `living` (no death year). The rail's **StatsPanel shows these 4**; the [Chronicle page](app-shell-and-localization.md#chronicle--first-visit) shows the same 4 **plus** a `generations` count (computed from the layout). Empty roster → zeros and em-dash.

## QA edge cases
- Broken portrait URL in a **tree node** → broken image, no initials fallback (differs from the detail panel).
- Muted-autoplay video may be suppressed by browser policy (esp. iOS/Firefox) without triggering the error fallback.
- The popup and the rail panel always show the **same** person (shared [`selectionStore`](../../../src/frontend/src/stores/selectionStore.ts)).
- `gallery[]` exists in the model but is empty in seed data and not surfaced in the UI.
