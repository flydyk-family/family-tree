# Tech Stack & Architecture

← back to [reference index](README.md)

## Architecture at a glance

```
Browser ──► Cloudflare Pages (single origin: family-tree-4fl.pages.dev)
              ├── /            Vue 3 SPA (static, CDN)
              ├── /api/*       Pages Function  api/[[path]].ts  ──► reverse-proxy ──► Google Cloud Run (.NET 10 API)
              └── /media/*     Pages Function  media/[[path]].ts ──► Cloudflare R2 (bucket: family-tree-media)
```

- **Single browser origin.** The SPA never calls Cloud Run or R2 directly; Cloudflare Pages Functions proxy `/api/*` and `/media/*` server-side. This satisfies the production CSP `connect-src 'self'` (see [devices-and-screens.md](devices-and-screens.md#network--host)).
- **Clean-architecture backend.** `Domain` ← `Application` ← `Infrastructure` / `Api`. Storage is swappable behind `IPersonRepository` / `IUnionRepository` without touching handlers.
- **Read-only data.** The API loads `family.json` into an in-memory singleton at startup. No write path exists.

Full hosting/deploy detail: [ci-cd.md](ci-cd.md).

## Backend

- **Runtime:** **.NET 10** (`net10.0`). All projects via `Directory.Build.props`; `<Version>` is read from the root `VERSION` file.
- **Web:** ASP.NET Core (`Microsoft.NET.Sdk.Web`), thin controllers under `/api/...`.
- **Container:** multi-stage `src/backend/Dockerfile` — build on `mcr.microsoft.com/dotnet/sdk:10.0`, run on `aspnet:10.0`, listens on `http://+:8080`, runs as non-root `$APP_UID`.
- **Solution:** `FamilyTree.slnx` (new SLNX format).

### Projects
| Project | Role |
|---|---|
| `FamilyTree.Domain` | Entities/value objects (`Person`, `Union`, `LocalizedText`, `LifeEvent`, `Parents`, `Residence`, `SocialLink`, enums) + repository interfaces |
| `FamilyTree.Application` | MediatR requests/handlers, `FamilyQueryService`, DTOs, Mapster mapping, FluentValidation + `ValidationBehavior` pipeline |
| `FamilyTree.Infrastructure` | In-memory `FamilyStore` loaded from `family.json` via `JsonFamilyDataLoader` |
| `FamilyTree.Api` | Controllers, `Program.cs` middleware, static files, dev CORS, `/health` |

### Backend packages (central — `Directory.Packages.props`)
| Package | Version | Notes |
|---|---|---|
| MediatR | 14.1.0 | Lucky Penny **community license**; key via `MediatR:LicenseKey` config, never committed (warns if absent) |
| FluentValidation (+ DI ext.) | 12.1.1 | Validators + `ValidationBehavior` |
| Mapster | 10.0.7 | DTO mapping |
| Microsoft.Extensions.* (Logging, Hosting.Abstractions, Options.ConfigurationExtensions, DI) | 10.0.8 | |
| Microsoft.AspNetCore.OpenApi | 10.0.8 | OpenAPI in Development only |
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

### Frontend dependencies (`src/frontend/package.json`)
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
| sharp / opentype.js | ^0.34.5 / ^2.0.0 | Icon generation (`scripts/generate-icons.mjs`) |
| @types/node | ^25.9.1 | Node types |

### Frontend source layout (`src/frontend/src/`)
`api/` (fetch + proxy helper) · `components/` (+ `medallion/`) · `composables/` · `constants/` · `format/` · `i18n/` (+ `messages/`) · `interactions/` (pan/zoom) · `layout/` (tree/time-scale/projection) · `media/` · `motion/` (GSAP engine) · `router/` · `stores/` (Pinia) · `styles/` (`tokens.scss`) · `types/` · `views/`.

### npm scripts
`dev` (vite) · `build` (type-check + bundle) · `preview` · `test` (`vitest run`) · `test:watch` · `test:coverage` · `icons`.

## Versioning

The root `VERSION` file is the single source of truth: it feeds `Directory.Build.props` (.NET `<Version>`), the Dockerfile, the deploy version-guard, the SPA build, and the `/health` payload. Release flow detail: [ci-cd.md](ci-cd.md#release--versioning).

## Running locally

Covered by the project skill `.claude/skills/run-app/SKILL.md`: API on `:5037`, SPA dev server on `:5173` (proxies `/api` + `/media` to the API). The Vite proxy target `localhost:5037` is **hardcoded** — see [technical-debt.md](technical-debt.md).
