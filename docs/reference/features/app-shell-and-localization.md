# Feature: App Shell, Chronicle & Localization

← back to [features index](README.md) · [reference index](../README.md)

Covers the top bar, the Chronicle / first-visit landing, localization, and the version label. Components: [`App.vue`](../../../src/frontend/src/App.vue), [`AppFrame.vue`](../../../src/frontend/src/components/AppFrame.vue), [`AppBar.vue`](../../../src/frontend/src/components/AppBar.vue), [`TabNav.vue`](../../../src/frontend/src/components/TabNav.vue), [`SettingsMenu.vue`](../../../src/frontend/src/components/SettingsMenu.vue), [`SettingsPanel.vue`](../../../src/frontend/src/components/SettingsPanel.vue), [`OrientationToggle.vue`](../../../src/frontend/src/components/OrientationToggle.vue), [`ThemeToggle.vue`](../../../src/frontend/src/components/ThemeToggle.vue), [`SignInControl.vue`](../../../src/frontend/src/components/SignInControl.vue), [`ChronicleView.vue`](../../../src/frontend/src/views/ChronicleView.vue), [`AppVersion.vue`](../../../src/frontend/src/components/AppVersion.vue); [`router/firstVisit.ts`](../../../src/frontend/src/router/firstVisit.ts); i18n under [`i18n/`](../../../src/frontend/src/i18n/).

## App shell
[`App.vue`](../../../src/frontend/src/App.vue) → `AppFrame` (decorative green/gilt border + corner ornaments, `aria-hidden`) → `AppBar` + `<router-view>`. A fixed bottom-right `v{version}` label ([`AppVersion.vue`](../../../src/frontend/src/components/AppVersion.vue), opacity 0.25, `aria-hidden`) shows the build version; commit is in its tooltip and an injected `<meta name="app-version">`.

The active theme is reflected as `data-theme="eighties"` on `<html>` (Classic removes the attribute entirely). Theme state lives in `uiStore.theme`; apply logic is in [`styles/applyTheme.ts`](../../../src/frontend/src/styles/applyTheme.ts).

## Top bar ([`AppBar.vue`](../../../src/frontend/src/components/AppBar.vue)) — responsive

The desktop bar is a **single tier** laid out as a 3-column grid (`1fr auto 1fr`): tab navigation on the left, the centered masthead (compact `<h1>` title + lineage subtitle) in the middle, and a fixed trailing cluster — **Search · Settings · Account** — on the right. The trailing items have stable widths and do not wrap, so the bar no longer reflows across desktop widths.

The set-and-forget display preferences (language, theme, orientation) are consolidated behind one **Settings** popover ([`SettingsMenu.vue`](../../../src/frontend/src/components/SettingsMenu.vue) → [`SettingsPanel.vue`](../../../src/frontend/src/components/SettingsPanel.vue)). Sign-in occupies a fixed **account** slot (see [Sign in / Sign out](#sign-in--sign-out)).

| Element | Desktop | Mobile |
|---|---|---|
| Tab navigation | Inline `TabNav` (left column) | Inside the ☰ sheet |
| Title `<h1>` + subtitle | Centered masthead (middle column) | **Not rendered**; a centered brand label shows instead |
| Search | Inline pill (right cluster); **collapses to a ⌕ icon on narrow desktop** (1200–1299.98px) that reveals a full-width search row | Hidden until ⌕ tapped, then an inline row |
| Settings popover (language + theme + orientation) | A single trigger button (right cluster) opening an anchored panel | The same `SettingsPanel` rendered inline inside the ☰ sheet |
| Account (sign in / avatar menu) | Fixed account slot (rightmost) | Top-right of the bar (after ⌕) |

`Esc` closes the mobile sheet/search and the Settings / account popovers. "Mobile" = `(max-width: 1199.98px), (max-height: 559.98px)`; "narrow desktop" = `(min-width: 1200px) and (max-width: 1299.98px)` (`NARROW_DESKTOP_MEDIA_QUERY`) — see [devices-and-screens.md](../devices-and-screens.md).

### Settings popover ([`SettingsMenu.vue`](../../../src/frontend/src/components/SettingsMenu.vue), [`SettingsPanel.vue`](../../../src/frontend/src/components/SettingsPanel.vue))

A trigger button (`data-test="settings-menu-toggle"`, `aria-haspopup="menu"`, `aria-expanded`, labelled by `settings.label`) opens a panel (`data-test="settings-menu-panel"`, rendered only while open) that hosts three labelled groups via the reusable `SettingsPanel`:

- **Language** — an inline `role="radiogroup"` of the three locales (flag + native name, `role="radio"`, `data-test="settings-language-option"`, `aria-checked` on the active one); selecting one calls `localeStore.setLocale`. No nested dropdown.
- **Theme** — the [`ThemeToggle`](#theme-toggle) segmented control.
- **Orientation** — the `OrientationToggle` segmented control (always present, regardless of the active view).

The popover is a `role="dialog"`: it dismisses on `Esc` (returning focus to the trigger) and on an outside pointer press, and moves focus into the panel when it opens (shared `usePopover` composable, also used by the account menu). `SettingsPanel` is reused verbatim inside the mobile ☰ sheet, so both surfaces present the same controls.

### Tabs ([`TabNav.vue`](../../../src/frontend/src/components/TabNav.vue))
Four tabs: **Chronicle**, **Tree** (active on `/` and `/person/:id`), plus **Members** and **Timeline** which are **`disabled`** with a "Coming soon" tooltip — they do not navigate. Clicking Chronicle → `/chronicle`.

### Theme toggle ([`ThemeToggle.vue`](../../../src/frontend/src/components/ThemeToggle.vue)) {#theme-toggle}

A segmented two-button control (`role="group"`, `aria-label="Theme"`) that switches between **Classic** and **Film** themes. Each button has `aria-pressed` reflecting the active choice. The active button is highlighted via the `theme-toggle__btn--on` class (`data-test="theme-classic"` / `data-test="theme-eighties"`).

| Property | Value |
|---|---|
| `data-test` | `theme-toggle` (group), `theme-classic` (Classic button), `theme-eighties` (Film button) |
| Storage key | `familytree.theme` (localStorage) |
| Default | `eighties` (Film) |
| HTML side-effect | Active theme as `<html data-theme="eighties">`; Classic removes the attribute |

- Switching is **instant** (CSS token override via `[data-theme='eighties']` selector in [`styles/themes/eighties.scss`](../../../src/frontend/src/styles/themes/eighties.scss)).
- Storage failures (private mode / SSR) are silently ignored; the in-memory state still switches.
- The choice is restored from localStorage on first `uiStore.init()` call (wired in `App.vue`).
- I18n label keys: `theme.label`, `theme.classic`, `theme.eighties` (English: "Theme" / "Classic" / "Film").
- Under the Film theme the top header (`.app-bar`) gets a dark graphite band (`linear-gradient(0deg, #232529, #1b1c1f)` — darker at the top, lighter toward the bottom) with a `--panel-edge` bottom rule and a soft drop shadow, so the masthead separates from the `#5c5c5c` medallion canvas; Classic leaves the header transparent.

See [oak-tree.md](oak-tree.md#eighties-film-theme-medallions) for how the Film theme changes medallion rendering.

## Sign in / Sign out {#sign-in--sign-out}

Authentication uses **Google Identity Services** (the one-tap / credential flow). The Google client ID is supplied at build time via the `VITE_GOOGLE_CLIENT_ID` environment variable (a public value set in the Cloudflare Pages environment for production builds). **When `VITE_GOOGLE_CLIENT_ID` is unset (typical local dev), the sign-in control renders nothing and the app is otherwise unchanged** — `fetchMe()` still resolves to a signed-out state.

### App bar placement

Sign-in occupies a fixed **account slot** at the right end of the desktop bar and at the **top-right of the mobile bar** (`data-test="mobile-account"`, rightmost after the ⌕ button — not in the ☰ sheet). When signed out it shows the Google button (compact circular **icon** on mobile, full **standard** button on desktop, via `SignInControl`'s `compact` prop); when signed in it collapses to an **initials avatar** that opens an account menu. The slot only renders when GIS is configured (`VITE_GOOGLE_CLIENT_ID` set). The account menu is right-aligned to the slot, so on mobile it opens leftward from the top-right corner and stays on-screen.

The standard (desktop) button is **themed to match the active app theme** — GIS only offers three button themes, so the one with the best contrast on each header band is chosen: `filled_black` on the dark **Film** band, `outline` on the parchment **Classic** band. It is a rectangular button with the short **"Sign in"** label. The compact mobile **icon** always uses the recognizable blue Google circle (`filled_blue`) since it reads on either band, and re-renders in place when the theme changes.

The button is **localized to the app language**: the GIS client script is loaded with `?hl=<locale>` (ru/be/en). This script-level locale is the authoritative lever — GIS's per-button `locale` option is overridden by the signed-in Google account's session locale, so without `?hl=` the button would render in the account's language, not the app's. Because GIS bakes its UI language at script-load time, switching the app language **tears down and re-loads** the GIS client with the new `?hl=` so the button re-localizes in place.

| Element | Desktop | Mobile |
|---|---|---|
| Sign in with Google button (signed out) | Account slot, rightmost (standard button) | Top-right of the bar (compact icon) |
| Initials avatar (signed in) | Account slot — opens the account menu (`data-test="account-avatar"`) | Top-right of the bar — opens the account menu |
| Signed-in identity (name + email) | Inside the account menu (`data-test="account-menu"`) | Inside the account menu |
| **Editor** badge | Inside the account menu (when `canEdit`) | Inside the account menu |
| Sign out button | Inside the account menu | Inside the account menu |

### Sign-in flow

1. The GIS button is rendered by `SignInControl.vue` using the GIS script injected at startup (no-op when the client ID is absent).
2. After the user selects a Google account, GIS calls back with a **credential response** containing a Google ID token.
3. The frontend `POST`s the ID token to `/api/auth/session` (`credentials: 'include'` — no Authorization header). On `200` the server has set an `HttpOnly ft_session` cookie and returned `{ email, name, canEdit }`.
4. `authStore` stores `name`, `email`, and `canEdit`; `signedIn` becomes `true`.
5. If the server returns `401` (email not verified or not in the Firestore allow-list for session creation), the sign-in is silently rejected and the control stays in the signed-out state.

### Identity display and Editor badge

When `signedIn` is `true`, the account slot shows an **initials avatar** (two letters derived from the name — first letters of the first two words — falling back to the first two characters of the name/email). Clicking it opens the account menu, which shows the signed-in user's **name** (falling back to **email** when no name is present) and, when `canEdit` is `true`, an **Editor** badge. The frontend never sees the editor allow-list — it receives only the server-computed `canEdit` boolean. (The avatar is initials-only today; wiring the Google `picture` claim is a later enhancement.)

### On-load hydration

`App.vue` calls `authStore.fetchMe()` on mount, which calls `GET /api/auth/me` (`credentials: 'include'`). The endpoint always returns `200` with a `signedIn` flag (it is anonymous-friendly, so a not-signed-in load is not a console/network error). If `signedIn` is true the store is hydrated with `{ email, name, canEdit }` without a fresh sign-in; otherwise (no cookie, expired, or unrecognised) the store stays in the signed-out state.

### Sign-out flow

Clicking **Sign out** calls `POST /api/auth/logout` (`credentials: 'include'`), which deletes the server-side session and clears the cookie. `authStore` is reset to the signed-out state regardless of the response status.

### Biography editing

Editors can sign in and see the **Editor** badge, but there is **no in-app biography editor yet** — the frontend affordance that calls `PUT /api/people/{id}/biography` is the next PR. The backend endpoint is fully functional and can be exercised via HTTP clients.

### Stores and keys

- State lives in `authStore` (`src/frontend/src/stores/authStore.ts`) — `signedIn`, `name`, `email`, `canEdit`.
- All auth API calls use `credentials: 'include'` so the `ft_session` cookie is forwarded through the Cloudflare Pages proxy to the Cloud Run API.
- No auth state is persisted to `localStorage`; it is always re-derived from the session cookie via `fetchMe()` on load.

### QA notes

- When `VITE_GOOGLE_CLIENT_ID` is unset (local dev without a client ID), the sign-in control **must not render** (the account slot is empty) and the rest of the app must be unchanged.
- A signed-in user with `canEdit: false` sees the avatar; opening the account menu shows their identity but **no Editor badge**.
- A signed-in user with `canEdit: true` sees the **Editor** badge inside the account menu; it has no behavior (a display element, not a navigation target).
- Sign-out (from inside the account menu) must reset to the signed-out state immediately without a page reload.
- Public viewing (the oak tree, person details, search) is **unchanged** for unauthenticated users.

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
- **Switcher:** the language control lives in the **Settings** popover (and the mobile ☰ sheet) as an inline `role="radiogroup"` of flag + native-name options ([`SettingsPanel.vue`](../../../src/frontend/src/components/SettingsPanel.vue), `role="radio"`, `data-test="settings-language-option"`, `aria-checked` on the active locale); selecting one calls `localeStore.setLocale`.
- **What's localized:** all UI strings (tabs, search placeholder, panel controls, person labels, vocation names, link types, stats labels, Chronicle text, orientation labels, media dialog). Server-provided text fields (names, maiden name, summary, biography, place names) come as `LocalizedTextDto`; the client resolves with the fallback chain **requested → ru → en → be → first non-empty**. The message catalogs (en/ru/be) are kept at structural parity (tested).

[`index.html`](../../../src/frontend/index.html) ships static `lang="ru"` / Russian `<title>`; both update at runtime on locale switch.

## QA notes
- Members/Timeline tabs are visible but inert — verify they don't navigate.
- Direct `/chronicle` visit across sessions keeps re-showing Chronicle (documented edge case, not a bug).
- Switching locale must re-localize person names already on screen (reactive) and update `<html lang>` / title.
- Switching theme must be instant (no transition); verify `data-theme` on `<html>` flips correctly and the chosen theme survives a page reload.
- The Film theme toggle button is labelled **"Film"** in English (i18n key `theme.eighties`), not "Eighties" or "80s".
