# Feature: App Shell, Chronicle & Localization

← back to [features index](README.md) · [reference index](../README.md)

Covers the top bar, the Chronicle / first-visit landing, localization, and the version label. Components: `App.vue`, `AppFrame.vue`, `AppBar.vue`, `TabNav.vue`, `LanguagePicker.vue`, `OrientationToggle.vue`, `ChronicleView.vue`, `AppVersion.vue`; `router/firstVisit.ts`; i18n under `i18n/`.

## App shell
`App.vue` → `AppFrame` (decorative green/gilt border + corner ornaments, `aria-hidden`) → `AppBar` + `<router-view>`. A fixed bottom-right `v{version}` label (`AppVersion.vue`, opacity 0.25, `aria-hidden`) shows the build version; commit is in its tooltip and an injected `<meta name="app-version">`.

## Top bar (`AppBar.vue`) — responsive
| Element | Desktop | Mobile |
|---|---|---|
| Tab navigation | Inline `TabNav` | Inside the ☰ sheet |
| Search | Inline, fills the bar | Hidden until ⌕ tapped, then an inline row |
| Language picker | Inline | In the ☰ sheet |
| Orientation toggle | Inline | In the ☰ sheet (full-width) |
| Title `<h1>` + subtitle | Shown, centered | **Not rendered**; a centered brand label shows instead |

`Esc` closes the mobile sheet/search. "Mobile" = `(max-width: 1199.98px), (max-height: 559.98px)` — see [devices-and-screens.md](../devices-and-screens.md).

### Tabs (`TabNav.vue`)
Four tabs: **Chronicle**, **Tree** (active on `/` and `/person/:id`), plus **Members** and **Timeline** which are **`disabled`** with a "Coming soon" tooltip — they do not navigate. Clicking Chronicle → `/chronicle`.

## Chronicle / first-visit (`ChronicleView.vue`, `router/firstVisit.ts`)
A landing page greeting first-time visitors.

**First-visit detection:** `localStorage['familytree.explored'] === 'true'`. If storage is unavailable, every session is treated as first-visit.

**Redirect guard (initial navigation only):** if the target is the bare `tree` route (`/`) and not yet explored → redirect to `/chronicle` (replace). **Deep links bypass it** — `/person/:id` and `/chronicle` load directly.

**Marking explored:** an `afterEach` sets the flag after navigating to **any route other than `/chronicle`**. Consequence (edge case): a user who only ever visits `/chronicle` and never enters the tree is shown Chronicle again next session.

**Content:** heading, ornamental rule, intro paragraph (interpolates the earliest birth year), a stats grid of **5** figures (members, generations, earliest year, with-portraits, living), and an **Enter** button (`data-test="chronicle-enter"`) → `/tree`. The Chronicle tab is always reachable afterward (re-visiting does not clear the flag).

## Localization (i18n)
| Code | Native name | Flag | Order |
|---|---|---|---|
| `en` | English | 🇬🇧 | 1 |
| `ru` | Русский | 🇷🇺 | 2 |
| `be` | Беларуская | 🇧🇾 | 3 |

- **Default:** `ru`.
- **Detection priority:** `localStorage['familytree.locale']` → `navigator.language` 2-char prefix (if supported) → `ru`.
- **Persistence:** every `setLocale` writes localStorage, updates `i18n.global.locale`, `document.documentElement.lang`, and `document.title` (`{brand.titleLead} {brand.titleRest}`).
- **Switcher (`LanguagePicker.vue`):** a button (current flag + native name) opening a `role="menu"` of `menuitemradio` options. `Esc`/focus-out closes. On mobile it lives in the ☰ sheet.
- **What's localized:** all UI strings (tabs, search placeholder, panel controls, person labels, vocation names, link types, stats labels, Chronicle text, orientation labels, media dialog). Server-provided text fields (names, maiden name, summary, biography, place names) come as `LocalizedTextDto`; the client resolves with the fallback chain **requested → ru → en → be → first non-empty**. The message catalogs (en/ru/be) are kept at structural parity (tested).

`index.html` ships static `lang="ru"` / Russian `<title>`; both update at runtime on locale switch.

## QA notes
- Members/Timeline tabs are visible but inert — verify they don't navigate.
- Direct `/chronicle` visit across sessions keeps re-showing Chronicle (documented edge case, not a bug).
- Switching locale must re-localize person names already on screen (reactive) and update `<html lang>` / title.
