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
        Azure Container Apps  ← image from GitHub Container Registry (ghcr.io)
```

## Versioning

- The repo-root **`VERSION`** file is the single source of truth; any branch reads
  it. The .NET assembly and the SPA build both stamp it; `/health` returns it.
- A `release-X.Y.Z` tag **must** match `VERSION` (the workflow fails otherwise).
- **After each release, bump `VERSION`** to the next in-development number on `main`.

## One-time owner setup (not in version control)

The workflow builds in the GitHub runner and pushes the image to **GitHub
Container Registry (ghcr.io)** using the built-in `GITHUB_TOKEN` — so there is **no
Azure Container Registry** (and no ~$5/mo ACR cost).

### Azure (API)
1. Create a **resource group** and a **Container Apps environment** (no ACR).
2. Create the **Container App**: external ingress, **target port 8080**,
   **min replicas 0** (scale-to-zero), liveness/readiness probe → **`/health`**.
   Seed it with any public 8080 image (e.g. `mcr.microsoft.com/dotnet/samples:aspnetapp`);
   the first release replaces it with the ghcr image.
3. Add the MediatR licence key as an app **secret** bound to the
   `MediatR__LicenseKey` environment variable. (Optional — the API runs unlicensed
   with a warning if absent.)
4. **OIDC federated credential** (passwordless): an Entra app registration with a
   federated credential whose **subject is `repo:<owner>/<repo>:environment:production`**
   (matches the workflow's `environment: production`, so one credential covers every
   release tag and manual run), granted **`Contributor`** on the resource group
   (covers `az containerapp update` — no `AcrPush` needed without ACR).

### GitHub Container Registry (image pull by ACA)
5. The first release creates a **private** `familytree-api` package under the repo
   owner. Let ACA pull it, either:
   - **Public (simplest, free):** repo → *Packages* → `familytree-api` → *Package
     settings* → **Change visibility → Public**, then `az containerapp revision
     restart -n <app> -g <rg>` so the first deploy pulls. (No secrets are baked into
     the image — the MediatR key is an ACA env var at runtime and the seed data is
     fictional.)
   - **Private:** store pull creds on the app *before* the first deploy —
     `az containerapp registry set -n <app> -g <rg> --server ghcr.io --username
     <github-user> --password <PAT with read:packages>`.
6. Create a GitHub **`production` environment** (Settings → Environments). Optional:
   add required reviewers to gate every deploy.

### Cloudflare (SPA + proxy)
7. Create a **Pages project**; set its **production branch** to `main`.
8. Add a Pages **environment variable** `API_ORIGIN` = the ACA app's public URL
   (e.g. `https://<aca-app>.<region>.azurecontainerapps.io`).
9. Note the project's `*.pages.dev` URL — this is the public site.

### GitHub (repo settings)
10. **Secrets:** `AZURE_CLIENT_ID`, `AZURE_TENANT_ID`, `AZURE_SUBSCRIPTION_ID`,
    `CLOUDFLARE_API_TOKEN` (Pages:Edit), `CLOUDFLARE_ACCOUNT_ID`.
    (No registry secret — ghcr push uses the built-in `GITHUB_TOKEN`.)
11. **Variables:** `ACA_APP_NAME`, `AZURE_RESOURCE_GROUP`, `CLOUDFLARE_PAGES_PROJECT`.

## Releasing

```bash
# Ensure VERSION on main holds the version you are releasing (e.g. 0.1.0).
git switch -c release-0.1.0 main
git push -u origin release-0.1.0
git tag release-0.1.0
git push origin release-0.1.0        # tag push → deploy.yml runs both jobs
```

Or trigger manually: Actions → **Deploy** → *Run workflow*.

> **Re-deploying the same commit:** the ACA revision suffix replaces the dots in
> the version with dashes — e.g. `0.1.0` → `v0-1-0-<sha7>`.
> Re-running the workflow for the **same commit** (a job re-run, or a repeated
> `workflow_dispatch` on the same tag) fails at `az containerapp update` with a
> duplicate-revision-suffix error. To re-deploy the same commit, bump `VERSION`
> and retag, or drop `--revision-suffix` for that one manual run.

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

Re-point the Container App to a previously built image. Each release pushes two
tags to ghcr.io: the **version** (`ghcr.io/<owner>/familytree-api:0.1.0`) and the
**full 40-char commit SHA**. The version tag is the easiest rollback target:

```bash
az containerapp update -n <ACA_APP_NAME> -g <RG> \
  --image ghcr.io/<owner>/familytree-api:0.1.0
```
(Or pin a specific `ghcr.io/<owner>/familytree-api:<full-git-sha>` from `git log` —
note it is the full 40-character SHA, not the 7-char short form.) For the SPA, roll
back to a prior deployment in the Cloudflare Pages dashboard.

## Notes

- **Cold start:** scale-to-zero means the first request after idle waits a few
  seconds for the API to wake; the SPA shell loads instantly from the CDN.
- **Observability (v1):** ACA streams container logs + system metrics to Log
  Analytics — no app instrumentation. OpenTelemetry is deferred to the DB/auth
  phase (see the design spec); the `APP_COMMIT` / version values become its tag.
- **`commit` in `/health`:** injected at deploy time as the `APP_COMMIT` env var
  (7-char SHA). A manual `az containerapp update` without
  `--set-env-vars APP_COMMIT=...` leaves it unset, so `/health` reports
  `"commit": "local"`.
- **Real data gate:** the public dataset is fictional. Before real family data is
  published, gate it behind auth or keep it fictional.
