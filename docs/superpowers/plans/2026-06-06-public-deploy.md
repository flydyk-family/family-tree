# Public Deployment Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the family-tree app publicly deployable for free — a versioned, hardened, containerized .NET API on Azure Container Apps fronted by a Cloudflare Pages SPA that reverse-proxies `/api/*`, delivered automatically on a `release-*` tag.

**Architecture:** Hybrid edge-proxy. Cloudflare Pages serves the built Vue SPA from its CDN and runs a Pages Function that proxies `/api/*` server-side to an Azure Container Apps (ACA) container running the .NET 10 API. The browser sees a single origin (no CORS). The API gains `/health` (with version), security headers, and rate limiting. A committed `VERSION` file is the single source of truth for the app version, stamped into the .NET assembly and the SPA build and surfaced in `/health`, the image tag, the ACA revision, and a subtle page label. A GitHub Actions workflow builds the image in Azure Container Registry and deploys both halves on a release tag.

**Tech Stack:** .NET 10 / ASP.NET Core (rate limiting + health checks are in the shared framework — no new NuGet packages), MSBuild version stamping, Docker, Vue 3 + Vite, Cloudflare Pages + Pages Functions, Azure Container Apps + ACR, GitHub Actions (Azure OIDC + `cloudflare/wrangler-action`).

**Reference spec:** [`docs/superpowers/specs/2026-06-06-public-deploy-design.md`](../specs/2026-06-06-public-deploy-design.md)

---

## Before you start

- Work on a branch off `main`. The spec and this plan already live on `docs/public-deploy-design`; continue there (the eventual PR title is "Public deployment"). Do **not** self-merge — the owner reviews and squash-merges (see `CLAUDE.md`).
- Backend commands run from the repo root (`C:\Users\perov\Code\My\family-tree`). Frontend commands run from `src/frontend`.
- No `Directory.Packages.props` change is needed: `Microsoft.AspNetCore.RateLimiting` and health checks ship in the ASP.NET Core shared framework.

## File structure

**Version**
- Create `VERSION` (repo root) — single source of truth, e.g. `0.1.0`.
- Modify `Directory.Build.props` (repo root) — read `VERSION` into `<Version>`.

**Backend**
- Modify `src/backend/FamilyTree.Api/Program.cs` — `/health` (with version), security headers, rate limiter.
- Create `tests/integration/FamilyTree.IntegrationTests/HardeningTests.cs` — integration tests.
- Create `src/backend/Dockerfile` + `.dockerignore` (repo root).

**Frontend**
- Create `src/frontend/src/api/apiProxy.ts` (+ `.spec.ts`) — `buildApiTargetUrl()` helper.
- Create `src/frontend/functions/api/[[path]].ts` — Cloudflare Pages Function reverse-proxy.
- Create `src/frontend/public/_redirects` + `public/_headers`.
- Create `src/frontend/src/components/AppVersion.vue` (+ `.spec.ts`) — subtle version label.
- Modify `src/frontend/vite.config.ts`, `src/frontend/src/vite-env.d.ts`, `src/frontend/src/App.vue` — inject + show the version.

**CI/CD + docs**
- Create `.github/workflows/deploy.yml`, `docs/ci-cd/deploy.md`.
- Modify `docs/superpowers/specs/2026-06-03-family-tree-design.md` — link the deploy spec/plan.

---

## Task 1: Version source of truth

**Files:**
- Create: `VERSION`
- Modify: `Directory.Build.props`

- [ ] **Step 1: Create the VERSION file**

Create `VERSION` at the repo root with a single line:

```
0.1.0
```

- [ ] **Step 2: Read VERSION into the .NET version**

Replace the contents of `Directory.Build.props` (repo root) with:

```xml
<Project>

  <PropertyGroup>
    <TargetFramework>net10.0</TargetFramework>
    <ImplicitUsings>enable</ImplicitUsings>
    <Nullable>enable</Nullable>
  </PropertyGroup>

  <!-- Single source of truth for the app version: any branch reads ./VERSION. -->
  <PropertyGroup Condition="Exists('$(MSBuildThisFileDirectory)VERSION')">
    <_RawVersion>$([System.IO.File]::ReadAllText('$(MSBuildThisFileDirectory)VERSION'))</_RawVersion>
    <Version>$(_RawVersion.Trim())</Version>
  </PropertyGroup>

  <PropertyGroup>
    <!-- Keep InformationalVersion equal to <Version> (no +sha suffix). -->
    <IncludeSourceRevisionInInformationalVersion>false</IncludeSourceRevisionInInformationalVersion>
  </PropertyGroup>

</Project>
```

- [ ] **Step 3: Verify the build reads the version**

Run: `dotnet build src/backend/FamilyTree.Api -c Release`
Expected: build succeeds (the MSBuild file-read expression is valid; assemblies are stamped `0.1.0`).

- [ ] **Step 4: Commit**

```bash
git add VERSION Directory.Build.props
git commit -m "build: VERSION file as the single source of truth for the app version"
```

---

## Task 2: API `/health` endpoint with version

**Files:**
- Modify: `src/backend/FamilyTree.Api/Program.cs`
- Test: `tests/integration/FamilyTree.IntegrationTests/HardeningTests.cs`

- [ ] **Step 1: Write the failing test**

Create `tests/integration/FamilyTree.IntegrationTests/HardeningTests.cs`:

```csharp
using System.Net;
using Microsoft.AspNetCore.Hosting;

namespace FamilyTree.IntegrationTests;

public sealed class HardeningTests : IClassFixture<FamilyApiFactory>
{
    private readonly FamilyApiFactory _factory;

    public HardeningTests(FamilyApiFactory factory)
    {
        _factory = factory;
    }

    [Fact]
    public async Task GetHealth_WhenCalled_ShouldReturnOkWithVersion()
    {
        var client = _factory.CreateClient();

        var response = await client.GetAsync("/health");

        response.StatusCode.Should().Be(HttpStatusCode.OK);
        var body = await response.Content.ReadAsStringAsync();
        body.Should().Contain("\"status\":\"Healthy\"");
        body.Should().Contain("\"version\":");
        body.Should().Contain("\"commit\":");
    }
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `dotnet test tests/integration/FamilyTree.IntegrationTests --filter GetHealth_WhenCalled_ShouldReturnOkWithVersion`
Expected: FAIL — `/health` returns 404 (not mapped).

- [ ] **Step 3: Register and map the health check with a version payload**

In `src/backend/FamilyTree.Api/Program.cs`, add these `using`s at the top (alongside the existing ones):

```csharp
using System.Reflection;
using Microsoft.AspNetCore.Diagnostics.HealthChecks;
```

Register the service after the `AddInfrastructure` line:

```csharp
builder.Services.AddInfrastructure(builder.Configuration);
builder.Services.AddHealthChecks();
```

Map the endpoint just before `app.MapControllers();`, with a JSON response writer:

```csharp
app.UseStaticFiles();
app.MapHealthChecks("/health", new HealthCheckOptions
{
    ResponseWriter = async (context, report) =>
    {
        var version = typeof(Program).Assembly
            .GetCustomAttribute<AssemblyInformationalVersionAttribute>()
            ?.InformationalVersion ?? "unknown";
        var commit = Environment.GetEnvironmentVariable("APP_COMMIT") ?? "local";
        context.Response.ContentType = "application/json";
        await context.Response.WriteAsJsonAsync(new
        {
            status = report.Status.ToString(),
            version,
            commit
        });
    }
});
app.MapControllers();
```

- [ ] **Step 4: Run test to verify it passes**

Run: `dotnet test tests/integration/FamilyTree.IntegrationTests --filter GetHealth_WhenCalled_ShouldReturnOkWithVersion`
Expected: PASS — body is `{"status":"Healthy","version":"0.1.0","commit":"local"}`.

- [ ] **Step 5: Commit**

```bash
git add src/backend/FamilyTree.Api/Program.cs tests/integration/FamilyTree.IntegrationTests/HardeningTests.cs
git commit -m "feat(api): add /health endpoint returning status, version, commit"
```

---

## Task 3: API security headers

**Files:**
- Modify: `src/backend/FamilyTree.Api/Program.cs`
- Test: `tests/integration/FamilyTree.IntegrationTests/HardeningTests.cs`

- [ ] **Step 1: Write the failing test**

Add to `HardeningTests.cs` (inside the class):

```csharp
    [Fact]
    public async Task GetGraph_WhenCalled_ShouldIncludeSecurityHeaders()
    {
        var client = _factory.CreateClient();

        var response = await client.GetAsync("/api/family/graph");

        response.Headers.GetValues("X-Content-Type-Options").Should().Equal("nosniff");
        response.Headers.GetValues("X-Frame-Options").Should().Equal("DENY");
        response.Headers.Should().ContainKey("Referrer-Policy");
    }
```

- [ ] **Step 2: Run test to verify it fails**

Run: `dotnet test tests/integration/FamilyTree.IntegrationTests --filter GetGraph_WhenCalled_ShouldIncludeSecurityHeaders`
Expected: FAIL — header `X-Content-Type-Options` is missing (`GetValues` throws InvalidOperationException).

- [ ] **Step 3: Add the security-headers middleware**

In `Program.cs`, add the middleware immediately after the existing `app.UseExceptionHandler(...)` block (so it runs for every response, including static files):

```csharp
app.Use(async (context, next) =>
{
    var headers = context.Response.Headers;
    headers["X-Content-Type-Options"] = "nosniff";
    headers["X-Frame-Options"] = "DENY";
    headers["Referrer-Policy"] = "strict-origin-when-cross-origin";
    headers["Permissions-Policy"] = "geolocation=(), camera=(), microphone=()";
    headers["Strict-Transport-Security"] = "max-age=63072000; includeSubDomains";
    await next();
});
```

(Defense-in-depth for direct-to-ACA access; the browser-facing CSP/HSTS are set at the Cloudflare edge in Task 7.)

- [ ] **Step 4: Run test to verify it passes**

Run: `dotnet test tests/integration/FamilyTree.IntegrationTests --filter GetGraph_WhenCalled_ShouldIncludeSecurityHeaders`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/backend/FamilyTree.Api/Program.cs tests/integration/FamilyTree.IntegrationTests/HardeningTests.cs
git commit -m "feat(api): add security response headers middleware"
```

---

## Task 4: API rate limiting

**Files:**
- Modify: `src/backend/FamilyTree.Api/Program.cs`
- Test: `tests/integration/FamilyTree.IntegrationTests/HardeningTests.cs`

- [ ] **Step 1: Write the failing test**

Add to `HardeningTests.cs` (inside the class). It overrides the permit limit to 2, so the 3rd request is rejected:

```csharp
    [Fact]
    public async Task ApiEndpoint_WhenPermitLimitExceeded_ShouldReturn429()
    {
        using var factory = _factory.WithWebHostBuilder(builder =>
        {
            builder.UseSetting("RateLimiting:PermitLimit", "2");
        });
        var client = factory.CreateClient();

        var first = await client.GetAsync("/api/family/graph");
        var second = await client.GetAsync("/api/family/graph");
        var third = await client.GetAsync("/api/family/graph");

        first.StatusCode.Should().Be(HttpStatusCode.OK);
        second.StatusCode.Should().Be(HttpStatusCode.OK);
        third.StatusCode.Should().Be(HttpStatusCode.TooManyRequests);
    }
```

- [ ] **Step 2: Run test to verify it fails**

Run: `dotnet test tests/integration/FamilyTree.IntegrationTests --filter ApiEndpoint_WhenPermitLimitExceeded_ShouldReturn429`
Expected: FAIL — the 3rd request returns 200 (no limiter configured).

- [ ] **Step 3: Add the rate limiter**

In `Program.cs`, add the `using` at the top:

```csharp
using System.Threading.RateLimiting;
```

Register the limiter after `AddHealthChecks()` (read config values outside the policy lambda so the test override is honored):

```csharp
builder.Services.AddHealthChecks();

const string ApiRateLimitPolicy = "api";
var rateLimitPermit = builder.Configuration.GetValue("RateLimiting:PermitLimit", 100);
var rateLimitWindowSeconds = builder.Configuration.GetValue("RateLimiting:WindowSeconds", 60);
builder.Services.AddRateLimiter(options =>
{
    options.RejectionStatusCode = StatusCodes.Status429TooManyRequests;
    options.AddPolicy(ApiRateLimitPolicy, httpContext =>
        RateLimitPartition.GetFixedWindowLimiter(
            partitionKey: httpContext.Connection.RemoteIpAddress?.ToString() ?? "unknown",
            factory: _ => new FixedWindowRateLimiterOptions
            {
                PermitLimit = rateLimitPermit,
                Window = TimeSpan.FromSeconds(rateLimitWindowSeconds),
                QueueLimit = 0
            }));
});
```

Enable the middleware right after the security-headers middleware:

```csharp
app.UseRateLimiter();
```

Apply the policy to the controllers only (leaving `/health` un-throttled) — change `app.MapControllers();`:

```csharp
app.MapControllers().RequireRateLimiting(ApiRateLimitPolicy);
```

- [ ] **Step 4: Run test to verify it passes**

Run: `dotnet test tests/integration/FamilyTree.IntegrationTests --filter ApiEndpoint_WhenPermitLimitExceeded_ShouldReturn429`
Expected: PASS.

- [ ] **Step 5: Run the full backend suite (no regressions)**

Run: `dotnet test`
Expected: PASS — all unit + integration tests green.

- [ ] **Step 6: Commit**

```bash
git add src/backend/FamilyTree.Api/Program.cs tests/integration/FamilyTree.IntegrationTests/HardeningTests.cs
git commit -m "feat(api): add fixed-window rate limiter on /api (configurable)"
```

---

## Task 5: API container image

**Files:**
- Create: `src/backend/Dockerfile`
- Create: `.dockerignore` (repo root)

- [ ] **Step 1: Create the Dockerfile**

Create `src/backend/Dockerfile`. The build context is the **repo root** so the central `Directory.Packages.props` / `Directory.Build.props` **and `VERSION`** are available to restore + stamp:

```dockerfile
# syntax=docker/dockerfile:1

FROM mcr.microsoft.com/dotnet/sdk:10.0 AS build
WORKDIR /src

# Central build configuration + version source of truth.
COPY Directory.Packages.props Directory.Build.props VERSION ./
# Backend source.
COPY src/backend/ ./src/backend/

RUN dotnet restore src/backend/FamilyTree.Api/FamilyTree.Api.csproj
RUN dotnet publish src/backend/FamilyTree.Api/FamilyTree.Api.csproj \
    -c Release -o /app --no-restore

FROM mcr.microsoft.com/dotnet/aspnet:10.0 AS runtime
WORKDIR /app
COPY --from=build /app ./
ENV ASPNETCORE_URLS=http://+:8080
EXPOSE 8080
# Run as the non-root user provided by the .NET runtime image.
USER $APP_UID
ENTRYPOINT ["dotnet", "FamilyTree.Api.dll"]
```

- [ ] **Step 2: Create the `.dockerignore`**

Create `.dockerignore` at the repo root:

```gitignore
# Build outputs
**/bin/
**/obj/
# Frontend (not part of the API image)
**/node_modules/
src/frontend/
# VCS, CI, docs, tests
.git/
.github/
docs/
tests/
# Local artifacts
**/*.user
```

- [ ] **Step 3: Build the image**

Run from the repo root: `docker build -f src/backend/Dockerfile -t familytree-api:local .`
Expected: build succeeds, ending with a tagged image.

> If Docker is not installed locally, skip Steps 3–4; the deploy uses `az acr build` (cloud build) in Task 9. Note the skip in the commit body.

- [ ] **Step 4: Smoke-test the container**

```bash
docker run --rm -d -p 8080:8080 --name ft-api familytree-api:local
curl -fsS http://localhost:8080/health
curl -fsS http://localhost:8080/api/family/graph
docker stop ft-api
```
Expected: `/health` returns `{"status":"Healthy","version":"0.1.0","commit":"local"}`; `/api/family/graph` returns JSON with `people` and `unions`.

- [ ] **Step 5: Commit**

```bash
git add src/backend/Dockerfile .dockerignore
git commit -m "build(api): containerize the API (multi-stage, non-root, port 8080)"
```

---

## Task 6: SPA API-proxy URL helper

**Files:**
- Create: `src/frontend/src/api/apiProxy.ts`
- Test: `src/frontend/src/api/apiProxy.spec.ts`

All commands in this task run from `src/frontend`.

- [ ] **Step 1: Write the failing test**

Create `src/frontend/src/api/apiProxy.spec.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { buildApiTargetUrl } from './apiProxy';

describe('buildApiTargetUrl', () => {
  it('forwards the path and query string to the API origin', () => {
    const result = buildApiTargetUrl(
      'https://app.pages.dev/api/family/graph?lang=en',
      'https://familytree-api.azurecontainerapps.io'
    );
    expect(result).toBe(
      'https://familytree-api.azurecontainerapps.io/api/family/graph?lang=en'
    );
  });

  it('strips a trailing slash from the API origin', () => {
    const result = buildApiTargetUrl(
      'https://app.pages.dev/api/people/p-0001',
      'https://familytree-api.azurecontainerapps.io/'
    );
    expect(result).toBe(
      'https://familytree-api.azurecontainerapps.io/api/people/p-0001'
    );
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- apiProxy`
Expected: FAIL — cannot resolve `./apiProxy` / `buildApiTargetUrl` is undefined.

- [ ] **Step 3: Implement the helper**

Create `src/frontend/src/api/apiProxy.ts`:

```ts
/**
 * Builds the upstream API URL the Cloudflare Pages Function proxies to.
 * The incoming path already includes the `/api` prefix, which the .NET API
 * also serves under, so the whole path + query is forwarded verbatim.
 */
export function buildApiTargetUrl(requestUrl: string, apiOrigin: string): string {
  const incoming = new URL(requestUrl);
  const origin = apiOrigin.replace(/\/+$/, '');
  return `${origin}${incoming.pathname}${incoming.search}`;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- apiProxy`
Expected: PASS (both cases).

- [ ] **Step 5: Commit**

```bash
git add src/frontend/src/api/apiProxy.ts src/frontend/src/api/apiProxy.spec.ts
git commit -m "feat(spa): add buildApiTargetUrl helper for the edge proxy"
```

---

## Task 7: Cloudflare Pages Function + SPA routing + edge headers

**Files:**
- Create: `src/frontend/functions/api/[[path]].ts`
- Create: `src/frontend/public/_redirects`
- Create: `src/frontend/public/_headers`

All commands in this task run from `src/frontend`.

- [ ] **Step 1: Create the Pages Function reverse-proxy**

Create `src/frontend/functions/api/[[path]].ts`. It matches every `/api/*` request and forwards it to the ACA origin (the `API_ORIGIN` Pages environment variable). `PagesFunction` is an ambient type provided by the Cloudflare build; this file is outside `src`, so `vue-tsc` does not type-check it.

```ts
import { buildApiTargetUrl } from '../../src/api/apiProxy';

interface Env {
  API_ORIGIN: string;
}

export const onRequest: PagesFunction<Env> = async ({ request, env }) => {
  const target = buildApiTargetUrl(request.url, env.API_ORIGIN);
  // Re-issue upstream, preserving method, headers, and body.
  return fetch(new Request(target, request));
};
```

- [ ] **Step 2: Create the SPA history fallback**

Create `src/frontend/public/_redirects` (Vite copies `public/` to `dist/` root; Pages Functions take precedence for `/api/*`, so this only catches client-side routes like `/person/:id`):

```
/*    /index.html    200
```

- [ ] **Step 3: Create the edge security headers**

Create `src/frontend/public/_headers`:

```
/*
  X-Content-Type-Options: nosniff
  X-Frame-Options: DENY
  Referrer-Policy: strict-origin-when-cross-origin
  Permissions-Policy: geolocation=(), camera=(), microphone=()
  Strict-Transport-Security: max-age=63072000; includeSubDomains; preload
  Content-Security-Policy: default-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; script-src 'self'; connect-src 'self'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'
```

> CSP note: `style-src 'unsafe-inline'` covers Vue's dynamic `:style` bindings on the SVG oak. Tighten against the live preview after the first deploy if the app renders correctly without it.

- [ ] **Step 4: Verify the build and tests still pass**

Run: `npm run build`
Expected: `vue-tsc -b` type-checks (it ignores `functions/`) and Vite builds. Confirm `dist/_redirects` and `dist/_headers` exist after the build.

Run: `npm test`
Expected: PASS — full Vitest suite green.

- [ ] **Step 5: Commit**

```bash
git add src/frontend/functions src/frontend/public/_redirects src/frontend/public/_headers
git commit -m "feat(spa): Cloudflare Pages /api proxy, SPA fallback, edge security headers"
```

---

## Task 8: SPA version label + build-time injection

**Files:**
- Modify: `src/frontend/vite.config.ts`
- Modify: `src/frontend/src/vite-env.d.ts`
- Create: `src/frontend/src/components/AppVersion.vue`
- Test: `src/frontend/src/components/AppVersion.spec.ts`
- Modify: `src/frontend/src/App.vue`

All commands in this task run from `src/frontend`.

- [ ] **Step 1: Inject the version into the build**

Replace the contents of `src/frontend/vite.config.ts` with (adds the `VERSION` read + two `define` entries; server/test config unchanged):

```ts
/// <reference types="vitest" />
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';
import vue from '@vitejs/plugin-vue';

const version = readFileSync(
  fileURLToPath(new URL('../../VERSION', import.meta.url)),
  'utf-8'
).trim();
const commit = (process.env.APP_COMMIT ?? 'local').slice(0, 7);

export default defineConfig({
  plugins: [vue()],
  define: {
    __VUE_I18N_FULL_INSTALL__: true,
    __VUE_I18N_LEGACY_API__: false,
    __INTLIFY_PROD_DEVTOOLS__: false,
    __APP_VERSION__: JSON.stringify(version),
    __APP_COMMIT__: JSON.stringify(commit)
  },
  server: {
    port: 5173,
    // Bind to all interfaces so the dev server is reachable from other devices on
    // the same network (http://<this-machine-LAN-IP>:5173). The /api and /assets
    // proxies run server-side, so the backend stays on localhost.
    host: true,
    proxy: {
      '/api': { target: 'http://localhost:5037', changeOrigin: true },
      '/assets': { target: 'http://localhost:5037', changeOrigin: true }
    }
  },
  test: {
    environment: 'jsdom',
    globals: true,
    // Vitest 4 changed the default worker pool to 'forks' (child processes).
    // Keep the 'threads' pool that Vitest 1 defaulted to: it's faster for this
    // jsdom suite and avoids child-process worker start-up timeouts.
    pool: 'threads',
    include: ['src/**/*.spec.ts']
  }
});
```

> Note: `src/frontend/vite.config.js` and `vite.config.d.ts` are gitignored artifacts emitted by `vue-tsc -b` from this `.ts`. If they exist locally and shadow the `.ts` during `npm run dev`, delete them — `npm run build` regenerates them from the updated source.

- [ ] **Step 2: Declare the injected globals for TypeScript**

Replace the contents of `src/frontend/src/vite-env.d.ts` with:

```ts
/// <reference types="vite/client" />

declare const __APP_VERSION__: string;
declare const __APP_COMMIT__: string;
```

- [ ] **Step 3: Write the failing component test**

Create `src/frontend/src/components/AppVersion.spec.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';
import AppVersion from './AppVersion.vue';

describe('AppVersion', () => {
  it('renders the injected build version with the commit in the tooltip', () => {
    const wrapper = mount(AppVersion);

    expect(wrapper.text()).toContain(`v${__APP_VERSION__}`);
    expect(wrapper.attributes('title')).toContain(__APP_COMMIT__);
  });
});
```

- [ ] **Step 4: Run test to verify it fails**

Run: `npm test -- AppVersion`
Expected: FAIL — cannot resolve `./AppVersion.vue`.

- [ ] **Step 5: Implement the version label**

Create `src/frontend/src/components/AppVersion.vue`:

```vue
<script setup lang="ts">
import { onMounted } from 'vue';

const version = __APP_VERSION__;
const commit = __APP_COMMIT__;

onMounted(() => {
  const meta = document.createElement('meta');
  meta.name = 'app-version';
  meta.content = `${version}+${commit}`;
  document.head.appendChild(meta);
});
</script>

<template>
  <span class="app-version" :title="`${version} (${commit})`">v{{ version }}</span>
</template>

<style scoped lang="scss">
.app-version {
  position: fixed;
  right: 0.4rem;
  bottom: 0.3rem;
  z-index: 1000;
  font-size: 10px;
  line-height: 1;
  color: var(--color-ink, #4a3f33);
  opacity: 0.25;
  pointer-events: none;
  user-select: none;
}
</style>
```

- [ ] **Step 6: Run test to verify it passes**

Run: `npm test -- AppVersion`
Expected: PASS.

- [ ] **Step 7: Mount the label in the app shell**

In `src/frontend/src/App.vue`, import and render `AppVersion` (changes shown; styles unchanged):

```vue
<script setup lang="ts">
import AppBar from './components/AppBar.vue';
import AppVersion from './components/AppVersion.vue';
</script>

<template>
  <div class="app-shell">
    <AppBar />
    <div class="app-shell__body">
      <router-view />
    </div>
    <AppVersion />
  </div>
</template>
```

- [ ] **Step 8: Verify the full frontend build + tests**

Run: `npm run build && npm test`
Expected: type-check + build succeed (the `__APP_VERSION__` / `__APP_COMMIT__` globals resolve); Vitest suite green.

- [ ] **Step 9: Commit**

```bash
git add src/frontend/vite.config.ts src/frontend/src/vite-env.d.ts src/frontend/src/components/AppVersion.vue src/frontend/src/components/AppVersion.spec.ts src/frontend/src/App.vue
git commit -m "feat(spa): subtle version label, injected from VERSION at build time"
```

---

## Task 9: Release-tag deploy workflow

**Files:**
- Create: `.github/workflows/deploy.yml`

- [ ] **Step 1: Create the workflow**

Create `.github/workflows/deploy.yml`. Non-secret resource names use repo **Variables** (`vars`); credentials use **Secrets**. The MediatR licence key is set once on the ACA app (see Task 10 runbook), not here.

```yaml
name: Deploy

on:
  push:
    tags: ['release-*']
  workflow_dispatch:

permissions:
  contents: read
  id-token: write   # Azure OIDC

concurrency:
  group: deploy-${{ github.ref }}
  cancel-in-progress: false

jobs:
  deploy-api:
    name: deploy-api
    runs-on: ubuntu-latest
    steps:
      - name: Checkout
        uses: actions/checkout@v6

      - name: Resolve version
        id: ver
        shell: bash
        run: |
          set -euo pipefail
          VERSION="$(tr -d '[:space:]' < VERSION)"
          SHA_SHORT="${GITHUB_SHA::7}"
          echo "version=$VERSION" >> "$GITHUB_OUTPUT"
          echo "sha_short=$SHA_SHORT" >> "$GITHUB_OUTPUT"
          echo "suffix=v$(echo "$VERSION" | tr '.' '-')-$SHA_SHORT" >> "$GITHUB_OUTPUT"
          # On a release tag, the tag must match the VERSION file.
          if [[ "${GITHUB_REF_TYPE}" == "tag" && "${GITHUB_REF_NAME}" != "release-$VERSION" ]]; then
            echo "::error::Tag ${GITHUB_REF_NAME} != release-$VERSION (VERSION file). Bump VERSION or fix the tag."
            exit 1
          fi

      - name: Azure login (OIDC)
        uses: azure/login@v2
        with:
          client-id: ${{ secrets.AZURE_CLIENT_ID }}
          tenant-id: ${{ secrets.AZURE_TENANT_ID }}
          subscription-id: ${{ secrets.AZURE_SUBSCRIPTION_ID }}

      - name: Build image in Azure Container Registry
        run: |
          az acr build \
            --registry ${{ vars.ACR_NAME }} \
            --image familytree-api:${{ steps.ver.outputs.version }} \
            --image familytree-api:${{ github.sha }} \
            --file src/backend/Dockerfile \
            .

      - name: Update the Container App
        run: |
          az containerapp update \
            --name ${{ vars.ACA_APP_NAME }} \
            --resource-group ${{ vars.AZURE_RESOURCE_GROUP }} \
            --image ${{ vars.ACR_NAME }}.azurecr.io/familytree-api:${{ github.sha }} \
            --revision-suffix ${{ steps.ver.outputs.suffix }} \
            --set-env-vars APP_COMMIT=${{ steps.ver.outputs.sha_short }}

  deploy-spa:
    name: deploy-spa
    runs-on: ubuntu-latest
    defaults:
      run:
        working-directory: src/frontend
    steps:
      - name: Checkout
        uses: actions/checkout@v6

      - name: Set up Node 22
        uses: actions/setup-node@v6
        with:
          node-version: 22
          cache: npm
          cache-dependency-path: src/frontend/package-lock.json

      - name: Install
        run: npm ci

      - name: Build
        run: npm run build
        env:
          APP_COMMIT: ${{ github.sha }}

      - name: Deploy to Cloudflare Pages
        uses: cloudflare/wrangler-action@v3
        with:
          apiToken: ${{ secrets.CLOUDFLARE_API_TOKEN }}
          accountId: ${{ secrets.CLOUDFLARE_ACCOUNT_ID }}
          workingDirectory: src/frontend
          command: pages deploy dist --project-name=${{ vars.CLOUDFLARE_PAGES_PROJECT }} --branch=main
```

- [ ] **Step 2: Validate the workflow YAML**

Run (from repo root): `python -c "import yaml; yaml.safe_load(open('.github/workflows/deploy.yml')); print('ok')"`
Expected: prints `ok`. The `secrets` / `vars` references resolve at run time on GitHub.

- [ ] **Step 3: Commit**

```bash
git add .github/workflows/deploy.yml
git commit -m "ci: version-aware release-tag deploy (ACA api + Cloudflare Pages spa)"
```

---

## Task 10: Owner deploy runbook

**Files:**
- Create: `docs/ci-cd/deploy.md`

- [ ] **Step 1: Write the runbook**

Create `docs/ci-cd/deploy.md`:

````markdown
# Deployment — operating notes

The app deploys to free hosting on every `release-X.Y.Z` **tag**:
the .NET API ships as a container to **Azure Container Apps (ACA)**, and the Vue
SPA ships to **Cloudflare Pages**, which reverse-proxies `/api/*` to the API.
Workflow: [`.github/workflows/deploy.yml`](../../.github/workflows/deploy.yml).
Design: [`docs/superpowers/specs/2026-06-06-public-deploy-design.md`](../superpowers/specs/2026-06-06-public-deploy-design.md).

## Topology

```
Browser → Cloudflare Pages (SPA, free SSL, *.pages.dev)
            │  /api/*  → Pages Function → ACA API (scale-to-zero)
            ▼
        Azure Container Apps  ← image from Azure Container Registry
```

## Versioning

- The repo-root **`VERSION`** file is the single source of truth; any branch reads
  it. The .NET assembly and the SPA build both stamp it; `/health` returns it.
- A `release-X.Y.Z` tag **must** match `VERSION` (the workflow fails otherwise).
- **After each release, bump `VERSION`** to the next in-development number on `main`.

## One-time owner setup (not in version control)

### Azure (API)
1. Create a resource group, an **Azure Container Registry** (Basic), and a
   **Container Apps environment**.
2. Create the **Container App**: external ingress, **target port 8080**,
   **min replicas 0** (scale-to-zero), liveness/readiness probe → **`/health`**.
   Any public image works initially; the first release replaces it.
3. Add the MediatR licence key as an app **secret** bound to the
   `MediatR__LicenseKey` environment variable. (Optional — the API runs unlicensed
   with a warning if absent.)
4. Set up **OIDC federated credentials**: an Entra app registration with a
   federated credential trusting this GitHub repo's tag pushes, granted
   `AcrPush` + `Contributor` on the resource group.

### Cloudflare (SPA + proxy)
5. Create a **Pages project**; set its **production branch** to `main`.
6. Add a Pages **environment variable** `API_ORIGIN` = the ACA app's public URL
   (e.g. `https://<aca-app>.<region>.azurecontainerapps.io`).
7. Note the project's `*.pages.dev` URL — this is the public site.

### GitHub (repo settings)
8. **Secrets:** `AZURE_CLIENT_ID`, `AZURE_TENANT_ID`, `AZURE_SUBSCRIPTION_ID`,
   `CLOUDFLARE_API_TOKEN` (Pages:Edit), `CLOUDFLARE_ACCOUNT_ID`.
9. **Variables:** `ACR_NAME`, `ACA_APP_NAME`, `AZURE_RESOURCE_GROUP`,
   `CLOUDFLARE_PAGES_PROJECT`.

## Releasing

```bash
# Ensure VERSION on main holds the version you are releasing (e.g. 0.1.0).
git switch -c release-0.1.0 main
git push -u origin release-0.1.0
git tag release-0.1.0
git push origin release-0.1.0        # tag push → deploy.yml runs both jobs
```

Or trigger manually: Actions → **Deploy** → *Run workflow*.

## Verifying a deploy

```bash
# API version (direct on the ACA URL):
curl -fsS https://<aca-app>.<region>.azurecontainerapps.io/health
# Data through the public proxy:
curl -fsS https://<app>.pages.dev/api/family/graph
# Edge security headers:
curl -I    https://<app>.pages.dev
```
`/health` returns `{ "status": "Healthy", "version": "0.1.0", "commit": "<sha>" }`.
Open the site: the oak renders, a person popup opens, a deep link such as
`/person/p-0001` loads directly, and the subtle `v0.1.0` label shows bottom-right.

## Rollback

Re-point the Container App to a previous image tag (or revision):

```bash
az containerapp update -n <ACA_APP_NAME> -g <RG> \
  --image <ACR_NAME>.azurecr.io/familytree-api:<previous-sha>
```
For the SPA, roll back to a prior deployment in the Cloudflare Pages dashboard.

## Notes

- **Cold start:** scale-to-zero means the first request after idle waits a few
  seconds for the API to wake; the SPA shell loads instantly from the CDN.
- **Observability (v1):** ACA streams container logs + system metrics to Log
  Analytics — no app instrumentation. OpenTelemetry is deferred to the DB/auth
  phase (see the design spec); the `APP_COMMIT` / version values become its tag.
- **Real data gate:** the public dataset is fictional. Before real family data is
  published, gate it behind auth or keep it fictional.
````

- [ ] **Step 2: Commit**

```bash
git add docs/ci-cd/deploy.md
git commit -m "docs: deploy runbook (ACA + Cloudflare Pages, versioning, release-tag CD)"
```

---

## Task 11: Link the roadmap + final verification

**Files:**
- Modify: `docs/superpowers/specs/2026-06-03-family-tree-design.md`

- [ ] **Step 1: Update the roadmap item**

In `docs/superpowers/specs/2026-06-03-family-tree-design.md` §12, replace the line:

```markdown
- **Release delivery to a public web host** — auto-deploy when a `release-X.Y.Z` branch receives a git tag.
```

with:

```markdown
- **Release delivery to a public web host** — _implemented (pending owner infra)._ Free hybrid: Cloudflare Pages SPA reverse-proxies `/api` to an Azure Container Apps .NET API, deployed on a `release-X.Y.Z` tag; versioned via a root `VERSION` file. Design [`2026-06-06-public-deploy-design.md`](2026-06-06-public-deploy-design.md); plan [`../plans/2026-06-06-public-deploy.md`](../plans/2026-06-06-public-deploy.md); runbook [`../../ci-cd/deploy.md`](../../ci-cd/deploy.md).
```

- [ ] **Step 2: Run the full backend suite**

Run (repo root): `dotnet test`
Expected: PASS.

- [ ] **Step 3: Run the full frontend build + tests**

Run (from `src/frontend`): `npm run build && npm test`
Expected: build succeeds; Vitest suite green.

- [ ] **Step 4: Commit**

```bash
git add docs/superpowers/specs/2026-06-03-family-tree-design.md
git commit -m "docs: mark public-deploy roadmap item implemented; link spec/plan/runbook"
```

- [ ] **Step 5: Finish the branch**

Use the `superpowers:finishing-a-development-branch` skill to open a PR titled **"Public deployment"** into `main`. Do **not** self-merge — the owner reviews, squash-merges, then performs the one-time infra/secrets setup from the runbook and pushes the first `release-X.Y.Z` tag.

---

## Self-review (completed by plan author)

**Spec coverage:**
- §2 topology / §3 architecture → Tasks 6–7 (proxy + edge) + runbook (Task 10). ✓
- §4.1 API container → Task 5 (copies `VERSION`). ✓
- §4.2 SPA build + proxy + `_redirects` + `_headers` → Task 7; no app code change to existing API calls. ✓
- §4.3 versioning → Task 1 (`VERSION` + props), Task 2 (`/health` version), Task 8 (SPA inject + label), Task 9 (image tag/ACA revision/`APP_COMMIT`). ✓
- §5 security: edge headers (Task 7), API headers (Task 3), rate limiter (Task 4), `/health` (Task 2); CORS unchanged; direct-ACA secret intentionally skipped. ✓
- §6 CI/CD `deploy.yml` + secrets/vars + version-aware → Tasks 9–10. ✓
- §7 scope: baseline observability documented (runbook), OTel out (no task — correct). ✓
- §8 verification → runbook "Verifying a deploy" + Task 11 final runs. ✓

**Placeholder scan:** none — every step has concrete code/commands. Tokens `<app>`, `<aca-app>`, `<region>`, `<RG>`, `<previous-sha>` are runtime values documented in the runbook, not plan gaps.

**Type/name consistency:** `buildApiTargetUrl(requestUrl, apiOrigin)` defined in Task 6, consumed identically in Task 7. `__APP_VERSION__` / `__APP_COMMIT__` declared (Task 8 Step 2), injected (Step 1), consumed in `AppVersion.vue` + its test. Policy constant `ApiRateLimitPolicy = "api"` defined and applied in Task 4. Config keys `RateLimiting:PermitLimit` / `:WindowSeconds` consistent across Task 4 and its test. `APP_COMMIT` env var: written by Task 9 (both jobs), read by Task 2 (`/health`) and Task 8 (Vite). `VERSION` created in Task 1, read by Directory.Build.props (Task 1), Dockerfile (Task 5), Vite (Task 8), and the workflow (Task 9). Image name `familytree-api` consistent across Tasks 5 and 9.
