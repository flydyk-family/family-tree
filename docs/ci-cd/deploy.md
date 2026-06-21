# Deployment — operating notes

The app deploys to free hosting on every `vX.Y.Z` **tag**:
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
- A `vX.Y.Z` tag **must** match `VERSION` (i.e. `v<VERSION>`; the workflow fails otherwise).
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

> **Google sign-in (OAuth client + auth env vars):** creating the OAuth client,
> whitelisting origins, and the editor allow-list are documented separately in
> [`google-signin-setup.md`](google-signin-setup.md) — that doc covers both the
> shared Google Cloud Console setup and the local-dev wiring. In production the API
> additionally needs `Authentication__Google__ClientId`,
> `Authentication__Google__Editors__*`, and `Firestore__ProjectId`, plus the GitHub Actions variable `VITE_GOOGLE_CLIENT_ID` (baked into the SPA at build time in deploy.yml) (no OAuth client secret, no DB password).

### Enabling auth, Firestore, and the GCS seed in production

Before the first release that uses auth, a one-time provisioning run is required.
It is fully automated, idempotently, by `setup-gcp-deploy.ps1` with three new
parameters:

```powershell
./docs/ci-cd/setup-gcp-deploy.ps1 `
  -ProjectId <GCP_PROJECT_ID> `
  -GitHubRepo <owner>/<repo> `
  -GoogleClientId <CLIENT_ID>.apps.googleusercontent.com `
  -EditorEmails editor1@example.com,editor2@example.com `
  -SeedBucket <bucket-name>          # optional — defaults to <ProjectId>-family-seed
```

The script provisions (idempotently — safe to re-run):

- **Firestore** (native mode) + `datastore.user` IAM role for the Cloud Run runtime SA.
- **GCS seed bucket** (same region as Cloud Run) + `storage.objectViewer` for the runtime SA + initial upload of the committed `family.json`.
- **Editor secrets** — one Secret Manager secret (`family-editor-0`, `family-editor-1`, …) per email address + `secretmanager.secretAccessor` for the runtime SA. Editor emails live only here — never in the repo.
- **Cloud Run runtime config** — sets the three env vars and binds each editor secret to the corresponding `Authentication__Google__Editors__N` env position:

  | Setting | Where | Source |
  |---|---|---|
  | `Authentication__Google__ClientId` | Cloud Run env var | public client ID (= `VITE_GOOGLE_CLIENT_ID`) |
  | `Firestore__ProjectId` | Cloud Run env var | the GCP project id |
  | `FamilyData__Source` | Cloud Run env var | `gs://<bucket>/family.json` |
  | `Authentication__Google__Editors__0…` | Secret Manager → Cloud Run secret binding | one secret per editor email |
  | `VITE_GOOGLE_CLIENT_ID` | GitHub Actions variable (SPA build) | public client ID |

  Runtime config is applied **once to the Cloud Run service** and is preserved across all subsequent deploys — you do not need to re-run the script on each release.

- **`VITE_GOOGLE_CLIENT_ID`** — sets the GitHub Actions repository variable used during the SPA build step in `deploy.yml`.

> **No OAuth client secret, no DB password.** The client ID is public. Editor emails are personal data and live only in GCP Secret Manager. See [`google-signin-setup.md`](google-signin-setup.md) for the OAuth-client setup (Part 1, done once before running this script).

After the script completes, **go live by cutting a release** (bump `VERSION`, push a `vX.Y.Z` tag) — see [Releasing](#releasing) below.

#### Verification checklist (after the first release with auth)

- `curl -fsS https://<cloud-run-url>/health` → `{ "status": "Healthy", … }` (Cloud Run URL directly — not through Pages).
- Open `https://family-tree-4fl.pages.dev` → sign in → your name appears + **Editor** badge if your email is in the allow-list.
- `PUT /api/people/{id}/biography` (editor session cookie) → `200`, and a follow-up `GET` reflects the new text (persisted in Firestore, not reset on container restart).

> **Scripted:** the Google Cloud + GitHub steps below are automated, idempotently,
> by [`setup-gcp-deploy.ps1`](setup-gcp-deploy.ps1) (Windows PowerShell 7+). Run e.g.
> `./setup-gcp-deploy.ps1 -ProjectId <id> -GitHubRepo <owner>/<repo>` after
> `gcloud auth login` and `gh auth login`. The steps below remain the reference; the
> Cloudflare `API_ORIGIN` variable is set manually either way (the script prints it).
>
> **gcloud + Python:** gcloud needs **Python 3.10–3.14**. If `gcloud` errors with
> *"running gcloud with Python 3.8 … no longer supported"*, point it at a good
> interpreter via `CLOUDSDK_PYTHON` (any Python 3.10–3.14, e.g. a conda env's
> `python.exe` — no `conda activate` needed): set `$env:CLOUDSDK_PYTHON =
> 'D:\path\to\python.exe'` for the session, or persist it with
> `[Environment]::SetEnvironmentVariable('CLOUDSDK_PYTHON','D:\path\to\python.exe','User')`.
> The script also accepts `-CloudSdkPython <python.exe>` to wire it for that run.

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
6. **GCS seed bucket** — the family graph is read from a GCS object in deployment (no longer baked into the image). One-time steps:
   ```bash
   # a) create the bucket (choose the same region as the Cloud Run service)
   gcloud storage buckets create gs://family-tree-seed --location <REGION> --project <PROJECT_ID>
   # b) grant the Cloud Run runtime SA (default compute SA) object-read access
   PNUM=$(gcloud projects describe <PROJECT_ID> --format='value(projectNumber)')
   gcloud storage buckets add-iam-policy-binding gs://family-tree-seed \
     --member "serviceAccount:$PNUM-compute@developer.gserviceaccount.com" \
     --role roles/storage.objectViewer
   # c) push the committed seed file to the bucket (re-run any time you edit family.json)
   SEED_BUCKET=<bucket> SEED_OBJECT=family.json node scripts/upload-seed.mjs
   # ^ <bucket> must match the -SeedBucket used during provisioning (default <ProjectId>-family-seed)
   # d) wire the env var on the Cloud Run service
   gcloud run services update <CLOUD_RUN_SERVICE> --project <PROJECT_ID> --region <REGION> \
     --update-env-vars FamilyData__Source=gs://family-tree-seed/family.json
   ```
   **No new secrets, no Workload Identity changes.** GCS is read keylessly via the same Application Default Credentials that already cover Firestore. The seed is picked up within `FamilyData:SnapshotTtlMinutes` (default 10 min) after you upload a new object — no redeploy needed. If a GCS read fails transiently after the first successful load, the API keeps serving the last-good cached snapshot and logs a warning (no 500s); if it fails on startup the API exits immediately (bad deploy is caught fast).

7. **MediatR licence key** (optional — the API runs unlicensed with a warning):
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
   Releases deploy from a `vX.Y.Z` **tag** (never from a branch Cloudflare
   watches), so for a Direct Upload the production branch is just a **label**: the
   workflow runs `wrangler pages deploy … --branch=production`, and a deploy is
   published to **production** (canonical `*.pages.dev` + production env vars) only
   when that label equals the project's production branch. Keep both `production`.
   *(This label is independent of the GitHub Actions `production` environment.)*
8. Add a Pages **environment variable** `API_ORIGIN` = the Cloud Run service URL
   from step 4 (e.g. `https://<service>-<hash>.<region>.run.app`).
9. Note the project's `*.pages.dev` URL — this is the public site.

### Cloudflare R2 (media)

Family photos and living-portrait clips are **not in the git repo**. They live in an
R2 bucket and are served same-origin at `/media/*` by `src/frontend/functions/media/[[path]].ts`.

One-time setup:

1. Create the bucket: `npx wrangler r2 bucket create family-tree-media`
2. In the Pages project (**family-tree** → Settings → Functions → R2 bucket bindings),
   add binding **`MEDIA`** → bucket **`family-tree-media`** (Production; add Preview too
   if previews should show media). Without the binding, `/media/*` returns 502.

Adding / updating media:

1. Keep originals in the gitignored `<repo root>/media/` folder; its structure mirrors
   object keys (`media/portraits/p-0001.jpg` → `/media/portraits/p-0001.jpg`).
2. **Filenames are immutable** — a changed image gets a *new* name (the function serves
   `Cache-Control: immutable`). Reference the filenames from `family.json`
   (`portrait`, `portraitVideo`).
3. Upload: `node scripts/upload-media.mjs` (add `--dry-run` to preview). Auth via
   `npx wrangler login` or `CLOUDFLARE_API_TOKEN`.
4. Encoding guidance: stills JPEG/WebP ≤ ~200 KB; living-portrait clips MP4 (H.264,
   no audio track), ≤ 720 px on the long edge, 2–6 s, loop-friendly cut.

Verify after upload: `curl -I https://family-tree-4fl.pages.dev/media/portraits/<name>` → 200
with `accept-ranges: bytes` and `cache-control: … immutable`.

### Generating portrait media (AI, one-time)

`scripts/generate-media.mjs` creates the `media/portraits/p-XXXX.jpg` (and, with
`--with-video`, `.mp4`) pair per person via the OpenAI API, ready for
`scripts/upload-media.mjs`. It writes only into the gitignored `media/` folder.

> **Sora deprecation:** OpenAI's video (Sora 2) API shuts down **2026-09-24**. Run any
> `--with-video` generation before then. Still-portrait generation (`gpt-image-2`) is
> unaffected.

```bash
# Preview prompts, planned calls, and a cost estimate — no spend, no key needed:
node scripts/generate-media.mjs --dry-run

# Generate stills for everyone (asks to confirm the estimated spend):
OPENAI_API_KEY=sk-... node scripts/generate-media.mjs

# Stills + living clips for two people, regenerating even if files exist:
OPENAI_API_KEY=sk-... node scripts/generate-media.mjs --only p-0016,p-0003 --with-video --force

# Animate a real photo you already have, for one person:
OPENAI_API_KEY=sk-... node scripts/generate-media.mjs --only p-0016 --image ./grandpa.jpg --with-video
```

Flags: `--only <ids>`, `--with-video`, `--image <path>` (needs one `--only`),
`--prompt "<text>"` (override the auto prompt), `--force` (default skips existing),
`--size` (720x1280 | 1280x720 | 1024x1792 | 1792x1024, default 720x1280),
`--seconds` (4 | 8 | 12, default 4), `--dry-run`, `--yes` (skip the confirm).
Default size/duration ≈ $0.45–0.55 per person with video; clips are played muted in
the UI (the tool best-effort strips audio if `ffmpeg` is on `PATH`).

The generator's own tests run with `node --test scripts/lib/*.test.mjs` (built-in
runner; no `npm install`). Then publish with `node scripts/upload-media.mjs` and
reference the filenames from `family.json` (`portrait`, `portraitVideo`).

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

`main` always holds the **next in-development** version; each release ships from its
own `release-X.Y.Z` **branch**, and the deploy is triggered by a `vX.Y.Z` **tag** on
that branch. To cut release **0.1.0** (assuming `main` currently has `VERSION` = `0.1.0`):

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
git tag v0.1.0
git push origin v0.1.0    # push the version tag → deploy.yml runs both jobs
```

The deploy builds from the **tagged commit on `release-0.1.0`** (where `VERSION` is
still `0.1.0`), so the workflow's `v<VERSION>` guard passes even though `main` has
already moved to `0.2.0`.

> **Tag vs branch:** the tag is `vX.Y.Z` (e.g. `v0.1.0`) and the branch is
> `release-X.Y.Z` — distinct names, so no ambiguous-ref problems. Patching an
> already-released line? See **Hotfix releases** below.

Or trigger manually: Actions → **Deploy** → *Run workflow*.

The tag push also **publishes a GitHub Release** (`github-release` job, after both
deploys succeed) with **auto-generated notes** — the PRs/commits since the previous
version plus a *Full Changelog* `…/compare/<prev>...<tag>` link (standard GitHub
release notes). This runs only for `vX.Y.Z` tag pushes, not manual `workflow_dispatch`.

> **Re-deploying the same commit:** the Cloud Run revision suffix replaces the dots
> in the version with dashes — e.g. `0.1.0` → `v0-1-0-<sha7>`.
> Re-running the workflow for the **same commit** (a job re-run, or a repeated
> `workflow_dispatch` on the same tag) fails at `gcloud run deploy` with a
> duplicate-revision-name error. To re-deploy the same commit, bump `VERSION`
> and retag, or drop `--revision-suffix` for that one manual run.

## Hotfix releases

Once a release branch is cut, `main` moves on — so to ship an urgent fix to the
**already-deployed** line you patch the **release branch**, not `main`. Example:
production runs `0.1.0` (from `release-0.1.0`) while `main` is already `0.2.0`; to
ship fix **0.1.1**:

```bash
# 1. Branch off the RELEASE branch. (Never rebase a release branch or move its base —
#    it stays rooted at the commit it was cut from.)
git fetch origin
git switch -c hotfix/0.1.1 origin/release-0.1.0

# 2. Make the fix, then bump the patch version on this line:
#    edit VERSION -> 0.1.1
git commit -am "fix: <what> + bump VERSION to 0.1.1"
git push -u origin hotfix/0.1.1

# 3. PR hotfix/0.1.1 -> release-0.1.0; merge it with a MERGE COMMIT (NOT squash, so the
#    release line's history stays mergeable into main), then tag the release branch:
git switch release-0.1.0 && git pull
git tag v0.1.1
git push origin v0.1.1            # → deploy.yml ships 0.1.1
```

The patch version makes the Cloud Run revision suffix (`…-v0-1-1-…`) unique, so a
hotfix deploy never collides with the original release.

**Forward-port to `main`** by **merging the release branch into `main`** — *not*
cherry-picking; a merge carries the history so the next release→main merge stays
clean. Because `main` is ahead (`VERSION` `0.2.0`) this conflicts, so resolve it on
an **intermediate branch** and PR that into `main`:

```bash
git switch main && git pull
git switch -c forward-port/0.1.1-to-main
git merge release-0.1.0          # resolve the VERSION conflict, keeping main's 0.2.0
git push -u origin forward-port/0.1.1-to-main
# PR forward-port/0.1.1-to-main -> main; merge it with a MERGE COMMIT (not squash).
```

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

## Preview deployments (planned — not yet built)

Today the workflow deploys only **production**, triggered by a `vX.Y.Z` tag. To
preview the app from `main` or a feature branch (the roadmap's "continuous delivery
to a dev host" item), a separate path is needed. Two tiers, cheapest first:

### Option A — SPA-only preview, reusing the production API (minimal, $0)
Cloudflare Pages treats any `wrangler pages deploy … --branch=<x>` where `<x>` ≠ the
production branch (`production`) as a **preview** deployment: its own `*.pages.dev`
URL and the separate **Preview** environment-variable set. So a preview needs only:
- a Cloudflare Pages **Preview** `API_ORIGIN` = the production Cloud Run URL (the data
  is read-only + fictional, so sharing the prod API is fine);
- a workflow (e.g. `deploy-preview.yml`) on **push to `main`** / **`workflow_dispatch`
  with a branch input** / **PR**, that builds the SPA and runs
  `wrangler pages deploy dist --branch=<branch>`.

No new GCP, no new secrets, no Workload Identity changes — it touches only Cloudflare.

### Option B — also preview the branch's API
On top of A:
- build + push a branch/commit-tagged image to Artifact Registry;
- deploy a Cloud Run **tagged, no-traffic revision**
  (`gcloud run deploy … --tag <name> --no-traffic`) → a stable
  `https://<name>---<service>-….run.app` URL with **no** production-traffic impact
  (still scale-to-zero, $0);
- point the Preview `API_ORIGIN` at that tagged URL;
- **a second Workload Identity binding** — the current one only trusts the
  `…:environment:production` subject, so a preview job calling `gcloud` (under a
  different OIDC subject, e.g. `…:ref:refs/heads/main`) needs its own
  `roles/iam.workloadIdentityUser` member.

> **Exposure:** preview URLs are public on `*.pages.dev`. Fine for the fictional
> dataset; once real data / auth land, gate previews behind **Cloudflare Access**
> (Pages → preview deployment access control).

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
