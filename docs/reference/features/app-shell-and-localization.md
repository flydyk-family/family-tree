# Feature: App Shell, Chronicle & Localization

← back to [features index](README.md) · [reference index](../README.md)

Covers the top bar, the Chronicle / first-visit landing, localization, and the version label. Components: [`App.vue`](../../../src/frontend/src/App.vue), [`AppFrame.vue`](../../../src/frontend/src/components/AppFrame.vue), [`AppBar.vue`](../../../src/frontend/src/components/AppBar.vue), [`TabNav.vue`](../../../src/frontend/src/components/TabNav.vue), [`LanguagePicker.vue`](../../../src/frontend/src/components/LanguagePicker.vue), [`OrientationToggle.vue`](../../../src/frontend/src/components/OrientationToggle.vue), [`ThemeToggle.vue`](../../../src/frontend/src/components/ThemeToggle.vue), [`ChronicleView.vue`](../../../src/frontend/src/views/ChronicleView.vue), [`AppVersion.vue`](../../../src/frontend/src/components/AppVersion.vue); [`router/firstVisit.ts`](../../../src/frontend/src/router/firstVisit.ts); i18n under [`i18n/`](../../../src/frontend/src/i18n/).

## App shell
[`App.vue`](../../../src/frontend/src/App.vue) → `AppFrame` (decorative green/gilt border + corner ornaments, `aria-hidden`) → `AppBar` + `<router-view>`. A fixed bottom-right `v{version}` label ([`AppVersion.vue`](../../../src/frontend/src/components/AppVersion.vue), opacity 0.25, `aria-hidden`) shows the build version; commit is in its tooltip and an injected `<meta name="app-version">`.

The active theme is reflected as `data-theme="eighties"` on `<html>` (Classic removes the attribute entirely). Theme state lives in `uiStore.theme`; apply logic is in [`styles/applyTheme.ts`](../../../src/frontend/src/styles/applyTheme.ts).

## Top bar ([`AppBar.vue`](../../../src/frontend/src/components/AppBar.vue)) — responsive
| Element | Desktop | Mobile |
|---|---|---|
| Tab navigation | Inline `TabNav` | Inside the ☰ sheet |
| Search | Inline, fills the bar | Hidden until ⌕ tapped, then an inline row |
| Language picker | Inline | In the ☰ sheet |
| Orientation toggle | Inline | In the ☰ sheet (full-width) |
| **Theme toggle** | **Inline** | **In the ☰ sheet** |
| Title `<h1>` + subtitle | Shown, centered | **Not rendered**; a centered brand label shows instead |

`Esc` closes the mobile sheet/search. "Mobile" = `(max-width: 1199.98px), (max-height: 559.98px)` — see [devices-and-screens.md](../devices-and-screens.md).

### Tabs ([`TabNav.vue`](../../../src/frontend/src/components/TabNav.vue))
Four tabs: **Chronicle**, **Tree** (active on `/` and `/person/:id`), plus **Members** and **Timeline** which are **`disabled`** with a "Coming soon" tooltip — they do not navigate. Clicking Chronicle → `/chronicle`.

### Theme toggle ([`ThemeToggle.vue`](../../../src/frontend/src/components/ThemeToggle.vue)) {#theme-toggle}

A segmented two-button control (`role="group"`, `aria-label="Theme"`) that switches between **Classic** and **Film** themes. Each button has `aria-pressed` reflecting the active choice. The active button is highlighted via the `theme-toggle__btn--on` class (`data-test="theme-classic"` / `data-test="theme-eighties"`).

| Property | Value |
|---|---|
| `data-test` | `theme-toggle` (group), `theme-classic` (Classic button), `theme-eighties` (Film button) |
| Storage key | `familytree.theme` (localStorage) |
| Default | `classic` |
| HTML side-effect | Active theme as `<html data-theme="eighties">`; Classic removes the attribute |

- Switching is **instant** (CSS token override via `[data-theme='eighties']` selector in [`styles/themes/eighties.scss`](../../../src/frontend/src/styles/themes/eighties.scss)).
- Storage failures (private mode / SSR) are silently ignored; the in-memory state still switches.
- The choice is restored from localStorage on first `uiStore.init()` call (wired in `App.vue`).
- I18n label keys: `theme.label`, `theme.classic`, `theme.eighties` (English: "Theme" / "Classic" / "Film").

See [oak-tree.md](oak-tree.md#eighties-film-theme-medallions) for how the Film theme changes medallion rendering.

## Chronicle / first-visit ([`ChronicleView.vue`](../../../src/frontend/src/views/ChronicleView.vue), [`router/firstVisit.ts`](../../../src/frontend/src/router/firstVisit.ts))
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
- **Switcher ([`LanguagePicker.vue`](../../../src/frontend/src/components/LanguagePicker.vue)):** a button (current flag + native name) opening a `role="menu"` of `menuitemradio` options. `Esc`/focus-out closes. On mobile it lives in the ☰ sheet.
- **What's localized:** all UI strings (tabs, search placeholder, panel controls, person labels, vocation names, link types, stats labels, Chronicle text, orientation labels, media dialog). Server-provided text fields (names, maiden name, summary, biography, place names) come as `LocalizedTextDto`; the client resolves with the fallback chain **requested → ru → en → be → first non-empty**. The message catalogs (en/ru/be) are kept at structural parity (tested).

[`index.html`](../../../src/frontend/index.html) ships static `lang="ru"` / Russian `<title>`; both update at runtime on locale switch.

## QA notes
- Members/Timeline tabs are visible but inert — verify they don't navigate.
- Direct `/chronicle` visit across sessions keeps re-showing Chronicle (documented edge case, not a bug).
- Switching locale must re-localize person names already on screen (reactive) and update `<html lang>` / title.
- Switching theme must be instant (no transition); verify `data-theme` on `<html>` flips correctly and the chosen theme survives a page reload.
- The Film theme toggle button is labelled **"Film"** in English (i18n key `theme.eighties`), not "Eighties" or "80s".
