# Technical Debt & Known Constraints

← back to [reference index](README.md)

## Code hygiene note
A repo-wide scan found **no `TODO`/`FIXME`/`HACK`/`XXX` markers, no `@ts-ignore`/`@ts-expect-error`, no `eslint-disable`, and no skipped tests** in `src/`. The items below are documented workarounds and architectural constraints, not stray markers.

## Known workarounds (with locations)
| Item | Location | Notes |
|---|---|---|
| **`separateOverlaps` nudge** | [`src/frontend/src/layout/treeLayout.ts`](../../src/frontend/src/layout/treeLayout.ts) | Pragmatic post-pass that pushes same-generation medallions apart. The spec ([`2026-06-08-frontend-redesign-design.md`](../../docs/superpowers/specs/2026-06-08-frontend-redesign-design.md)) flags replacing it with a contour-based tidy layout "so medallions never overlap by construction." Still the shipped approach. |
| **Hardcoded Vite proxy port `:5037`** | [`src/frontend/vite.config.ts`](../../src/frontend/vite.config.ts) | `/api` and `/media` proxy targets are literal `http://localhost:5037`; no env override. Moving the API port requires editing the config (see the `run-app` skill). |
| **Non-reactive `matchMedia`** | [`src/frontend/src/motion/reducedMotion.ts`](../../src/frontend/src/motion/reducedMotion.ts) | Reads the media query on each call (no reactive subscription). Comment marks a reactive variant as YAGNI until the ceremony branch needs it. |
| **Oak-hidden-on-mount failure path** | [`src/frontend/src/components/OakTree.vue`](../../src/frontend/src/components/OakTree.vue) | If the viewport `<g>` is missing at mount, a DEV warning logs and the oak stays invisible (the GSAP fade never runs). |
| **Non-null assertion on `stillUrl`** | [`src/frontend/src/components/PersonDetail.vue`](../../src/frontend/src/components/PersonDetail.vue) | `<img :src="stillUrl!">` — logically safe (rendered after a null check) but violates [`CLAUDE.md`](../../CLAUDE.md)'s "avoid `!`" rule. |
| **Vitest `threads` pool shim** | [`src/frontend/vite.config.ts`](../../src/frontend/vite.config.ts) | Forces the `threads` pool because Vitest 4's new `forks` default was slower / flaky for this jsdom suite. |
| **Dev `/media` proxy fallback** | [`src/frontend/vite.config.ts`](../../src/frontend/vite.config.ts) | Without a local `media/` folder, dev proxies `/media` to production; contributors without it get 404 → initials. Accepted, not a bug. |
| **`openai.mjs` not unit-tested** | [`scripts/lib/openai.mjs`](../../scripts/lib/openai.mjs) | The I/O boundary is exercised only via `--dry-run`; surrounding logic is unit-tested. |
| **Stale plan doc** | [`docs/superpowers/plans/2026-06-12-motion-foundation.md`](../../docs/superpowers/plans/2026-06-12-motion-foundation.md) | Describes wiring `stateTween` into the medallion; the shipped design diverged (overlay crossfade). Misleading to a reader. |

## QA-relevant behavioral quirks
(See the feature docs for full context.)
- **Tree-node portrait has no error fallback** — a broken `/media/portraits/...` URL shows a broken image, not initials (the detail panel *does* fall back). → [features/person-details.md](features/person-details.md#media--living-portraits)
- **Muted video autoplay** may be blocked by browser policy without triggering the `@error` fallback. → [features/person-details.md](features/person-details.md#media--living-portraits)
- **Direct `/chronicle` visits** keep re-showing Chronicle across sessions (the explored flag is set only when leaving Chronicle). → [features/app-shell-and-localization.md](features/app-shell-and-localization.md#chronicle--first-visit)
- **404 body** is ProblemDetails JSON, not empty; **400 body** uses camelCase fields. → [features/backend-api.md](features/backend-api.md#error-response-shapes-verified-against-the-live-api)

## Architectural constraints / limitations
- **Read-only data.** No write path anywhere; editing the tree means editing [`family.json`](../../src/backend/FamilyTree.Api/Data/family.json) and redeploying. No `POST/PUT/DELETE`.
- **In-memory store, no DB.** [`family.json`](../../src/backend/FamilyTree.Api/Data/family.json) loaded once at startup behind `IPersonRepository`/`IUnionRepository`.
- **MediatR community license** key (`MediatR:LicenseKey`) is never committed; supplied via env/secret. The app warns (still runs) without it; DI-bootstrapping **tests need it**.
- **Media bytes never in the repo.** Photos/clips live in Cloudflare R2 (`family-tree-media`); the repo holds only filenames. Local `media/` is gitignored. Without R2 access the UI shows initials and no video.
- **Single-origin production proxy.** Browser → Cloudflare Pages only; Pages Functions proxy `/api` (Cloud Run) and `/media` (R2). The Cloud Run URL isn't for direct browser use; production has no CORS (dev CORS allows `:5173` only).
- **Auto-suffixed domain.** Production is `https://family-tree-4fl.pages.dev` (plain `family-tree.pages.dev` is someone else's). Custom domain is future work.
- **No authentication** — the app is fully public.
- **Fictional seed data** in the committed [`family.json`](../../src/backend/FamilyTree.Api/Data/family.json) (31 people); real data would be local/private.
- **Dark mode out of scope** — single parchment palette; no `prefers-color-scheme`.
- **`maximum-scale=1.0`** viewport meta blocks page pinch-zoom (a11y consideration; the SVG has its own pan/zoom).
- **jsdom test env** lacks `matchMedia` and `SVGPathElement.getTotalLength` — stubbed in tests; relevant to anyone extending the suite.
- **Local dev Node** must be ≥ 20.19 (the machine's system Node is now 22, which satisfies this).
