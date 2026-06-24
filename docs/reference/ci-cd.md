# CI/CD, Deployment & Hosting

← back to [reference index](README.md)

Authoritative source: the workflow YAML in [`.github/workflows/`](../../.github/workflows/). Prose in [`docs/ci-cd/`](../../docs/ci-cd/) was cross-checked and is consistent.

## CI — pull-request gates

### [`ci.yml`](../../.github/workflows/ci.yml) (push/PR to `main` or `release-*`)
| Job | Steps |
|---|---|
| **backend** | checkout → setup .NET 10 → `dotnet restore` → `dotnet build -c Release` → `dotnet test --collect "XPlat Code Coverage"` → Codecov (flag `backend`) → NuGet vulnerable-package audit (fails on vulnerable) |
| **frontend** | checkout → setup Node 22 (npm cache) → `npm ci` → `npm run build` (`vue-tsc -b && vite build`) → `npm run test:coverage` → Codecov (flag `frontend`) → `npm audit --audit-level=high` |

Concurrency cancels superseded runs.

### [`codeql.yml`](../../.github/workflows/codeql.yml) (push/PR + weekly Mon 03:23 UTC)
Matrix: `csharp` (build-mode `manual` — explicit `dotnet build`) and `javascript-typescript` (build-mode `none`).

### [`claude.yml`](../../.github/workflows/claude.yml)
On-demand `@claude` responder for issues/PR comments — **not** a gate.

### [`claude-code-review.yml`](../../.github/workflows/claude-code-review.yml)
Automatic PR review (PR `opened` + `synchronize`) — **not** a gate. Skips bot-authored PRs (e.g. Dependabot); posts one sticky summary comment (`gh pr comment --edit-last --create-if-none`) that updates in place on re-runs; concurrency cancels the in-flight review when a newer push supersedes it. Reuses the `CLAUDE_CODE_OAUTH_TOKEN` secret. The prompt is keyed to this repo's conventions and adds a frontend section (a11y, responsive, i18n, design tokens, SVG-tree perf) for changes under `src/frontend`.

### Required status checks (branch ruleset)
`backend`, `frontend`, `Analyze (csharp, manual)`, `Analyze (javascript-typescript, none)`.

### Dependabot ([`dependabot.yml`](../../.github/dependabot.yml))
Weekly grouped minor/patch PRs for nuget (`/`), npm (`/src/frontend`), github-actions (`/`); targets `main` only.

## Deploy pipeline ([`deploy.yml`](../../.github/workflows/deploy.yml))
**Triggers:** push of a tag `v[0-9]*`, or manual `workflow_dispatch`. Concurrency does **not** cancel in-flight deploys.

1. **`deploy-api`** (environment `production`, OIDC `id-token: write`):
   - **Resolve version:** read [`VERSION`](../../VERSION); **guard** — on a tag push, fail if `tag != "v$VERSION"`.
   - Auth to GCP via **Workload Identity Federation** (keyless), log in to Artifact Registry.
   - Build & push the Docker image ([`src/backend/Dockerfile`](../../src/backend/Dockerfile)) tagged `:<version>` and `:<full-SHA>`.
   - `gcloud run deploy` the `<full-SHA>` image: `--allow-unauthenticated`, `--port 8080`, `--min-instances 0` (scale-to-zero), `--revision-suffix v<version-dashed>-<sha7>`, `--update-env-vars APP_COMMIT=<sha7>`.
2. **`deploy-spa`** (`needs: deploy-api`): setup Node 22 → `npm ci` → `npm run build` (`APP_COMMIT` injected) → Cloudflare **wrangler-action** `pages deploy dist --project-name=<var> --branch=production` (the `production` label applies the production `API_ORIGIN`).
3. **`github-release`** (`needs` both, **tag pushes only**): `gh release create` with `--generate-notes --verify-tag`; idempotent (skips if the release exists). Title = tag.

**Re-deploy caveat:** the `--revision-suffix` embeds the version, so re-running the same commit/tag collides on the Cloud Run revision name. Bump [`VERSION`](../../VERSION) + retag (or drop the suffix for that one run).

### Production config — env vars, variables, and secrets

Runtime settings applied once to the Cloud Run service (preserved across deploys):

| Setting | Kind | Value |
|---|---|---|
| `Authentication__Google__ClientId` | Cloud Run env var | public OAuth client ID (same as `VITE_GOOGLE_CLIENT_ID`) |
| `Firestore__ProjectId` | Cloud Run env var | GCP project id |
| `FamilyData__Source` | Cloud Run env var | `gs://<bucket>/family.json` |
| `Authentication__Google__Editors__0…` | Secret Manager secret → Cloud Run secret binding | one secret per editor email (PII — never committed) |
| `MediatR__LicenseKey` | Secret Manager secret → Cloud Run secret binding | optional; API runs unlicensed with a warning if absent |
| `APP_COMMIT` | Cloud Run env var (set per-deploy by `gcloud run deploy`) | 7-char SHA — stamped into `/health` |

GitHub Actions (set once; read by the deploy workflow):

| Name | Kind | Used by |
|---|---|---|
| `VITE_GOOGLE_CLIENT_ID` | GitHub Actions **variable** (public) | `deploy-spa` build step — baked into the SPA bundle |
| `GCP_WORKLOAD_IDENTITY_PROVIDER`, `GCP_SERVICE_ACCOUNT`, `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID` | GitHub Actions **secrets** | workflow auth (GCP + Cloudflare) |
| `GCP_PROJECT_ID`, `GCP_REGION`, `GAR_REPOSITORY`, `CLOUD_RUN_SERVICE`, `CLOUDFLARE_PAGES_PROJECT` | GitHub Actions **variables** | workflow configuration |
| `API_ORIGIN` | Cloudflare Pages **environment variable** (Production) | Pages Function `api/[[path]].ts` proxy target |

> No OAuth client secret and no DB password are used. See [`docs/ci-cd/deploy.md`](../ci-cd/deploy.md#enabling-auth-firestore-and-the-gcs-seed-in-production) for the owner provisioning runbook (`setup-gcp-deploy.ps1`).

**Firestore hardening** (provisioned by `setup-gcp-deploy.ps1`): a TTL policy on `sessions.expiresAt` self-reaps expired session documents, and the committed [`firestore.rules`](../../firestore.rules) (via [`firebase.json`](../../firebase.json)) **denies all** client/REST access. All app access is server-side through the Admin SDK (which bypasses rules), so deny-all is the complete posture — defense-in-depth against an accidental console "test mode" toggle. The rules deploy is best-effort (needs a one-time `firebase login`); manual fallback: `npx -y firebase-tools@latest deploy --only firestore:rules --project <id>`.

## Hosting architecture
See the diagram in [tech-stack.md](tech-stack.md#architecture-at-a-glance). Cloudflare Pages is the single browser origin:

### `/api/*` proxy — [`functions/api/[[path]].ts`](../../src/frontend/functions/api/[[path]].ts)
Env `API_ORIGIN` (Cloud Run URL). Forwards `pathname + search` verbatim (the `/api` prefix is preserved; the .NET API also routes under `/api`), drops the inbound `Host` header, `redirect: 'manual'`. Misconfig or upstream failure → **502**.

### `/media/*` — [`functions/media/[[path]].ts`](../../src/frontend/functions/media/[[path]].ts)
R2 binding `MEDIA` (bucket `family-tree-media`). GET/HEAD only (else 405); missing binding → 502; supports **Range** (206 partial / 416 unsatisfiable); `Cache-Control: public, max-age=31536000, immutable`.

### Security headers — [`public/_headers`](../../src/frontend/public/_headers)
Applied to all routes (mirrors the API headers) plus a strict **CSP** (`default-src 'self'`, `connect-src 'self'`, `frame-ancestors 'none'`, …), with a narrow allowance for **Google Identity Services** (`https://accounts.google.com/gsi/…` in `script-src`/`frame-src`/`connect-src`/`style-src`, `https://*.googleusercontent.com` in `img-src`) so sign-in loads. HSTS includes `preload`.

### Health checks
- API: `GET <cloud-run-url>/health` → `{ status, version, commit }` (commit from `APP_COMMIT`; `"local"` if unset). **Not** proxied through Pages.
- End-to-end: `GET https://perovsky.family/api/family/graph` → 200 (primary domain; Pages mirror `GET https://family-tree-4fl.pages.dev/api/family/graph`).
- Media: `curl -I https://…/media/portraits/<name>` → 200, `accept-ranges: bytes`, immutable cache.

### Custom domain & regional access (Belarus/Russia)
The default `*.pages.dev` host is blocked at the network level in Belarus/Russia for two reasons: (1) the whole `pages.dev` apex is blanket-filtered, and (2) BY/RU DPI drops Cloudflare's default-on **ECH** (TLS 1.3) handshake. The fix is to serve the app from a custom domain on our own Cloudflare zone (the apex `perovsky.family`) and **disable ECH** on that zone via the Cloudflare API. Full runbook incl. the exact PATCH and how to revert: [`docs/ci-cd/custom-domain-and-ech.md`](../../docs/ci-cd/custom-domain-and-ech.md).

## Release & versioning
Root [`VERSION`](../../VERSION) is the single source of truth (feeds .NET `<Version>`, Dockerfile, deploy guard, SPA, `/health`).

**Cut a release** (owner's call): branch `release-X.Y.Z` from `main`; bump `main`'s [`VERSION`](../../VERSION) to the next dev number; tag `vX.Y.Z` on the release branch → push the tag → deploy + GitHub Release. The release branch stays rooted at its cut commit (never rebased).

**Hotfix:** branch off `release-X.Y.Z`, fix + bump **patch** [`VERSION`](../../VERSION), PR back into the release branch with a **merge commit (not squash)**, tag `vX.Y.Z`, then **forward-port** to `main` by merging the release branch (resolving the [`VERSION`](../../VERSION) conflict via an intermediate branch if needed).

> Full owner setup (GCP/WIF, Cloudflare project, secrets/vars), rollback (`gcloud run services update-traffic`, Pages dashboard), and the deprecated-domain note live in [`docs/ci-cd/deploy.md`](../ci-cd/deploy.md).

## Seed & media scripts
- **[`scripts/upload-seed.mjs`](../../scripts/upload-seed.mjs)** — pushes the committed [`Data/family.json`](../../src/backend/FamilyTree.Api/Data/family.json) to the configured GCS bucket (via `gs://<bucket>/family.json`) via `gcloud storage cp`. Re-run after editing `family.json` to publish changes; the API picks them up within `FamilyData:SnapshotTtlMinutes` without a redeploy. Auth via Application Default Credentials / `gcloud auth login`.
- **[`scripts/upload-media.mjs`](../../scripts/upload-media.mjs)** — uploads the gitignored local `media/` folder to R2 (`family-tree-media`); `--dry-run`; auth via `wrangler login` or `CLOUDFLARE_*` env vars.
- **[`scripts/generate-media.mjs`](../../scripts/generate-media.mjs)** — AI portrait generator: `gpt-image-2` stills + optional **Sora** living clips (`--with-video`; **Sora 2 API sunsets 2026-09-24**). Writes only to `media/`. Many flags (`--only`, `--image`, `--force`, `--size`, `--seconds`, `--dry-run`).
- **[`scripts/copy-portraits.ps1`](../../scripts/copy-portraits.ps1)** (PowerShell) — imports real family photos/videos into `media/portraits`, renaming each to its person id from a `media_catalog` JSON map (first photo → `p-XXXX.<ext>`, extras `-2`/`-3`, videos numbered independently). Reads the source folder only — never alters originals. Optional `-FamilyJson` back-fills missing `portrait`/`portraitVideo` fields in [`family.json`](../../src/backend/FamilyTree.Api/Data/family.json) via a minimal in-place edit (never overwrites existing values). Params `-Input`/`-Output`/`-Map`, plus `-Force` and `-WhatIf`.
- **[`src/frontend/scripts/generate-icons.mjs`](../../src/frontend/scripts/generate-icons.mjs)** (`npm run icons`) — regenerates favicons, PWA icons, OG image from one SVG source (uses `sharp` + `opentype.js`).
