# Tech Stack & Architecture

← back to [reference index](README.md)

## Architecture at a glance

```
Browser ──► Cloudflare Pages (single origin: perovsky.family; pages.dev mirror)
              ├── /            Vue 3 SPA (static, CDN)
              ├── /api/*       Pages Function  api/[[path]].ts  ──► reverse-proxy ──► Google Cloud Run (.NET 10 API)
              └── /media/*     Pages Function  media/[[path]].ts ──► Cloudflare R2 (bucket: family-tree-media)
```

- **Single browser origin.** The SPA never calls Cloud Run or R2 directly; Cloudflare Pages Functions proxy `/api/*` and `/media/*` server-side. This satisfies the production CSP `connect-src 'self'` (see [devices-and-screens.md](devices-and-screens.md#network--host)).
- **Clean-architecture backend.** `Domain` ← `Application` ← `Infrastructure` / `Api`. Storage is swappable behind `IPersonRepository` / `IUnionRepository` without touching handlers.
- **Data.** The API warms a **merged in-memory snapshot** at startup (seed graph + biography overrides). All reads are served from this snapshot, which refreshes on a 10-minute TTL or immediately after an editor save. In deployment the seed is read from a **GCS object** (`FamilyData:Source=gs://…`) via Application Default Credentials — no key, no redeploy to pick up seed edits; local dev / CI read the committed [`family.json`](../../src/backend/FamilyTree.Api/Data/family.json). Biography overrides and sessions persist in **Google Firestore** (native mode, Workload Identity auth) in deployment; local dev / CI use in-memory stores.

Full hosting/deploy detail: [ci-cd.md](ci-cd.md).

## Backend

- **Runtime:** **.NET 10** (`net10.0`). All projects via [`Directory.Build.props`](../../Directory.Build.props); `<Version>` is read from the root [`VERSION`](../../VERSION) file.
- **Web:** ASP.NET Core (`Microsoft.NET.Sdk.Web`), thin controllers under `/api/...`.
- **Container:** multi-stage [`src/backend/Dockerfile`](../../src/backend/Dockerfile) — build on `mcr.microsoft.com/dotnet/sdk:10.0`, run on `aspnet:10.0`, listens on `http://+:8080`, runs as non-root `$APP_UID`.
- **Solution:** [`FamilyTree.slnx`](../../FamilyTree.slnx) (new SLNX format).

### Projects
| Project | Role |
|---|---|
| `FamilyTree.Domain` | Entities/value objects (`Person`, `Union`, `LocalizedText`, `LifeEvent`, `Parents`, `Residence`, `SocialLink`, enums) + repository interfaces |
| `FamilyTree.Application` | MediatR requests/handlers, `FamilyQueryService`, DTOs, Mapster mapping, FluentValidation + `ValidationBehavior` pipeline |
| `FamilyTree.Infrastructure` | `FamilySnapshotProvider` (merged in-memory snapshot with TTL), `JsonFamilyDataLoader` (local/dev), `GcsFamilyDataLoader` (deployment, `gs://` URI), in-memory and Firestore session/override stores |
| `FamilyTree.Api` | Controllers, `Program.cs` middleware, static files, dev CORS, `/health` |

### Backend packages (central — [`Directory.Packages.props`](../../Directory.Packages.props))
| Package | Version | Notes |
|---|---|---|
| MediatR | 14.1.0 | Lucky Penny **community license**; key via `MediatR:LicenseKey` config, never committed (warns if absent) |
| FluentValidation (+ DI ext.) | 12.1.1 | Validators + `ValidationBehavior` |
| Mapster | 10.0.7 | DTO mapping |
| Google.Apis.Auth | 1.69.0 | Google ID-token validation at sign-in only (`GoogleJsonWebSignature`) |
| Google.Cloud.Firestore | 3.10.0 | Durable session + biography-override storage (used in deployment when `Firestore:ProjectId` is set; in-memory fallback otherwise) |
| Google.Cloud.Storage.V1 | 4.10.0 | Seed-graph loader in deployment (`FamilyData:Source` = `gs://…`); reads via Application Default Credentials — no key |
| Microsoft.Extensions.* (Logging, Hosting.Abstractions, Options.ConfigurationExtensions, DI) | 10.0.8 | |
| Microsoft.AspNetCore.OpenApi | 10.0.8 | OpenAPI in Development only |
| Microsoft.OpenApi | 2.7.5 | Transitive-pinned past GHSA-v5pm-xwqc-g5wc (circular-`$ref` parsing DoS) |
| Microsoft.AspNetCore.Mvc.Testing | 10.0.8 | Integration tests |
| xunit / xunit.runner.visualstudio | 2.9.3 / 3.1.5 | Test framework |
| Moq | 4.20.72 | Mocking (unit) |
| AwesomeAssertions | 9.4.0 | Assertions |
| coverlet.collector | 10.0.1 | Coverage |
| Microsoft.NET.Test.Sdk | 18.6.0 | Test host |

Central Package Management is on (`ManagePackageVersionsCentrally`, `CentralPackageTransitivePinningEnabled`).

## Frontend

- **Runtime:** Node **22** (CI & deploy). Local dev needs Node ≥ 20.19.
- **Framework/build:** Vue 3 + TypeScript + Vite; SCSS design tokens; GSAP for motion.

### Frontend dependencies ([`src/frontend/package.json`](../../src/frontend/package.json))
| Package | Range | Role |
|---|---|---|
| vue | ^3.5.6 | UI framework |
| pinia | ^3.0.4 | State stores |
| vue-router | ^5.1.0 | Routing (`createWebHistory`) |
| vue-i18n | ^11.4.4 | Localization |
| gsap | ^3.13.0 | Animation (camera glide, fades) |
| flag-icons | ^7.5.0 | Language flags |
| @fontsource/{cinzel, eb-garamond, forum, unifrakturmaguntia} | ^5.2.x | Self-hosted brand fonts (same-origin per CSP) |

### Frontend dev dependencies
| Package | Range | Role |
|---|---|---|
| typescript | ~6.0.3 | Compiler |
| vite | ^8.0.16 | Build/dev server |
| vue-tsc | ^3.3.3 | Type-check (`build` = `vue-tsc -b && vite build`) |
| @vitejs/plugin-vue | ^6.0.7 | Vite Vue plugin |
| vitest / @vitest/coverage-v8 | ^4.1.8 | Tests + V8 coverage |
| @vue/test-utils | ^2.4.11 | Component testing |
| jsdom | ^29.1.1 | Test DOM (no `matchMedia`/`getTotalLength` — stubbed in tests) |
| sass | ^1.79.3 | SCSS |
| sharp / opentype.js | ^0.34.5 / ^2.0.0 | Icon generation ([`scripts/generate-icons.mjs`](../../src/frontend/scripts/generate-icons.mjs)) |
| @types/node | ^25.9.1 | Node types |

### Frontend source layout ([`src/frontend/src/`](../../src/frontend/src/))
`api/` (fetch + proxy helper) · `components/` (+ [`medallion/`](../../src/frontend/src/components/medallion/)) · `composables/` · `constants/` · `format/` · `i18n/` (+ `messages/`) · `interactions/` (pan/zoom) · `layout/` (tree/time-scale/projection) · `media/` · [`motion/`](../../src/frontend/src/motion/) (GSAP engine) · `router/` · `stores/` (Pinia) · `styles/` ([`tokens.scss`](../../src/frontend/src/styles/tokens.scss)) · `types/` · `views/`.

### npm scripts
`dev` (vite) · `build` (type-check + bundle) · `preview` · `test` (`vitest run`) · `test:watch` · `test:coverage` · `icons`.

## Versioning

The root [`VERSION`](../../VERSION) file is the single source of truth: it feeds [`Directory.Build.props`](../../Directory.Build.props) (.NET `<Version>`), the [Dockerfile](../../src/backend/Dockerfile), the deploy version-guard, the SPA build, and the `/health` payload. Release flow detail: [ci-cd.md](ci-cd.md#release--versioning).

## Running locally

Covered by the project skill [`.claude/skills/run-app/SKILL.md`](../../.claude/skills/run-app/SKILL.md): API on `:5037`, SPA dev server on `:5173` (proxies `/api` + `/media` to the API). The dev `port` and the `/api` proxy target are **env-overridable** (`PORT` / `API_TARGET`); [`scripts/dev.mjs`](../../scripts/dev.mjs) uses those (plus `--urls` / `FamilyData__Source` on the API) to run several worktrees on non-colliding port pairs — see [CLAUDE.md](../../CLAUDE.md). (The `/media` proxy fallback target is still fixed — see [technical-debt.md](technical-debt.md).)
