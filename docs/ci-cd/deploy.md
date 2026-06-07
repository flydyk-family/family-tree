# Deployment — operating notes

The app deploys to free hosting on every `release-X.Y.Z` **tag**:
the .NET API ships as a container to **Google Cloud Run**, and the Vue
SPA ships to **Cloudflare Pages**, which reverse-proxies `/api/*` to the API.
Workflow: [`.github/workflows/deploy.yml`](../../.github/workflows/deploy.yml).
Design: [`docs/superpowers/specs/2026-06-06-public-deploy-design.md`](../superpowers/specs/2026-06-06-public-deploy-design.md).

## Topology

```
Browser → Cloudflare Pages (SPA, free SSL, *.pages.dev)
            │  /api/*  → Pages Function → Cloud Run API (scale-to-zero)
            ▼
        Google Cloud Run  ← image from Google Artifact Registry
```

## Versioning

- The repo-root **`VERSION`** file is the single source of truth; any branch reads
  it. The .NET assembly and the SPA build both stamp it; `/health` returns it.
- A `release-X.Y.Z` tag **must** match `VERSION` (the workflow fails otherwise).
- **After each release, bump `VERSION`** to the next in-development number on `main`.

## Cost

Cloud Run's **always-free tier** (2M requests, 180k vCPU-s, 360k GiB-s per month)
plus **scale-to-zero** keeps a low-traffic site at **$0**; Artifact Registry's
first 0.5 GB of storage is free (the single API image fits). Cloudflare Pages is
free. **Note:** Cloud Run requires **billing enabled** on the GCP project (a card
on file) even though usage stays within the free tier — there is no no-card path.

## One-time owner setup (not in version control)

The workflow builds the image in the GitHub runner and pushes it to **Google
Artifact Registry**, then `gcloud run deploy` rolls it out — all authenticated
**keylessly** via Workload Identity Federation (no service-account JSON keys).

> **Scripted:** the Google Cloud + GitHub steps below are automated, idempotently,
> by [`setup-gcp-deploy.ps1`](setup-gcp-deploy.ps1) (Windows PowerShell 7+). Run e.g.
> `./setup-gcp-deploy.ps1 -ProjectId <id> -GitHubRepo <owner>/<repo>` after
> `gcloud auth login` and `gh auth login`. The steps below remain the reference; the
> Cloudflare `API_ORIGIN` variable is set manually either way (the script prints it).

### Google Cloud (API)
1. Create or pick a **project** and note its **Project ID**; **enable billing** on
   it (card required; usage stays in the free tier). Install/auth the `gcloud` CLI.
2. Enable the APIs:
   ```bash
   gcloud services enable run.googleapis.com artifactregistry.googleapis.com \
     iamcredentials.googleapis.com sts.googleapis.com --project <PROJECT_ID>
   ```
3. Create an **Artifact Registry** Docker repo in your region (this is `GAR_REPOSITORY`):
   ```bash
   gcloud artifacts repositories create <GAR_REPOSITORY> --repository-format=docker \
     --location <REGION> --project <PROJECT_ID>
   ```
4. **Seed the Cloud Run service** so it has a stable public URL before the first
   release (the URL is fixed per service+region+project; the first release swaps the
   image). Target port **8080**, **min instances 0** (scale-to-zero), public:
   ```bash
   gcloud run deploy <CLOUD_RUN_SERVICE> --project <PROJECT_ID> --region <REGION> \
     --image us-docker.pkg.dev/cloudrun/container/hello \
     --allow-unauthenticated --port 8080 --min-instances 0
   ```
   Note the service URL it prints (`https://<service>-<hash>.<region>.run.app`).
   (Optional: in the service's **Health checks**, point a liveness/startup probe at
   **`/health`** once the real image is deployed.)
5. **Deployer service account + Workload Identity Federation** (passwordless OIDC):
   ```bash
   # a) deployer SA
   gcloud iam service-accounts create github-deployer --project <PROJECT_ID>
   SA=github-deployer@<PROJECT_ID>.iam.gserviceaccount.com
   # b) least-privilege roles: deploy to Cloud Run, push images, act as the runtime SA
   for ROLE in roles/run.admin roles/artifactregistry.writer roles/iam.serviceAccountUser; do
     gcloud projects add-iam-policy-binding <PROJECT_ID> --member="serviceAccount:$SA" --role="$ROLE"
   done
   # c) Workload Identity pool + GitHub OIDC provider
   gcloud iam workload-identity-pools create github --location global --project <PROJECT_ID>
   gcloud iam workload-identity-pools providers create-oidc github \
     --location global --workload-identity-pool github --project <PROJECT_ID> \
     --issuer-uri "https://token.actions.githubusercontent.com" \
     --attribute-mapping "google.subject=assertion.sub,attribute.repository=assertion.repository" \
     --attribute-condition "assertion.repository=='<OWNER>/<REPO>'"
   # d) let GitHub's environment:production subject impersonate the deployer SA
   PNUM=$(gcloud projects describe <PROJECT_ID> --format='value(projectNumber)')
   gcloud iam service-accounts add-iam-policy-binding "$SA" --project <PROJECT_ID> \
     --role roles/iam.workloadIdentityUser \
     --member "principal://iam.googleapis.com/projects/$PNUM/locations/global/workloadIdentityPools/github/subject/repo:<OWNER>/<REPO>:environment:production"
   ```
   The **provider resource name** for the GitHub secret is
   `projects/<PNUM>/locations/global/workloadIdentityPools/github/providers/github`.
   The stable subject (`…:environment:production`, matching the workflow's
   `environment: production`) means one binding covers every release tag and manual run.
6. **MediatR licence key** (optional — the API runs unlicensed with a warning):
   store it in Secret Manager and bind it to the service as `MediatR__LicenseKey`:
   ```bash
   gcloud services enable secretmanager.googleapis.com --project <PROJECT_ID>
   printf '%s' '<KEY>' | gcloud secrets create mediatr-license-key --data-file=- --project <PROJECT_ID>
   # grant the Cloud Run runtime SA (default compute SA unless you set one) read access
   gcloud secrets add-iam-policy-binding mediatr-license-key --project <PROJECT_ID> \
     --role roles/secretmanager.secretAccessor \
     --member "serviceAccount:$PNUM-compute@developer.gserviceaccount.com"
   gcloud run services update <CLOUD_RUN_SERVICE> --project <PROJECT_ID> --region <REGION> \
     --update-secrets MediatR__LicenseKey=mediatr-license-key:latest
   ```

### Cloudflare (SPA + proxy)
7. Create a **Pages project**; set its **production branch** to `production`.
   Releases deploy from a `release-X.Y.Z` **tag** (never from a branch Cloudflare
   watches), so for a Direct Upload the production branch is just a **label**: the
   workflow runs `wrangler pages deploy … --branch=production`, and a deploy is
   published to **production** (canonical `*.pages.dev` + production env vars) only
   when that label equals the project's production branch. Keep both `production`.
   *(This label is independent of the GitHub Actions `production` environment.)*
8. Add a Pages **environment variable** `API_ORIGIN` = the Cloud Run service URL
   from step 4 (e.g. `https://<service>-<hash>.<region>.run.app`).
9. Note the project's `*.pages.dev` URL — this is the public site.

### GitHub (repo settings)
10. **Secrets:** `GCP_WORKLOAD_IDENTITY_PROVIDER` (the provider resource name from
    step 5), `GCP_SERVICE_ACCOUNT` (the deployer SA email), `CLOUDFLARE_API_TOKEN`
    (Pages:Edit), `CLOUDFLARE_ACCOUNT_ID`. (No registry password — the image push
    authenticates with the Workload Identity access token.)
11. **Variables:** `GCP_PROJECT_ID`, `GCP_REGION`, `GAR_REPOSITORY`,
    `CLOUD_RUN_SERVICE`, `CLOUDFLARE_PAGES_PROJECT`.
12. Create a GitHub **`production` environment** (Settings → Environments) — it
    matches the workflow's `environment: production` and the WIF subject. Optional:
    add required reviewers to gate every deploy.

## Releasing

`main` always holds the **next in-development** version; each release ships from
its own `release-X.Y.Z` branch, and the deploy is triggered by a tag on that branch.
To cut release **0.1.0** (assuming `main` currently has `VERSION` = `0.1.0`):

```bash
# 1. Cut the release branch from main:
git switch -c release-0.1.0 main
git push -u origin release-0.1.0

# 2. Immediately bump main to the next dev version, so main and the release diverge:
git switch main
#   edit VERSION -> 0.2.0
git commit -am "chore: bump VERSION to 0.2.0 after cutting release-0.1.0"
git push

# 3. Tag the release branch and push the TAG (this triggers the deploy):
git switch release-0.1.0
git tag release-0.1.0
git push origin tag release-0.1.0    # push the tag explicitly → deploy.yml runs both jobs
```

The deploy builds from the **tagged commit on `release-0.1.0`** (where `VERSION` is
still `0.1.0`), so the workflow's `release-<VERSION>` guard passes even though `main`
has already moved to `0.2.0`.

> **Why `git push origin tag …` and not `git push origin release-0.1.0`?** The branch
> and the tag share the name `release-0.1.0`, so a bare `git push origin release-0.1.0`
> is **ambiguous** (`matches more than one`). `git push origin tag release-0.1.0`
> pushes the tag unambiguously. (Prefer a hotfix on the line? Commit to the
> `release-0.1.0` branch, bump its `VERSION` to `0.1.1`, then tag `release-0.1.1`.)

Or trigger manually: Actions → **Deploy** → *Run workflow*.

> **Re-deploying the same commit:** the Cloud Run revision suffix replaces the dots
> in the version with dashes — e.g. `0.1.0` → `v0-1-0-<sha7>`.
> Re-running the workflow for the **same commit** (a job re-run, or a repeated
> `workflow_dispatch` on the same tag) fails at `gcloud run deploy` with a
> duplicate-revision-name error. To re-deploy the same commit, bump `VERSION`
> and retag, or drop `--revision-suffix` for that one manual run.

## Verifying a deploy

```bash
# API version (direct on the Cloud Run URL):
curl -fsS https://<service>-<hash>.<region>.run.app/health
# Data through the public proxy:
curl -fsS https://<app>.pages.dev/api/family/graph
# Edge security headers:
curl -I    https://<app>.pages.dev
```
`/health` returns `{ "status": "Healthy", "version": "0.1.0", "commit": "<sha>" }`.
Open the site: the oak renders, a person popup opens, a deep link such as
`/person/p-0001` loads directly, and the subtle `v0.1.0` label shows bottom-right.

## Rollback

Cloud Run keeps every revision, so the fastest rollback is to shift traffic back to
a previous one (no rebuild):

```bash
# list revisions, newest first
gcloud run revisions list --service <CLOUD_RUN_SERVICE> --region <REGION> --project <PROJECT_ID>
# send 100% of traffic to a known-good revision
gcloud run services update-traffic <CLOUD_RUN_SERVICE> --region <REGION> --project <PROJECT_ID> \
  --to-revisions <CLOUD_RUN_SERVICE>-v0-1-0-<sha7>=100
```

Each release also pushes two Artifact Registry tags — the **version**
(`.../familytree-api:0.1.0`) and the **full 40-char commit SHA** — so you can
alternatively redeploy a prior image:

```bash
gcloud run deploy <CLOUD_RUN_SERVICE> --region <REGION> --project <PROJECT_ID> \
  --image <REGION>-docker.pkg.dev/<PROJECT_ID>/<GAR_REPOSITORY>/familytree-api:0.1.0
```

For the SPA, roll back to a prior deployment in the Cloudflare Pages dashboard.

## Notes

- **Cold start:** scale-to-zero means the first request after idle waits a few
  seconds for the API to wake; the SPA shell loads instantly from the CDN.
- **Observability (v1):** Cloud Run streams request logs, container logs, and system
  metrics to Cloud Logging / Cloud Monitoring — no app instrumentation. OpenTelemetry
  is deferred to the DB/auth phase (see the design spec); the `APP_COMMIT` / version
  values become its tags.
- **`commit` in `/health`:** injected at deploy time as the `APP_COMMIT` env var
  (7-char SHA). A manual `gcloud run deploy`/`update` without
  `--update-env-vars APP_COMMIT=...` leaves the prior value in place; a brand-new
  service with none set reports `"commit": "local"`.
- **Real data gate:** the public dataset is fictional. Before real family data is
  published, gate it behind auth or keep it fictional.
