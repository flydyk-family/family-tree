# 🌳 family-tree

[![CI](https://github.com/flydyk-family/family-tree/actions/workflows/ci.yml/badge.svg)](https://github.com/flydyk-family/family-tree/actions/workflows/ci.yml)
[![CodeQL](https://github.com/flydyk-family/family-tree/actions/workflows/codeql.yml/badge.svg)](https://github.com/flydyk-family/family-tree/actions/workflows/codeql.yml)
[![Deploy](https://github.com/flydyk-family/family-tree/actions/workflows/deploy.yml/badge.svg)](https://github.com/flydyk-family/family-tree/actions/workflows/deploy.yml)
[![codecov](https://codecov.io/gh/flydyk-family/family-tree/graph/badge.svg)](https://codecov.io/gh/flydyk-family/family-tree)
[![Latest release](https://img.shields.io/github/v/release/flydyk-family/family-tree?sort=semver)](https://github.com/flydyk-family/family-tree/releases)

[![.NET 10](https://img.shields.io/badge/.NET-10-512BD4?logo=dotnet&logoColor=white)](https://dotnet.microsoft.com/)
[![Vue 3](https://img.shields.io/badge/Vue-3-4FC08D?logo=vuedotjs&logoColor=white)](https://vuejs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Vite](https://img.shields.io/badge/Vite-8-646CFF?logo=vite&logoColor=white)](https://vite.dev/)
[![Cloud Run](https://img.shields.io/badge/API-Cloud%20Run-4285F4?logo=googlecloud&logoColor=white)](https://cloud.google.com/run)
[![Cloudflare Pages](https://img.shields.io/badge/SPA-Cloudflare%20Pages-F38020?logo=cloudflare&logoColor=white)](https://pages.cloudflare.com/)

A family-tree viewer that renders a family as an SVG **"oak"** — a vertical time
axis, whole-tree pan/zoom, medallion person cards (portrait + name +
birth–death years), and a glass detail popup. Two switchable **themes**: the
default **Film** (period-accurate photo cards on a brushed-metal backdrop —
cabinet card, silver-gelatin print, or colour film frame by birth year —
connected by red-string rope cords with metal push-pins) and
**Classic** (gilt-frame oval medallions on warm parchment). Public data is
served from a seed dataset; all text is localized (**ru** primary / **be** /
**en**). Authenticated editors (Google sign-in, allow-list controlled) can
update biography text via the API; edits persist durably in **Google Firestore**
in deployment. The app bar ships a **Sign in with Google** control (Google
Identity Services); signing in shows the editor's identity and an **Editor**
badge when the account is on the allow-list. An in-app biography **editor UI**
is the next remaining piece.

**Live:** https://family-tree-4fl.pages.dev

## What it is

A small full-stack app:

- a **.NET 10 JSON-backed API** that serves the family graph under `/api/...`, and
- a **Vue 3 SPA** that draws the tree with a custom SVG layout engine.

The browser only ever talks to one origin: the SPA host reverse-proxies `/api/*`
server-side to the API, so there's no CORS; auth uses an `HttpOnly` session
cookie forwarded verbatim through the proxy.

## Documentation

[`docs/reference/`](docs/reference/README.md) is a connected, behavior-level
reference for the whole app — API contracts, every UI feature, supported
devices/screens, testing, CI/CD, roadmap, and known debt — written for QA and
grounded in the code (with explicit live-vs-roadmap callouts).

## Tech stack

| Layer | Tech |
|---|---|
| **API** | .NET 10 · ASP.NET Core (controllers) · **MediatR** (request/handler) · **Mapster** · **FluentValidation** · clean-architecture split (Domain / Application / Infrastructure / Api) |
| **SPA** | Vue 3 · TypeScript · Vite · Pinia · Vue Router · vue-i18n · SCSS design tokens · custom SVG layout engine |
| **Tests** | xUnit · Moq · AwesomeAssertions (backend) · Vitest · @vue/test-utils (frontend) |
| **Hosting** | Google Cloud Run (API container) · Cloudflare Pages (SPA + edge `/api` proxy) |
| **CI/CD** | GitHub Actions — CI gates (build/test/audit), CodeQL, release-tag Deploy · Dependabot |

## Repository layout

```
src/
  backend/        .NET 10 solution (FamilyTree.slnx)
    FamilyTree.Domain          entities / value objects / repository interfaces
    FamilyTree.Application      MediatR handlers, DTOs, mapping, validation
    FamilyTree.Infrastructure  in-memory snapshot (seed from GCS in deployment / Data/family.json locally)
    FamilyTree.Api             ASP.NET Core controllers, /health, static assets
  frontend/       Vue 3 + Vite SPA (layout engine, SVG components, i18n)
    functions/    Cloudflare Pages Function — the /api reverse-proxy
tests/            unit/ + integration/ (xUnit)
docs/             design specs, plans, and the CI/CD runbook
```

## Running locally

**Prerequisites:** .NET 10 SDK, Node ≥ 20.19 (Node 22 recommended).

**Backend** — from the repo root (the `.slnx` is picked up automatically):

```bash
dotnet build
dotnet test
dotnet run --project src/backend/FamilyTree.Api   # → http://localhost:5037
```

**Frontend** — from `src/frontend`:

```bash
npm install
npm run dev        # → http://localhost:5173 (proxies /api + /assets to :5037)
npm run build      # vue-tsc type-check + production build
```

Run the API and the dev server together to use the app end-to-end — the SPA reads
the graph from `/api`.

## Testing

```bash
dotnet test                                  # backend (xUnit)
npm --prefix src/frontend test               # frontend (Vitest)
npm --prefix src/frontend run test:coverage  # frontend with coverage report
```

Coverage is collected in CI (backend via coverlet, frontend via the V8 provider)
and uploaded to **Codecov** — see the badge above.

## Deployment

Pushing a **`vX.Y.Z` tag** ships the app to free hosting: the API as a container
to **Google Cloud Run**, the SPA to **Cloudflare Pages** (which proxies `/api/*`
to the API). In deployment the family seed is served from **Google Cloud Storage**
(configured via `FamilyData__Source=gs://<bucket>/family.json`) and is swappable
without a redeploy — edits to the GCS object are picked up within the snapshot TTL
(default 10 min). The tag also publishes a **GitHub Release** with auto-generated notes.

The repo-root **`VERSION`** file is the single source of truth for the app version
(stamped into the assembly and the SPA build, surfaced at `/health`). Full process,
one-time owner setup, releasing, hotfixes, and rollback live in
[`docs/ci-cd/deploy.md`](docs/ci-cd/deploy.md); design in
[`docs/superpowers/specs/2026-06-06-public-deploy-design.md`](docs/superpowers/specs/2026-06-06-public-deploy-design.md).

## Contributing

Branch off `main`, open a PR back into it (CI + CodeQL gate every PR), and the
owner reviews and squash-merges. PR titles describe the *idea*, not the commits.
See [`CLAUDE.md`](CLAUDE.md) for the full Git, release, and coding conventions.
