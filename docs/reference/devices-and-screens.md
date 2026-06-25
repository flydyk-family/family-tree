# Supported Devices, Screens & Accessibility

← back to [reference index](README.md)

## Breakpoints

| Name | Value | Effect |
|---|---|---|
| **Mobile shell switch** | `(max-width: 1199.98px), (max-height: 559.98px)` | The single canonical "mobile" predicate ([`useMediaQuery`](../../src/frontend/src/composables/useMediaQuery.ts) → `matchMedia`). True if **either** the width is < 1200 px **or** the height is < 560 px. Drives app bar, panel rail, popup suppression. |
| **Narrow desktop** | `(min-width: 1200px) and (max-width: 1299.98px)` ([`NARROW_DESKTOP_MEDIA_QUERY`](../../src/frontend/src/composables/useMediaQuery.ts)) | Above the mobile switch but tight for an inline search field: the app bar **collapses search to a ⌕ icon** that reveals a full-width search row on click. Wider desktops show the inline search pill. |
| **Compact UI tweaks** | `max-width: 640px` | Smaller frame insets, narrower time rail (88→64 px), narrower search field (240→120 px min), reduced Chronicle padding/font. |
| **Oak orientation default** | mobile predicate (the same `(max-width: 1199.98px), (max-height: 559.98px)`) | The oak **defaults to horizontal** on mobile-class viewports, **vertical** otherwise. A responsive default only — a user's explicit orientation toggle wins thereafter. See [search-and-navigation.md](features/search-and-navigation.md#orientation). |
| **Compact focus fit** | mobile predicate | On a mobile-class viewport the initial/refocus fit keeps cards legible: it fits the focus box's **short (time) axis** and lets the wider sibling spread overflow (pannable), anchored on the root, instead of letterboxing the whole box to an unreadable scale. Desktop fits the whole box. See [search-and-navigation.md](features/search-and-navigation.md). |

SCSS tokens: `$bp-rail = 1200px`, `$bp-rail-short = 560px`, `--rail-width = 360px` ([`styles/tokens.scss`](../../src/frontend/src/styles/tokens.scss)). There is **no `prefers-color-scheme` / dark-mode** support — a single warm parchment palette only.

## Device matrix

Captured screenshots under [`docs/screenshots/`](../../docs/screenshots/) are the evidence of tested sizes:

| Screenshot | Resolution | Class | Mode |
|---|---|---|---|
| [`tree-3840x2160.png`](../../docs/screenshots/tree-3840x2160.png) | 3840×2160 | Desktop 4K | desktop |
| [`tree-2560x1440.png`](../../docs/screenshots/tree-2560x1440.png) | 2560×1440 | Desktop 2K | desktop |
| [`tree-1920x1080.png`](../../docs/screenshots/tree-1920x1080.png) | 1920×1080 | Desktop FHD | desktop |
| [`tree-1366x768.png`](../../docs/screenshots/tree-1366x768.png) | 1366×768 | HD laptop | desktop |
| [`tree-mobile-844x390-landscape.png`](../../docs/screenshots/tree-mobile-844x390-landscape.png) | 844×390 | Phone landscape | **mobile** (height 390 < 560) |
| [`tree-mobile-375x812.png`](../../docs/screenshots/tree-mobile-375x812.png) | 375×812 | Phone portrait (iPhone X-class) | mobile |
| [`tree-mobile-360x800.png`](../../docs/screenshots/tree-mobile-360x800.png) | 360×800 | Phone portrait (Android) | mobile |

- **Minimum tested width:** **360 px** (no hard `min-width` guard exists below it).
- **Height trigger:** a wide-but-short window (e.g. 1440-wide snapped under 560 px tall) also enters mobile mode.
- **Not explicitly captured:** tablet portrait (768–1199 px) — it renders in **mobile** mode but is untested at e.g. 768×1024. Flag for QA.

## Desktop vs mobile differences
| Area | Desktop | Mobile |
|---|---|---|
| Top bar | Single-tier 3-column: tabs left, centered `<h1>` + subtitle, search · settings popover · account right (search collapses to a ⌕ icon on narrow desktop) | ☰ sheet + ⌕ search row; brand label instead of `<h1>` |
| Panel rail | Right column (360 px); animated expand/minimize; undock available; stats starts expanded | Chips ↔ rectangles via ←/→; in rectangles a **minimized** panel keeps the 360 px width, a **maximized** one fills full width (animates from the right edge); no undock; stats starts minimized |
| Person popup | Opens on tree-node click | **Never** opens from node clicks |
| Time rail (vertical) | 88 px wide | 64 px wide (≤640 px) |

Font sizes are fixed px (not responsive) except where the media queries above apply.

## Touch vs mouse
- All pointer input (mouse/stylus/touch-pointer) flows through Pointer Events; touch also has dedicated handlers.
- **Mouse:** wheel = zoom about cursor; left-drag = pan after a 4 px threshold.
- **Touch:** 1-finger pan, 2-finger pinch-zoom about the midpoint; `touchmove` preventDefault blocks native scroll/zoom; SVG `touch-action: none`.
- A short tap on a node selects it; a drag does not (4 px guard applies to synthesized touch-pointer events too).

## Accessibility
- **Keyboard:** oak nodes are `role="button" tabindex="0"` activated by Enter/Space; dialogs (PersonPopup, MediaLightbox) trap initial focus and close on Esc; lightbox navigates with ←/→; the settings & account popovers close on Esc/outside-click; search Enter cycles matches.
- **Focus:** `:focus-visible` outlines throughout (gilt or leaf-green); popup focuses the dialog on mount; lightbox returns focus to its trigger on close.
- **ARIA:** dialogs use `role="dialog" aria-modal="true"`; the search counter is `role="status"` (live); the Settings/account popovers are `role="dialog"` (Esc/outside-click close, focus moves in on open); the language options are a `role="radiogroup"` of `role="radio"` buttons with `aria-checked`; orientation/theme toggles use `aria-pressed`; decorative SVG/ornaments are `aria-hidden`; nodes carry `aria-label` = person name.
- **Reduced motion:** `prefers-reduced-motion: reduce` makes camera glide, oak fade-in, and overlay crossfades **instant** (checked live on each call).
- **`lang`:** updated at runtime on locale switch.

### Known a11y gaps (QA flags)
- **No dark mode** (`prefers-color-scheme` absent).
- **`maximum-scale=1.0`** in the viewport meta blocks browser pinch-zoom of the page chrome (WCAG 1.4.4 concern); the SVG has its own pan/zoom but panels/bar are locked.
- **No focus-trap loop** in PersonPopup (Tab can leave the dialog).
- **No `aria-live`** on rail open/close (only the search counter is a live region).
- `--on-accent` on `--bark` (light cream on medium brown) at ~17 px non-bold should be formally contrast-checked.

## Network / host
- **Dev server:** Vite `port 5173` (override with `PORT`), `host: true` → reachable on the LAN at `http://<machine-ip>:5173`; the `/api` proxy runs server-side so LAN clients still reach the one backend. **Preview server** (`:4173`) is localhost-only.
- **Production CSP** ([`public/_headers`](../../src/frontend/public/_headers)): same-origin by default (`default-src 'self'`, `connect-src 'self'`, `img-src 'self' data:`, `font-src 'self'`, `frame-ancestors 'none'`, etc.) — hence self-hosted fonts and the Pages-Function proxies for `/api` and `/media`. The one third party is `https://accounts.google.com/gsi/…` (allowed in `script-src`/`frame-src`/`connect-src`/`style-src`, plus `https://*.googleusercontent.com` in `img-src`), required for the Google sign-in flow.
- **PWA:** [`site.webmanifest`](../../src/frontend/public/site.webmanifest) (`name` "Семейное древо" / `short_name` "Древо", `display: standalone`, theme/background `#1b1c1f`, 192/512/maskable icons, `start_url: "/"`); Apple touch icon present. The PNG icons + `og-image` use the **dark/Film icon variant on a graphite ground**, matching the default Film theme.
- **Browser chrome colour is theme-aware:** the `<meta name="theme-color">` tag is kept in sync with the active theme by [`applyTheme.ts`](../../src/frontend/src/styles/applyTheme.ts) — `#1b1c1f` graphite for Film (also the static default in `index.html`), `#faf3df` parchment for Classic — so the mobile address bar / PWA status bar blend with the top of the viewport. The identity (`<title>` aside) is **"Семейное древо" / "Family tree"**: `og:title`/`og:site_name` in `index.html` and the baked `og-image.png` text.
- **Icons regenerate from one source:** [`generate-icons.mjs`](../../src/frontend/scripts/generate-icons.mjs) (`npm run icons`) renders the favicon set, PWA icons and `og-image` from `icons/family-icons.svg` (light-left / dark-right) via `sharp` + `opentype.js`; `favicon.svg` carries both variants and auto-switches on `prefers-color-scheme`, while `favicon.ico` stays light.
