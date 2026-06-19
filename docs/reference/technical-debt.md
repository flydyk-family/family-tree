# Technical Debt & Known Constraints

← back to [reference index](README.md)

## Code hygiene note
A repo-wide scan found **no `TODO`/`FIXME`/`HACK`/`XXX` markers, no `@ts-ignore`/`@ts-expect-error`, no `eslint-disable`, and no skipped tests** in `src/`. The items below are documented workarounds and architectural constraints, not stray markers.

## Known workarounds (with locations)
| Item | Location | Notes |
|---|---|---|
| **`separateOverlaps` nudge** | [`src/frontend/src/layout/treeLayout.ts`](../../src/frontend/src/layout/treeLayout.ts) | Pragmatic post-pass that pushes same-generation medallions apart. The spec ([`2026-06-08-frontend-redesign-design.md`](../../docs/superpowers/specs/2026-06-08-frontend-redesign-design.md)) flags replacing it with a contour-based tidy layout "so medallions never overlap by construction." Still the shipped approach. |
| **Non-reactive `matchMedia`** | [`src/frontend/src/motion/reducedMotion.ts`](../../src/frontend/src/motion/reducedMotion.ts) | Reads the media query on each call (no reactive subscription). Comment marks a reactive variant as YAGNI until the ceremony branch needs it. |
| **Oak-hidden-on-mount failure path** | [`src/frontend/src/components/OakTree.vue`](../../src/frontend/src/components/OakTree.vue) | If the viewport `<g>` is missing at mount, a DEV warning logs and the oak stays invisible (the GSAP fade never runs). |
| **Non-null assertion on `stillUrl`** | [`src/frontend/src/components/PersonDetail.vue`](../../src/frontend/src/components/PersonDetail.vue) | `<img :src="stillUrl!">` — logically safe (rendered after a null check) but violates [`CLAUDE.md`](../../CLAUDE.md)'s "avoid `!`" rule. |
| **Vitest `threads` pool shim** | [`src/frontend/vite.config.ts`](../../src/frontend/vite.config.ts) | Forces the `threads` pool because Vitest 4's new `forks` default was slower / flaky for this jsdom suite. |
| **Dev `/media` proxy fallback** | [`src/frontend/vite.config.ts`](../../src/frontend/vite.config.ts) | Without a local `media/` folder, dev proxies `/media` to production; contributors without it get 404 → initials. Accepted, not a bug. |
| **`openai.mjs` not unit-tested** | [`scripts/lib/openai.mjs`](../../scripts/lib/openai.mjs) | The I/O boundary is exercised only via `--dry-run`; surrounding logic is unit-tested. |
| **Stale plan doc** | [`docs/superpowers/plans/2026-06-12-motion-foundation.md`](../../docs/superpowers/plans/2026-06-12-motion-foundation.md) | Describes wiring `stateTween` into the medallion; the shipped design diverged (overlay crossfade). Misleading to a reader. |
| **Dead entrance-ceremony finale pulse** | [`src/frontend/src/motion/entrance.ts`](../../src/frontend/src/motion/entrance.ts) | The finale step targets `.oak__gilt-band` for a "medallion ring pulse", but that class exists in **no live component** — the medallion moved to image-based frames. The tween runs but has no DOM targets, making it a silent no-op. Known dead code; not yet removed. |

## QA-relevant behavioral quirks
(See the feature docs for full context.)
- **Tree-node portrait has no error fallback** — a broken `/media/portraits/...` URL shows a broken image, not initials (the detail panel *does* fall back). → [features/person-details.md](features/person-details.md#media--living-portraits)
- **Muted video autoplay** may be blocked by browser policy without triggering the `@error` fallback. → [features/person-details.md](features/person-details.md#media--living-portraits)
- **Direct `/chronicle` visits** keep re-showing Chronicle across sessions (the explored flag is set only when leaving Chronicle). → [features/app-shell-and-localization.md](features/app-shell-and-localization.md#chronicle--first-visit)
- **404 body** is ProblemDetails JSON, not empty; **400 body** uses camelCase fields. → [features/backend-api.md](features/backend-api.md#error-response-shapes-verified-against-the-live-api)

## Architectural constraints / limitations
- **Mostly read-only data.** Public endpoints are read-only (no `POST/PUT/DELETE` for anonymous callers). The one write path — `PUT /api/people/{id}/biography` — is editor-gated.
- **In-memory snapshot for reads.** All reads (public and editor) are served from `FamilySnapshotProvider`, a singleton merged snapshot (seed + overrides) rebuilt on a 10-minute TTL or on an editor save. The underlying family graph comes from [`family.json`](../../src/backend/FamilyTree.Api/Data/family.json) via `IPersonRepository`/`IUnionRepository`.
- **Firestore-backed sessions and overrides in deployment; in-memory locally.** When `Firestore:ProjectId` is set, `FirestoreSessionStore` and `FirestorePersonOverrideStore` provide durable storage. Without it, `InMemorySessionStore` and `InMemoryPersonOverrideStore` are used — they reset on restart and do not share state across instances. Deployment is a single Cloud Run instance, so cross-instance staleness is not a concern in production today.
- **Firestore wrappers carry `[ExcludeFromCodeCoverage]`.** `FirestoreSessionStore` and `FirestorePersonOverrideStore` are thin SDK wrappers with no branching logic — tested with the Firestore emulator only (not required by CI). All logic above the wrappers (snapshot cache, token rotation, store selection, config binding) is covered by unit tests.
- **MediatR community license** key (`MediatR:LicenseKey`) is never committed; supplied via env/secret. The app warns (still runs) without it; DI-bootstrapping **tests need it**.
- **Media bytes never in the repo.** Photos/clips live in Cloudflare R2 (`family-tree-media`); the repo holds only filenames. Local `media/` is gitignored. Without R2 access the UI shows initials and no video.
- **Single-origin production proxy.** Browser → Cloudflare Pages only; Pages Functions proxy `/api` (Cloud Run) and `/media` (R2). The Cloud Run URL isn't for direct browser use; production has no CORS (dev CORS allows `:5173` only). The `Secure` cookie attribute is satisfied in browsers because they treat `localhost` as a secure context for local dev; non-browser HTTP clients on plain `http://` will not replay the cookie automatically.
- **Auto-suffixed domain.** Production is `https://family-tree-4fl.pages.dev` (plain `family-tree.pages.dev` is someone else's). Custom domain is future work.
- **Authentication config not committed.** `Authentication:Google:ClientId` and `Authentication:Google:Editors[]` are sensitive; supplied via user secrets (local) or `Authentication__Google__*` environment variables (CI/deploy). Without them Google validation always fails (no editor can sign in).
- **No frontend sign-in UI yet.** The backend auth endpoints are complete; the browser-facing Google sign-in flow is a separate later PR.
- **Fictional seed data** in the committed [`family.json`](../../src/backend/FamilyTree.Api/Data/family.json) (31 people); real data would be local/private.
- **Dark mode out of scope** — single parchment palette; no `prefers-color-scheme`.
- **`maximum-scale=1.0`** viewport meta blocks page pinch-zoom (a11y consideration; the SVG has its own pan/zoom).
- **jsdom test env** lacks `matchMedia` and `SVGPathElement.getTotalLength` — stubbed in tests; relevant to anyone extending the suite.
- **Local dev Node** must be ≥ 20.19 (the machine's system Node is now 22, which satisfies this).
