# Public Deployment — Design Spec

- **Date:** 2026-06-06
- **Status:** Approved for planning
- **Branch:** `docs/public-deploy-design`
- **Roadmap item:** _Platform / CI-CD → "Release delivery to a public web host"_ ([family-tree-design.md §12](2026-06-03-family-tree-design.md))

## 1. Purpose

Deploy the family-tree app to a publicly reachable URL on **free, reliable**
hosting, hardened for public exposure, and delivered automatically when a
`release-X.Y.Z` tag is pushed. The app is currently **read-only over a static
`family.json`** with **fictional sample data** — there is no database, no auth,
and no user-supplied input, which keeps the public-exposure risk low for this
first release.

## 2. Decisions (locked)

| Decision | Choice | Why |
|---|---|---|
| **Topology** | **Hybrid edge-proxy** — static SPA host proxies `/api/*` to a separate API container | CDN-fast SPA load; single **browser origin** (no CORS; easy cookie-auth later); API can scale to zero |
| **SPA host + proxy** | **Cloudflare Pages** + a **Pages Function** reverse-proxy | Free, global, free SSL; auto-detects Vue SPA routing; **free WAF/DDoS/bot** protection in front |
| **API host** | **Azure Container Apps (ACA)** | Free monthly grant (180k vCPU-s, 360k GiB-s, 2M req), scale-to-zero; clean future path to **co-located** Azure Postgres / Blob / Entra ID |
| **Domain** | **Free `*.pages.dev` subdomain** for now | Fastest, fully free; custom domain attaches to the SPA host later with zero API change |
| **CD trigger** | Push of a **`release-*` tag** → deploy public (+ `workflow_dispatch`) | Matches the roadmap's "release delivery"; `main` stays gated by existing `ci.yml` |
| **Data at launch** | Existing **fictional sample data** | No real PII → low privacy risk for v1 |

The container host is **not a one-way door**: the same Docker image redeploys to
Google Cloud Run (or elsewhere) by swapping only the deploy step, should the
Azure free-tier economics change.

## 3. Architecture

```
Browser
  │  https://<app>.pages.dev            (TLS terminated free at Cloudflare edge)
  ▼
Cloudflare Pages  ── static SPA (dist/) + free WAF/DDoS
  │  request to /api/*  → Pages Function (functions/api/[[path]].ts)
  │                        server-side fetch → ACA origin (no browser CORS)
  ▼
Azure Container Apps  ── .NET 10 API container (scale-to-zero)
  │  in-memory store hydrated from Data/family.json at startup
  ▼
(future) Azure PostgreSQL Flexible · Azure Blob (media) · Entra ID (auth)
```

- The browser only ever talks to the **Pages origin**; the `/api` proxy runs
  **server-side** inside the Pages Function, so there is **no browser CORS** and
  the API needs **no production CORS policy** (the existing dev-only policy stays
  as-is).
- The custom domain (later) attaches to **Cloudflare Pages only**; the ACA URL
  stays internal-facing (called by the proxy), so there is **one** domain and
  **one** TLS surface to manage.

## 4. Components & changes

### 4.1 API container (`src/backend`)

- **`Dockerfile`** (new, multi-stage):
  - build stage `mcr.microsoft.com/dotnet/sdk:10.0` → `dotnet restore` + `dotnet publish src/backend/FamilyTree.Api -c Release -o /app`;
  - runtime stage `mcr.microsoft.com/dotnet/aspnet:10.0` → copy `/app`, `ENV ASPNETCORE_URLS=http://+:8080`, `EXPOSE 8080`, non-root user.
  - `Data/family.json` is already `CopyToOutputDirectory=PreserveNewest`, so it
    ships in the publish output.
  - Consider `<PublishReadyToRun>true</PublishReadyToRun>` to trim .NET cold-start
    while staying scale-to-zero (verify image still builds on the ACA runtime).
- **`.dockerignore`** (new) — exclude `bin/`, `obj/`, `node_modules`, `.git`.
- **ACA config:** external ingress, `targetPort 8080`, `minReplicas 0`;
  `MediatR__LicenseKey` supplied as an **ACA secret** (works unlicensed with a
  warning if absent, so the deploy is not blocked by it); health probe → `/health`
  (returns `{ status, version, commit }` — see §4.3).

### 4.2 SPA build + edge proxy (`src/frontend`)

- **Cloudflare Pages project** rooted at `src/frontend`: build `npm ci && npm run build`,
  output `dist`, framework preset Vue/Vite, `NODE_VERSION=22` (matches `ci.yml`;
  the toolchain needs Node ≥ 20.19).
- **`functions/api/[[path]].ts`** (new) — Pages Function reverse-proxy. Forwards
  method, headers, and body to `${env.API_ORIGIN}` (the ACA URL, set as a Pages
  environment variable) and streams the response back. Sketch:
  ```ts
  export const onRequest: PagesFunction<{ API_ORIGIN: string }> = async ({ request, env, params }) => {
    const path = Array.isArray(params.path) ? params.path.join('/') : params.path ?? '';
    const url = new URL(request.url);
    const target = `${env.API_ORIGIN}/api/${path}${url.search}`;
    return fetch(new Request(target, request));
  };
  ```
- **`public/_redirects`** (new) — `/*  /index.html  200` SPA history fallback
  (Vue Router deep links like `/person/:id`). Pages Functions take precedence for
  `/api/*`, so the proxy is unaffected.
- **`public/_headers`** (new) — security response headers (see §5).
- **No application code change.** The proxy keeps `/api` same-origin, so the
  existing `fetchFamilyGraph()` / `fetchPerson()` calls (`baseUrl = ''`) work
  untouched — **no `VITE_API_BASE_URL` needed**.
- **`/assets/*` (portraits)** — deferred with the portraits roadmap phase; seed
  data has no portraits today. When added, serve from the CDN (SPA `public/`) or
  Azure Blob, not the container.

### 4.3 Versioning

- **Source of truth:** a committed **`VERSION`** file at the repo root holding the
  current in-development semver (e.g. `0.1.0`). Any branch reads it, so every
  build knows its version without parsing tags.
- **.NET:** `Directory.Build.props` reads `VERSION` into `<Version>` (with
  `IncludeSourceRevisionInInformationalVersion` off), stamping every assembly.
  `/health` returns `{ status, version, commit }` — version from the assembly
  informational version, commit from the `APP_COMMIT` env var (set at deploy;
  `local` otherwise).
- **SPA:** `vite.config.ts` reads the same `VERSION` file and `APP_COMMIT` at
  build time and injects them via `define` (`__APP_VERSION__`, `__APP_COMMIT__`).
  A tiny, near-invisible **`AppVersion`** label (fixed corner, low opacity,
  `pointer-events:none`) shows `v<version>` with the commit in its tooltip; a
  `<meta name="app-version">` carries it for machine-readability. (The single
  deploy version suffices: SPA and API ship together from the same tag, so they
  always match — no live API-version fetch.)
- **Monitoring:** the deploy tags the image `:<version>` and `:<sha>`, sets the
  ACA **revision suffix** from the version+sha (visible in the Container Apps
  revision list/portal), and injects `APP_COMMIT`. When OTel lands later, the same
  values become the telemetry version tag.
- **Release discipline:** a `release-X.Y.Z` tag must match `VERSION`; after a
  release, bump `VERSION` to the next in-development number.

## 5. Security hardening (v1)

- **Edge headers** via `public/_headers` (defense at the front door):
  - `Strict-Transport-Security: max-age=63072000; includeSubDomains; preload`
  - `X-Content-Type-Options: nosniff`
  - `X-Frame-Options: DENY` + CSP `frame-ancestors 'none'`
  - `Referrer-Policy: strict-origin-when-cross-origin`
  - `Permissions-Policy` minimal (deny geolocation/camera/microphone)
  - **CSP** starter: `default-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; script-src 'self'; connect-src 'self'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'` — tuned against the live preview during implementation (e.g. `style-src 'unsafe-inline'` only if Vue scoped styles require it).
- **API middleware** (defense-in-depth for direct-to-ACA access):
  - security-headers middleware mirroring the edge set;
  - **ASP.NET Core rate limiter** (`AddRateLimiter`, sliding window, e.g. 100 req/min/IP) applied to `/api`.
- **Health endpoint** `/health` (`AddHealthChecks()` + a `MapHealthChecks("/health")` with a JSON response writer returning `{ status, version, commit }`) for ACA liveness/readiness; not rate-limited.
- **Cloudflare free tier** provides WAF / DDoS / bot mitigation in front of the SPA and proxy at no cost.
- **Kept as-is:** OpenAPI is dev-only ✓; the global exception handler returns
  generic messages (no stack-trace leakage) ✓; CORS is dev-only ✓.
- **Optional, deferred:** force all API traffic through the proxy via a shared
  secret header the Pages Function injects and the API requires. **Skipped for
  v1** — the data is public and read-only, so direct ACA access leaks nothing.
- **Privacy gate (future, documented — not v1 work):** before *real* family data
  (especially living people) is published in the "multiple real families" phase,
  gate it behind authentication/authorization or keep the public dataset
  fictional. This is a precondition on that future phase, not on this release.

## 6. CI/CD — `.github/workflows/deploy.yml` (new)

- **Triggers:** `push` of tags matching `release-*`; plus `workflow_dispatch` for
  manual runs. The existing `ci.yml` / `codeql.yml` PR gates are unchanged and
  still gate merges into `main` / `release-*`.
- **Job `deploy-api`:** `azure/login@v2` via **OIDC federated credentials** (no
  stored password) → `az acr build` (cloud build, no local Docker) to push the
  image to **Azure Container Registry** → `az containerapp update --image …`.
- **Job `deploy-spa`:** `setup-node@22` → `npm ci && npm run build` in
  `src/frontend` (with `APP_COMMIT` in the build env) → `cloudflare/wrangler-action`
  `pages deploy dist`. Using wrangler in the workflow (rather than Cloudflare's own
  Git auto-build for production) keeps **both** SPA and API on the **same
  release-tag trigger** and a single source of truth. Cloudflare's native PR
  preview deployments may optionally be enabled for non-production branches.
- **Version-aware:** both jobs read `VERSION` (`$(cat VERSION)`) and the short
  commit. `deploy-api` tags the image `:<version>` + `:<sha>`, sets the ACA
  revision suffix, and injects `APP_COMMIT`; `deploy-spa` passes `APP_COMMIT` to
  the build. A guard asserts `release-<VERSION>` matches the pushed tag.
- **Owner-set secrets** (repo settings, not committed):
  `AZURE_CLIENT_ID` / `AZURE_TENANT_ID` / `AZURE_SUBSCRIPTION_ID` (OIDC),
  `MEDIATR_LICENSE_KEY`, `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`.
- **One-time infra (owner, documented in a deploy runbook):** create the ACA
  environment + app + ACR + the OIDC app-registration/federated-credential; create
  the Cloudflare Pages project and set its `API_ORIGIN` variable to the ACA URL.

## 7. Scope / non-goals

**In scope (v1):**
- `Dockerfile` + `.dockerignore` for the API; ACA deploy.
- Cloudflare Pages project, `functions/api` proxy, `_redirects`, `_headers`.
- API hardening: security headers, rate limiter, `/health`.
- **Versioning:** committed `VERSION` file as source of truth, stamped into the
  .NET assembly + the SPA build, surfaced in `/health`, on the image tag/ACA
  revision, and as a subtle page label.
- `deploy.yml` (release-tag trigger) + a short deploy runbook in `docs/ci-cd/`.
- Launch on the free `*.pages.dev` subdomain with the current sample data.
- **Baseline observability** via ACA's built-in container logs + system metrics
  (Log Analytics) — no application instrumentation.

**Out of scope (future phases — unblocked but not built here):**
- Database, authentication/authorization, media (images/video) pipeline.
- **Application telemetry / OpenTelemetry** — deferred to the DB/auth phase, where
  database-query spans and per-request correlation make distributed tracing earn
  its keep. The intended path (vendor-neutral OTel SDK → Azure Monitor or any OTLP
  backend) keeps the choice open; v1 relies on ACA's built-in logs/metrics.
- Custom domain.
- `main` → dev/preview environment (the roadmap's separate "continuous delivery
  to a dev host" item).

## 8. Verification

Post-deploy smoke test against the public URL:
1. `GET /health` (direct on the ACA URL) → 200 with `{ status, version, commit }`
   matching the released tag.
2. `GET /api/family/graph` → 200 (served through the Cloudflare → ACA proxy).
3. SPA loads, renders the oak, a person popup opens; a deep link `/person/<id>`
   loads directly (SPA fallback works); the subtle version label shows `v<version>`.
4. `curl -I https://<app>.pages.dev` shows the expected security headers.
5. First request after idle succeeds within an acceptable cold-start window
   (SPA shell is instant from the CDN; only the data fetch waits on ACA wake).

## 9. Decisions log

- Hybrid edge-proxy over single-host container or split-with-CORS: keeps a single
  browser origin (no CORS, easy future cookie auth) **and** a CDN-fast SPA.
- Cloudflare Pages over Netlify: free WAF/DDoS + Vue SPA auto-detection outweigh
  the small cost of a Pages Function for the external `/api` proxy (`_redirects`
  cannot proxy external origins).
- Azure Container Apps over Google Cloud Run: co-located, mostly-free future path
  for DB (Azure Postgres Flexible, free 12 mo) / Blob / Entra ID, since Neon's
  Azure regions are being retired (Aug 2026) and GCP has no free same-cloud
  Postgres. Compute free grants are comparable; choice is reversible.
- Release-tag CD trigger over `main`-push: matches the roadmap's release-delivery
  item and keeps the public site deliberate; a `main`→preview env can be added
  later.
- Launch with fictional sample data; real-family data is gated behind auth in a
  later phase.
- OpenTelemetry deferred to the DB/auth phase: a single read-only service with no
  downstream calls has little to trace, and ACA's built-in logs/metrics cover v1.
  Adding the OTel SDK later is cheap and vendor-neutral (repointable exporter).
- Version source of truth is a committed `VERSION` file (not the git tag), so any
  branch knows the in-development version; the tag is validated against it at
  deploy. Endpoint renamed `/healthz` → `/health` and extended to return
  `{ status, version, commit }`. The page shows the single deploy version (SPA and
  API match by construction), not a live API-version fetch.
```
