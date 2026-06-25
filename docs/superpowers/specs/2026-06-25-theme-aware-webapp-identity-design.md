# Theme-aware browser chrome colour

**Date:** 2026-06-25
**Status:** Approved (design)

> Scope note: an earlier draft also re-themed the PNG icons / OG card and renamed
> the identity to "Семейное древо". That was dropped — this change is now limited
> to syncing the browser chrome colour with the active theme. The icon set, OG
> card, and "Семейная летопись" identity are unchanged.

## Problem

The app **defaults to the Film theme** (grey `#5c5c5c` canvas, graphite chrome),
but the browser chrome colour was hardcoded to the **Classic** parchment palette:

- `index.html` → `<meta name="theme-color" content="#f4ecd6">`
- `site.webmanifest` → `theme_color` / `background_color` both `#f4ecd6`

So on first load and as a PWA the mobile address bar / splash showed warm cream
while the app rendered grey Film — a mismatch — and the chrome never updated when
the user switched theme.

## The theme → chrome colour map

Browser chrome should blend with the **top of the viewport** in each theme (measured):

| Theme | Top-of-screen colour | `theme-color` / status bar |
| --- | --- | --- |
| **Film** (default) | body `#1b1c1f`, `.app-bar` top `#1b1c1f` | `#1b1c1f` |
| **Classic** | body radial-gradient top `#faf3df` | `#faf3df` |

## Changes

### 1. Dynamic `theme-color` (runtime)
Extend [`applyTheme.ts`](../../../src/frontend/src/styles/applyTheme.ts) so applying a
theme also updates the `<meta name="theme-color">` tag from a
`{ classic: '#faf3df', eighties: '#1b1c1f' }` map (creating the tag if absent).
Already called on load and on every toggle via the `App.vue` watcher, so the
address bar always matches the active theme. Covered by a unit test.

### 2. Static defaults → the default theme (Film)
- `index.html`: `theme-color` → `#1b1c1f` (so first paint, before JS, matches the Film default).
- `site.webmanifest`: `theme_color` → `#1b1c1f`, `background_color` → `#1b1c1f` (graphite PWA splash).

## Out of scope (unchanged)
- The icon set (`favicon.*`, `apple-touch-icon`, `icon-192/512`, maskable), the
  `og-image` card, and `generate-icons.mjs` — all kept as-is (light/parchment).
- The identity text ("Семейная летопись" / "Family Chronicle") and the PWA `name`.
- Document `<title>` and the in-app brand heading (driven by i18n at runtime).

## Verification
- `applyTheme.ts` unit tests: applying `eighties`/`classic` sets the meta tag to the
  mapped colour, creates it when missing, and reuses (no duplicate) on toggle.
- `npm --prefix src/frontend run build` + `npm --prefix src/frontend test` green.
- Live check: load app (Film default) → address bar `#1b1c1f`; toggle to Classic → `#faf3df`.

## Docs impact
[`docs/reference/devices-and-screens.md`](../../reference/devices-and-screens.md) —
note the theme-aware `theme-color` and the graphite manifest colours.
