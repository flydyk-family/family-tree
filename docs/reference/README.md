# Family Chronicle — Reference Documentation

A connected, behavior-level reference for the **Family Chronicle** app (a `.NET 10` JSON-backed API + a Vue 3 SVG "oak" SPA). It is written for **QA agents**: every section describes *observable behavior* grounded in the actual code, not just intent.

- **Documented version:** [`VERSION`](../../VERSION) = **0.5.0** (commit `20bee94` on `main`).
- **Production URL:** <https://family-tree-4fl.pages.dev>
- **Source of truth:** the code in [`src/`](../../src/). Specs/plans under [`docs/superpowers/`](../../docs/superpowers/) describe intent and were cross-checked; where shipped behavior diverges, this reference follows the code and the divergence is recorded in [roadmap.md](roadmap.md) / [technical-debt.md](technical-debt.md).

> ⚠️ **Read this first — what is live vs. not.** Several spec'd features are **not** in the shipped build and must not be tested as present on production:
> - **Members** and **Timeline** top-bar tabs — rendered but **disabled** ("Coming soon"); no route, no view.
> - **Auth / editing — sign-in UI shipped; biography editor pending.** Google sign-in + server-side session + editor-gated biography editing exist at the API level and are covered by integration tests. The **frontend sign-in UI is now shipped** — the app bar has a **Sign in with Google** control; see [features/app-shell-and-localization.md](features/app-shell-and-localization.md#sign-in--sign-out). The **in-app biography editor** (the UI that calls `PUT /api/people/{id}/biography`) is **not yet built** — a separate later PR. Sessions and biography edits are **in-memory only** locally and reset on API restart; Firestore persistence is enabled in deployment when `Firestore:ProjectId` is configured (a pending deploy-PR step).
> - **Portrait media** — served from Cloudflare R2; without it the UI shows **initials fallback** (see [features/person-details.md](features/person-details.md#media--living-portraits)).
> - **'80s theme — couple pairing** (paired side-by-side cards for spouses) and **per-epoch background morph** (canvas colour that shifts as you scroll the timeline) — both **roadmap only**, not implemented.

## Document map

| Area | Document | Covers |
|---|---|---|
| Tech stack | [tech-stack.md](tech-stack.md) | Backend & frontend stack with versions, architecture, project layout |
| Features | [features/README.md](features/README.md) | All application behavior, split by surface |
| → Backend API | [features/backend-api.md](features/backend-api.md) | Endpoints, DTO contracts, validation, errors, health, rate-limit, security headers |
| → Oak tree | [features/oak-tree.md](features/oak-tree.md) | SVG oak, layout engine, medallions, time rail, motion |
| → Person details | [features/person-details.md](features/person-details.md) | Selection, panel rail, popup, person detail, media/living portraits, lightbox |
| → Search & navigation | [features/search-and-navigation.md](features/search-and-navigation.md) | Search, pan/zoom, deep links, orientation, initial framing |
| → App shell & localization | [features/app-shell-and-localization.md](features/app-shell-and-localization.md) | App bar, tabs, sign-in/identity/Editor badge/sign-out, Chronicle/first-visit, i18n, stats, version label |
| Devices & screens | [devices-and-screens.md](devices-and-screens.md) | Breakpoints, device matrix, touch vs mouse, accessibility, network/host |
| Testing | [testing.md](testing.md) | Test inventory, how to run, coverage, known gaps |
| CI/CD | [ci-cd.md](ci-cd.md) | Workflows, deploy pipeline, hosting, release/versioning, health checks |
| Roadmap & gaps | [roadmap.md](roadmap.md) | Implemented summary, planned-but-unbuilt, spec divergences |
| Technical debt | [technical-debt.md](technical-debt.md) | Known workarounds, constraints, limitations |

## What the app is

A family viewer backed by a localized graph of **people** and **unions** from a seed [`family.json`](../../src/backend/FamilyTree.Api/Data/family.json). The frontend renders it as a vertical (or horizontal) **oak**: a time axis, whole-tree pan/zoom, **medallion** person cards, a glass **person detail** surface, live **search**, a first-visit **Chronicle** landing page, and **ru / be / en** localization. Two switchable **themes** are available: **Classic** (gilt-frame oval medallions on a warm parchment canvas) and **Film** (period-accurate photo-card medallions on a muted studio-grey canvas — see [features/app-shell-and-localization.md](features/app-shell-and-localization.md#theme-toggle) and [features/oak-tree.md](features/oak-tree.md#eighties-film-theme-medallions)). Authenticated editors (Google sign-in, allow-list controlled) can update biography text via the API; see [features/backend-api.md](features/backend-api.md#authentication--editor-endpoints) for the backend contract and [features/app-shell-and-localization.md](features/app-shell-and-localization.md#sign-in--sign-out) for the frontend sign-in flow. The in-app biography **editor UI** is the remaining frontend piece (next PR).

## QA data fixtures (verified against the runtime [`src/backend/FamilyTree.Api/Data/family.json`](../../src/backend/FamilyTree.Api/Data/family.json))

| Fact | Value |
|---|---|
| People | **31** |
| Unions | **13** |
| Default-root person (`isDefaultRoot`) | **`p-0016`** (exactly one) |
| People with a still portrait | **23** |
| People with a living-portrait video | **4** |
| "Living" (no death year recorded) | **13** |
| Earliest birth year | **1762** |
| Person id format | `p-<digits>` (e.g. `p-0001`) |
| Union id format | `u-<digits>` |

The integration tests use a **separate 2-person fixture** ([`tests/integration/.../Fixtures/family.test.json`](../../tests/integration/FamilyTree.IntegrationTests/Fixtures/family.test.json)), so test-asserted counts differ from production data — see [testing.md](testing.md).

## Glossary

- **Oak / tree** — the SVG family graph. **Viewport** = the pan/zoom transform applied to it.
- **Node role** — `trunk` (focus + near chain), `branch`, `root` (deep ancestors), `leaf` (childless terminals). Drives medallion size and stroke width.
- **Medallion** — a person card: portrait (or initials) + name + birth–death years. In the Classic theme: a gilt oval frame. In the Film theme: a period-accurate photo card whose style depends on the person's birth year (see [oak-tree.md](features/oak-tree.md#eighties-film-theme-medallions)).
- **Union** — a marriage/partnership linking partners and their children.
- **Focus person** — the node the layout is rooted at (`familyStore.focusId`); defaults to the default-root person.
- **Bigger view** — the modal **PersonPopup** (an "undocked" person panel).
- **Rail** — the dockable/stackable **PanelRail** on the right; holds the pinned stats panel and person panels.

## How to use this reference for QA

1. Start from the **live-vs-not callout** above to avoid testing unshipped features.
2. For API contract tests, use [features/backend-api.md](features/backend-api.md) (exact DTO shapes + status codes).
3. For UI behavior, use the relevant `features/*` doc; each lists **states, triggers, and edge cases**.
4. For device/responsive/a11y test matrices, use [devices-and-screens.md](devices-and-screens.md).
5. Cross-check what is already automated (and what is **not**) in [testing.md](testing.md) before writing manual cases.
