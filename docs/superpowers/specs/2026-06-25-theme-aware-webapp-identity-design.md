# Theme-aware webapp identity

**Date:** 2026-06-25
**Status:** Approved (design)

## Problem

The app **defaults to the Film theme** (grey `#5c5c5c` canvas, graphite chrome), but every
browser-level identity surface is hardcoded to the **Classic** parchment palette:

- `index.html` → `<meta name="theme-color" content="#f4ecd6">`
- `site.webmanifest` → `theme_color` / `background_color` both `#f4ecd6`
- All PNG rasters (`apple-touch-icon`, `icon-192/512`, `icon-maskable-512`, `og-image`) are
  baked from the **light/Classic** icon variant.

Result: on first load and as a PWA, the mobile address bar / splash show warm cream while the
app renders grey Film — a mismatch — and the chrome never updates when the user switches theme.

`favicon.svg` is **not** affected: it already carries both a light and a dark drawing and
auto-switches on `prefers-color-scheme`.

## The theme → identity color map

Browser chrome should blend with the **top of the viewport** in each theme (measured):

| Theme | Top-of-screen color | `theme-color` / status bar |
| --- | --- | --- |
| **Film** (default) | body `#1b1c1f`, `.app-bar` top `#1b1c1f` | `#1b1c1f` |
| **Classic** | body radial-gradient top `#faf3df` | `#faf3df` |

## Changes

### 1. Dynamic `theme-color` (runtime)
Extend `src/frontend/src/styles/applyTheme.ts` so applying a theme also updates the
`<meta name="theme-color">` tag from a `{ classic: '#faf3df', eighties: '#1b1c1f' }` map
(creating the tag if absent). Already called on load and on every toggle via the `App.vue`
watcher, so the address bar always matches the active theme. Covered by a unit test.

### 2. Static defaults → the default theme (Film)
- `index.html`: `theme-color` → `#1b1c1f` (so first paint, before JS, matches the Film default).
- `site.webmanifest`: `theme_color` → `#1b1c1f`, `background_color` → `#1b1c1f` (graphite PWA splash).

### 3. Dark raster variants (regenerate via the existing generator)
Edit `src/frontend/scripts/generate-icons.mjs` — **no new tooling**; it already renders from
`icons/family-icons.svg` (light-left / dark-right) with `sharp`:
- Point the PNG rasters (`apple-touch-icon`, `icon-192`, `icon-512`, `icon-maskable-512`) at the
  **dark** crop (`DARK_BOX`) and flatten/maskable-fill on a Film ground (`#1b1c1f`) instead of
  cream. `favicon.svg` and `favicon.ico` are unchanged (the `.ico` keeps the light 16/32/48 —
  ICO has no dark mechanism and a tiny tab favicon reads fine either way; the scalable
  `favicon.svg` already auto-switches).
- Re-run `npm run icons` to rewrite the committed PNGs under `public/`.

### 4. OG social card re-tinted to Film (option B)
In `generate-icons.mjs`, give `ogSvg(...)` a Film palette: graphite ground (`#1b1c1f` →
`#5c5c5c` radial or flat graphite), a steel rule instead of gilt, light ink text, and the
**dark** icon crop. Regenerated `og-image.png` (1200×630) matches the default theme.

### 5. Rename the OG/identity text
The identity name changes from *"Семейная летопись" / "Family Chronicle"* to
**"Семейное древо" / "Family tree"**:
- `index.html`: `og:title` and `og:site_name` → `Семейное древо`.
- `og-image.png` baked text: title → `Семейное древо`, subtitle → `Family tree`.
- `site.webmanifest`: `name` → `Семейное древо`, `short_name` → `Древо` (keeps the installed-app
  name consistent with the new OG identity).

## Out of scope (unchanged)
- Document `<title>` and the in-app brand heading (driven by i18n / `localeStore` at runtime) —
  the user scoped the rename to the OG/identity surfaces only.
- `og:description` and `<meta name="description">` — theme-neutral, still accurate.
- `favicon.svg` / `favicon.ico` art.

## Verification
- `applyTheme.ts` unit test: applying `eighties`/`classic` sets the meta tag to the mapped color
  (and creates it when missing).
- `npm --prefix src/frontend run build` + `npm --prefix src/frontend test` green.
- Re-run `npm run icons`; eyeball the regenerated `og-image.png` and dark icon PNGs.
- Live check: load app (Film default) → address bar `#1b1c1f`; toggle to Classic → `#faf3df`.

## Docs impact
`docs/reference/devices-and-screens.md` documents the icon/identity set — update it for the
new default-theme (Film) rasters, graphite manifest colors, and the renamed identity.
