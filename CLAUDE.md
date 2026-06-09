# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project overview

A family-tree viewer: a **.NET 10 JSON-backed API** plus a **Vue 3 SPA** that renders the family as an SVG "oak" — a vertical time axis, whole-tree pan/zoom, scroll-cartouche person cards (portrait + name + birth–death years), and a glass detail popup. Data is read-only from a seed `family.json`; text is localized (ru primary / be / en).

### Layout

- `src/backend/` — .NET 10 solution (`FamilyTree.slnx`), four projects, clean-architecture split:
  - **`FamilyTree.Domain`** — entities/value objects (`LocalizedText`, `Person`, `Union`) and the repository interfaces (`IPersonRepository`, `IUnionRepository`).
  - **`FamilyTree.Application`** — thin **MediatR** requests/handlers that delegate to services (e.g. `FamilyQueryService`); DTOs; **Mapster** mapping; **FluentValidation** via a `ValidationBehavior` pipeline.
  - **`FamilyTree.Infrastructure`** — in-memory store loaded from `FamilyTree.Api/Data/family.json` (swap for a real DB without touching handlers).
  - **`FamilyTree.Api`** — ASP.NET Core controllers (thin) under `/api/...`; serves static assets via `UseStaticFiles`; dev CORS for `http://localhost:5173`.
  - Central package management in `Directory.Packages.props` (MediatR 14.x under a Lucky Penny **community license** — key via `MediatR:LicenseKey` config, never committed; plus Mapster, FluentValidation; tests use **xUnit + Moq + AwesomeAssertions**).
- `src/frontend/` — **Vue 3 + TypeScript + Vite**. Pinia stores, Vue Router (`/person/:id` deep link), vue-i18n, SCSS design tokens (`src/styles/tokens.scss`). A **custom layout engine** (`src/layout/treeLayout.ts` + `timeScale.ts`) computes positions; Vue owns the SVG (`OakTree.vue`, `PersonMedallion.vue`, `YearAxis.vue`, `PersonPopup.vue`). The dev server proxies `/api` and `/assets` to the API.
- `tests/` — `unit/FamilyTree.UnitTests` and `integration/FamilyTree.IntegrationTests` (xUnit).
- `docs/superpowers/` — design specs (`specs/`) and step-by-step implementation plans (`plans/`).

### Build / test / run

Backend — from the repo root (the `.slnx` is picked up automatically):

```bash
dotnet build
dotnet test
dotnet run --project src/backend/FamilyTree.Api   # Development → http://localhost:5037
```

Frontend — from `src/frontend`:

```bash
npm install
npm run dev      # http://localhost:5173 (proxies /api and /assets to the API on :5037)
npm test         # Vitest
npm run build    # vue-tsc type-check + production build
```

Run the API and the dev server together to use the app end-to-end (the SPA reads the graph from `/api`).

---

## Git & delivery workflow

- **`main` is the trunk.** Branch every feature/fix **off `main`** (or off whatever branch you are basing on — e.g. a release branch) and open a PR back **into that base**. `main` is the default base (`gh pr create --base main`).
- **Do not self-merge.** Open the PR and **stop** — the repo owner reviews and merges. Agents/contributors create branches and PRs but never merge their own work without the owner's explicit approval.
- **PR titles state the idea, not the commits.** A PR title is a short description of the main/prevalent idea or outcome of the change (e.g. *"Harden the API proxy against misconfig"*), **not** a copy of a commit message or a list of files touched. Put the mechanics in the PR body.
- When approved, **squash-merge** PRs **into `main`** (`gh pr merge <n> --squash`) and **delete the branch**, so `main` keeps a clean one-commit-per-PR history. **Exception — release branches:** merges that involve a `release-X.Y.Z` branch (a hotfix PR *into* it, or merging it back *into* `main`) use a **real merge commit, not squash**, so shared history is preserved and future release→main merges stay clean.
- **Releases:** when `main` has accumulated enough change (the owner's call), cut a release branch named **`release-X.Y.Z`** (e.g. `release-1.0.0`) from `main`, then bump `main`'s `VERSION` to the next dev number. Deploy by pushing a **`vX.Y.Z` tag** on the release branch — the tag (not the branch) triggers the deploy **and publishes a GitHub Release** with auto-generated notes (the changelog since the previous version). A release branch **stays rooted at the commit it was cut from** — never rebase it or move its base.
- **Hotfixes:** branch **off the relevant `release-X.Y.Z`** (not `main`), make the fix, bump the **patch** `VERSION` (e.g. `0.1.1`), PR back into that release branch (**merge commit, not squash**), then tag **`vX.Y.Z`**. **Forward-port** the fix to `main` by **merging the release branch into `main`** (not cherry-picking) so it carries its history; if that merge **conflicts** (e.g. on `VERSION`), create an **intermediate branch** off `main`, merge the release branch into it, resolve, and PR the intermediate branch into `main`.
- The former long-lived `integration` branch is **retired** — it was promoted into `main` and is no longer used; do not target it.
- Larger work follows the superpowers flow: spec in `docs/superpowers/specs/`, then a step-by-step plan in `docs/superpowers/plans/`.

---

## C# / .NET conventions

Apply when modifying or creating `*.cs` files.

### Namespaces
- Use **file-scoped namespaces** (`namespace FamilyTree.WebApp.Pages;`), not block form.
- Match the namespace to the assembly and folder path.

### Naming
- Types and public members: **PascalCase**. Private fields: **`_camelCase`** (e.g. `_mediator`, `_logger`).
- Interfaces: **`I`** prefix.
- Async methods: **`Async`** suffix.

### Dependencies and constructors
- Prefer **constructor injection**; store dependencies in **`readonly`** private fields.
- Order constructor parameters consistently (services first, then `ILogger` if present).

### Async and cancellation
- Async methods return `Task` / `Task<T>`. Pass **`CancellationToken`** through as the last parameter.

### Nullability
- Use nullable reference types (`string?`, `Foo?`). Prefer `is null` / `is not null`. Avoid the null-forgiving `!` operator unless necessary.

### Error handling
- Do not swallow exceptions. Log with `ILogger` (structured data) and rethrow, or return a result.

```csharp
// BAD
catch (Exception) { }

// GOOD
catch (Exception ex) { _logger.LogError(ex, "Operation failed"); throw; }
```

### Formatting and style
- Use `var` when the type is obvious. K&R braces.
- Add `using` directives rather than writing fully-qualified type names.
- **Always brace control statements**, even single-line bodies:

```csharp
// BAD
if (foo)
    return bar;

// GOOD
if (foo)
{
    return bar;
}
```

### Stack patterns
- Expected stack: **MediatR** (request/handler), **ASP.NET Core** (Razor Pages / controllers / `IOptions<T>`), nullable-enabled projects.

### HTTP clients
- Do **not** register named `HttpClient`s. Use a strongly-typed wrapper class:

```csharp
// BAD
builder.Services.AddHttpClient("some-api", c => c.BaseAddress = new Uri("..."));

// GOOD
builder.Services.AddHttpClient<ISomeApiClient, SomeApiClient>(c => c.BaseAddress = new Uri("..."));
```

### JSON serialization
- Use `System.Text.Json`.
- Deserialize into **strongly-typed classes**; avoid `JsonDocument` / `JsonNode` for normal data shapes.

---

## Proto / gRPC naming

Apply when adding or editing `*.proto` files.

### `package`
- Lowercase, dot-separated, aligned to the owning .NET project (e.g. project `FamilyTree.Grpc` → package starts with `familytree.grpc`).
- Do **not** include the word `generated`.

### `option csharp_namespace`
- Derive from the package name by PascalCasing each segment (`familytree.grpc.persons` → `FamilyTree.Grpc.Persons`), or build from the .NET project root namespace + the relative path under `Protos/`.
- Start with the owning project's root namespace so generated types live under the same logical root.
- Do **not** include `Generated`, `Proto`, or `Contract` as a separate root unless it is part of the project name.
- Keep one scheme per project (package-based **or** folder-based), consistently.

### Folder layout
- Place `.proto` files under `Protos/` in folders mirroring the package / namespace hierarchy.

Example:

```protobuf
package familytree.grpc.persons;
option csharp_namespace = "FamilyTree.Grpc.Persons";
```

---

## Unit test naming

Apply to `tests/**/*.cs` and `**/*Tests*.cs`.

Pattern: **`<MethodName>_When<Conditions>_Should<ExpectedResult>`**

- **MethodName** — the operation under test.
- **When…** — preconditions / inputs / scenario.
- **Should…** — expected outcome.

Example: `FindByFilter_WhenTagsProvided_ShouldReturnFilesWithTags`

- PascalCase each segment; no spaces.
- Soft limit 80 chars, hard limit 100.
- Prefer specific phrases (`WhenPageInfoSet_ShouldMapHasNextPage`) over generic ones (`WhenDataExists_ShouldSucceed`).

---

## Deploy Configuration (configured by /setup-deploy)
- Platform: **Google Cloud Run** (.NET 10 API) + **Cloudflare Pages** (Vue 3 SPA) — hybrid edge-proxy (Pages reverse-proxies `/api/*` to Cloud Run; single browser origin)
- Production URL: **`https://family-tree-4fl.pages.dev`** (Cloudflare auto-suffixed the subdomain `-4fl` because plain `family-tree.pages.dev` was already taken globally — that bare host is **not** ours; the Pages project name is still `family-tree`). Custom domain later.
- Deploy workflow: `.github/workflows/deploy.yml` — triggers on a **`vX.Y.Z` tag** push (+ manual `workflow_dispatch`); NOT auto-deploy on push to `main`
- Deploy status command: `gh run list --workflow=deploy.yml` (or `gh run watch` the "Deploy" run)
- Merge method: **squash** (owner reviews + merges; agents never self-merge)
- Project type: web app (Vue SPA) + .NET API
- Post-deploy health check: `GET <cloud-run-url>/health` → 200 `{status,version,commit}`; `GET https://family-tree-4fl.pages.dev/api/family/graph` → 200 (proxied)

### Custom deploy hooks
- Pre-merge: `dotnet test` and `npm --prefix src/frontend run build && npm --prefix src/frontend test` (PR gates: `ci.yml` + `codeql.yml`)
- Deploy trigger: bump the root `VERSION` file to match, then push a `vX.Y.Z` tag (the workflow fails if the tag ≠ `v<VERSION>`)
- Deploy status: `gh run watch` on the Deploy workflow, or curl the health/proxy URLs
- Health check: `/health` (API, directly on the Cloud Run URL — **not** proxied through `*.pages.dev`) and `/api/family/graph` (via the Cloudflare proxy)

> Full one-time owner setup (GCP project/Artifact Registry/Cloud Run + Workload Identity Federation, Cloudflare Pages project + `API_ORIGIN`, GitHub secrets/vars), the release process, and rollback are documented in [`docs/ci-cd/deploy.md`](docs/ci-cd/deploy.md). Design: [`docs/superpowers/specs/2026-06-06-public-deploy-design.md`](docs/superpowers/specs/2026-06-06-public-deploy-design.md).
