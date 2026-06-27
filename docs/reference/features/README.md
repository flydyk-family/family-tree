# Features

← back to [reference index](../README.md)

All application behavior, split by surface. Each document lists **what renders, what triggers it, the states involved, and edge cases** — written so a QA agent can derive test cases directly.

| Document | Surface |
|---|---|
| [backend-api.md](backend-api.md) | HTTP endpoints, DTO contracts, validation, errors, health, rate-limit, security headers, CORS |
| [oak-tree.md](oak-tree.md) | The SVG oak: structure, layout engine, medallions, time rail, motion |
| [person-details.md](person-details.md) | Selection, panel rail, person popup, person detail, media / living portraits, lightbox |
| [search-and-navigation.md](search-and-navigation.md) | Search, pan/zoom, `/person/:slug` deep links, orientation, initial framing |
| [app-shell-and-localization.md](app-shell-and-localization.md) | App bar & tabs, sign-in / identity / Editor badge / sign-out, Chronicle / first-visit, i18n (ru/be/en), stats, version label |

## Cross-cutting behavior

- **State lives in Pinia stores** ([`familyStore`](../../../src/frontend/src/stores/familyStore.ts), [`selectionStore`](../../../src/frontend/src/stores/selectionStore.ts), [`panelStore`](../../../src/frontend/src/stores/panelStore.ts), [`localeStore`](../../../src/frontend/src/stores/localeStore.ts), [`uiStore`](../../../src/frontend/src/stores/uiStore.ts)). Their fields and actions are documented inline where they drive a surface; the canonical list is in [person-details.md](person-details.md#stores) and [search-and-navigation.md](search-and-navigation.md).
- **Persistence (localStorage):** `familytree.locale` (language), `familytree.orientation` (tree orientation), `familytree.explored` (first-visit flag), `familytree.theme` (Classic / Film theme choice). Search state is **not** persisted.
- **Motion** is centralized in [`motion/`](../../../src/frontend/src/motion/) (GSAP). All animation honors `prefers-reduced-motion` (instant instead of tweened). See [oak-tree.md](oak-tree.md#motion).
- **Reminder:** the **Members/Timeline** tabs are NOT shipped (rendered but disabled); the biography **editor UI** is also NOT shipped — see [roadmap.md](../roadmap.md).
