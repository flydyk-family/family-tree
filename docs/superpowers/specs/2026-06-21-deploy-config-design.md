# Deploy configuration for auth + Firestore + GCS seed — design

**Date:** 2026-06-21
**Status:** Approved (brainstorm) → ready for implementation plan

## Problem & goal

The auth feature ([#91](https://github.com/flydyk-family/family-tree/pull/91),
[#100](https://github.com/flydyk-family/family-tree/pull/100),
[#102](https://github.com/flydyk-family/family-tree/pull/102)), Firestore-backed durable
edits (#100), and the GCS-sourced seed (#101) are all on `main` but **not yet enabled in
production**. Three concrete gaps prevent them from working when deployed:

1. **The deployed SPA has no Google client ID.** `deploy.yml`'s SPA build step passes only
   `APP_COMMIT`, so `VITE_GOOGLE_CLIENT_ID` is undefined at build time → the sign-in control
   renders nothing in production (a permanent no-op).
2. **Cloud Run has no auth/Firestore/GCS config.** The deploy step sets only `APP_COMMIT`,
   so `Authentication:Google:ClientId`, the editor allow-list, `Firestore:ProjectId`, and
   `FamilyData:Source` are all unset → sign-in token validation fails, edits fall back to
   in-memory, and the seed is read from the baked-in file rather than GCS.
3. **The API ignores proxy forwarded headers.** The rate limiter partitions by
   `httpContext.Connection.RemoteIpAddress` (`Program.cs`), but behind the
   Cloudflare → Cloud Run chain that address is the proxy's, so **all clients share one
   rate-limit partition** until `X-Forwarded-For` is honored.

**Goal:** wire the deploy so these features work in production — without going live. This
PR-d lands the configuration on `main`; the owner provisions the infra, sets the secrets,
and cuts the release as separate, deliberate steps.

## Scope / boundary

- **In:** one app-code change (`UseForwardedHeaders`), one workflow change
  (`VITE_GOOGLE_CLIENT_ID` at the SPA build), idempotent provisioning additions to
  `setup-gcp-deploy.ps1`, the owner runbook, and reference-doc updates.
- **Out (owner actions, not in this PR):** running the provisioning script, setting the
  `VITE_GOOGLE_CLIENT_ID` GitHub variable, putting editor emails into Secret Manager, and
  cutting the `vX.Y.Z` release. No agent runs `gcloud`/`wrangler` against the project.
- **Out (deferred):** a billing budget alert.

## Decisions (from brainstorming, 2026-06-21)

- **Editor emails → GCP Secret Manager** (PII; mirrors how `MediatR__LicenseKey` is
  already handled). Never in GitHub, never in plaintext env, never committed.
- **`VITE_GOOGLE_CLIENT_ID` → a GitHub Actions repo variable** (public value), consumed by
  the `deploy.yml` SPA build step. The SPA is built in GitHub Actions and the prebuilt
  `dist` is uploaded via `wrangler pages deploy` — Cloudflare does **not** rebuild — so no
  Cloudflare-side build var is needed. The **same** value is the backend's
  `Authentication:Google:ClientId` (one source of truth).
- **Runtime config is set once on the Cloud Run service** (env vars + bound secret),
  preserved across deploys because the workflow's `--update-env-vars APP_COMMIT=…` only
  touches that one variable. It is **not** placed in `deploy.yml` (keeps PII out of CI and
  avoids empty-variable footguns where an unset var would clobber a default).
- **No budget alert.**
- **PR-d stops at a merged PR.** The owner provisions and releases.

## Architecture / changes

### 1. App code — `Program.cs`: trust proxy forwarded headers

Add `UseForwardedHeaders` to the pipeline (before authentication and rate limiting):

- `ForwardedHeaders = XForwardedFor | XForwardedProto`.
- **Clear `KnownNetworks` and `KnownProxies`** — Cloud Run's front-end IPs are not a fixed,
  enumerable set, so the default "only trust loopback" would drop the headers. Set
  `ForwardLimit` to a small value appropriate for the single Cloudflare → Cloud Run hop.
- Effect: `RemoteIpAddress` becomes the real client IP (per-IP rate limiting works) and
  `Request.Scheme` reflects `https`. **No-op locally** — without an `X-Forwarded-For`
  header the middleware does nothing, so dev/tests are unaffected.

**Security analysis (documented in the reference, not just here):**

- `KnownProxies`/`KnownNetworks` are ASP.NET `ForwardedHeadersOptions` — an **in-process
  .NET setting**. Clearing them changes nothing in Cloudflare or Cloud Run config.
- `RemoteIpAddress` is used in **exactly one place** — the rate-limit partition key
  (`Program.cs:86`). It is **never** used for authentication, authorization, editor gating,
  or data access (those are the session cookie + `canEdit` claim). So a spoofed IP cannot
  bypass auth or reach data.
- **Residual vector:** because the Cloud Run service is `--allow-unauthenticated` and
  directly reachable, a caller can bypass Cloudflare and forge `X-Forwarded-For`. The
  impact ceiling is **rate-limit gaming** — evading one's own throttle (more *public* read
  requests) or targeting a victim IP's bucket for a time-boxed 429. No data exposure, no
  privilege gain.
- **Net safer than the status quo:** without the change the limiter partitions by the
  single proxy IP — one shared bucket for the whole internet, trivially exhausted to 429
  everyone. Per-IP buckets are the more robust posture; the spoofing vector that replaces
  the global-DoS is more sophisticated and lower-impact.
- Restricting `KnownNetworks` to Cloudflare IPs **would not help** — Cloud Run terminates
  the hop, so the immediate peer the app sees is Google's front-end, not Cloudflare. The
  proper fix is at **ingress** (see Follow-ups), not in app config.

This is the **only** application-code change. It needs a unit/integration check that a
forwarded `X-Forwarded-For` is reflected in the partition/visible client IP (and that the
absence of the header is a no-op).

### 2. Workflow — `deploy.yml`: bake the client ID into the SPA build

In the `deploy-spa` job's **Build** step, add to `env`:

```yaml
        env:
          APP_COMMIT: ${{ github.sha }}
          VITE_GOOGLE_CLIENT_ID: ${{ vars.VITE_GOOGLE_CLIENT_ID }}
```

- `vars.VITE_GOOGLE_CLIENT_ID` is a GitHub Actions **repo variable** (public).
- If unset, the build still succeeds and the control no-ops (graceful) — so this does not
  break existing/pre-provision deploys.
- This is the only `deploy.yml` change. The Cloud Run runtime config stays out of the
  workflow (decision above).

### 3. Cloud Run runtime config (set once on the service)

Applied by the provisioning script (section 4) against the existing service and preserved
across subsequent workflow deploys:

| Setting | How it's set | Source |
|---|---|---|
| `Authentication__Google__ClientId` | `--update-env-vars` | the public client ID (same value as `VITE_GOOGLE_CLIENT_ID`) |
| `Firestore__ProjectId` | `--update-env-vars` | the GCP project id (`vars.GCP_PROJECT_ID`) |
| `FamilyData__Source` | `--update-env-vars` | `gs://<seed-bucket>/family.json` |
| `Authentication__Google__Editors__0…` | `--set-secrets` | one **Secret Manager** secret per index (`family-editor-0`, …) |

- **Editor allow-list shape:** .NET binds arrays from indexed keys, so each editor is its
  own secret bound to `Authentication__Google__Editors__<n>`. The default is a single
  editor (the owner) → one secret `family-editor-0`. Adding an editor = a new secret
  `family-editor-1` bound to `…Editors__1`. Documented in the runbook.
- Setting these creates a new Cloud Run revision immediately; the app is fully configured
  from that revision on. Later releases (`--update-env-vars APP_COMMIT=…`) preserve them —
  exactly the existing `MediatR__LicenseKey` flow.

### 4. `setup-gcp-deploy.ps1` — idempotent provisioning additions

The script already (step 4) creates/seeds the Cloud Run service and captures its URL, and
has `Set-GhVar` + a Secret-Manager precedent (the MediatR key, step 7). Add — each step
idempotent (safe to re-run, "create if absent"):

- **Firestore:** enable `firestore.googleapis.com`; create the **native-mode** database if
  absent; grant the runtime service account `roles/datastore.user`.
- **GCS seed bucket:** create the bucket (name from a new `-SeedBucket` param, default
  e.g. `<ProjectId>-family-seed`) if absent; grant the runtime SA
  `roles/storage.objectViewer` on it; print the `scripts/upload-seed.mjs` command (with
  `SEED_BUCKET`/`SEED_OBJECT`) to publish the seed (the script may invoke it, or document
  it — the seed file lives in the repo, so a one-line upload is enough).
- **Editor secret:** create `family-editor-0` from a new `-EditorEmails` param (first
  entry) — additional entries create `family-editor-1`, … — and grant the SA
  `roles/secretmanager.secretAccessor` on each (same shape as the MediatR step).
- **Configure the service:** `gcloud run services update <service>` with
  `--update-env-vars` for `Authentication__Google__ClientId`, `Firestore__ProjectId`,
  `FamilyData__Source` and `--update-secrets` for each `Authentication__Google__Editors__<n>`.
- **GitHub variable:** `Set-GhVar VITE_GOOGLE_CLIENT_ID <client-id>` so the SPA build picks
  it up.
- **New params:** `-GoogleClientId`, `-EditorEmails` (string array), `-SeedBucket`
  (defaulted). All optional — when omitted, the script prints an "ACTION REQUIRED" note and
  skips that piece (matching the existing optional-MediatR/Cloudflare handling), so a
  partial run never half-breaks the service.
- **No budget step.**

### 5. Owner runbook — `docs/ci-cd/deploy.md`

Document the end-to-end order (the script automates most of it):

1. Ensure the OAuth client exists with the production origin whitelisted — cross-reference
   [`google-signin-setup.md`](google-signin-setup.md) (already written).
2. Run `setup-gcp-deploy.ps1` with the new params (provisions Firestore + bucket + editor
   secret, configures the service, sets the GitHub variable).
3. Publish the seed: `node scripts/upload-seed.mjs` (with `SEED_BUCKET`/`SEED_OBJECT`).
4. Cut the release: bump `VERSION`, push the `vX.Y.Z` tag (triggers the deploy).
5. Verify: `/health` on the Cloud Run URL; sign in on `https://family-tree-4fl.pages.dev`;
   confirm an editor sees the badge and a biography `PUT` persists (Firestore).

State plainly that **editor emails are set only in Secret Manager** and that **no OAuth
client secret and no DB password** are needed.

### 6. Reference docs

- `docs/reference/features/backend-api.md` (or the security/ops section): note
  `UseForwardedHeaders` and the per-IP rate-limit-behind-proxy behavior + the spoofing
  trade-off.
- `docs/reference/ci-cd.md` / `tech-stack.md`: the new prod env vars + the Secret-Manager
  editor list + the `VITE_GOOGLE_CLIENT_ID` build variable.
- `docs/reference/roadmap.md`: move "deploy config / go-live enablement" toward done
  (config landed; the owner triggers go-live).
- Run the `update-docs-for-pr` skill at PR time.

## Testing

- **Backend:** a focused test that the forwarded-headers middleware reflects a supplied
  `X-Forwarded-For` (real client IP visible to the rate-limit partition) and that its
  absence is a no-op. Existing auth/integration suites must stay green (the middleware is
  additive and dormant without the header).
- **Workflow/script:** not unit-tested (infra). Validate by review + a `-WhatIf`/dry
  reading; the script's idempotent guards are the safety net. The `deploy.yml` change is a
  one-line env addition reviewed against the build step.
- **No frontend code change**, so the SPA suite is unaffected (the client ID is purely a
  build-time input).

## Out of scope

- Running the provisioning or the release (owner actions).
- A billing budget alert (deferred).
- A custom domain (the app stays on `family-tree-4fl.pages.dev`).
- Any change to the auth model, the editor UI, or the data model.

## Follow-ups (tracked, not in this PR)

- **Lock Cloud Run ingress to Cloudflare.** Close the `X-Forwarded-For` spoofing vector at
  its root by ensuring only the Cloudflare proxy can reach the Cloud Run service — e.g. a
  Cloud Run ingress restriction behind a load balancer scoped to Cloudflare IP ranges, or a
  shared-secret header the Cloudflare proxy (`functions/api/[[path]].ts`) injects and the
  API requires. Separate infra/code; deliberately out of PR-d to keep it focused. Until
  then the exposure is rate-limit gaming on public-read data (low severity).

## Risks / notes

- **Forwarded-headers trust:** see the full security analysis under change 1. In short —
  it's an in-app .NET setting (no Cloudflare change), the client IP feeds only the
  rate-limit partition (never authz), and it's net safer than today's single shared bucket.
  The residual spoofing vector is closed by the ingress-lock follow-up.
- **Ordering:** the service must exist before its env vars/secret can be set. The script
  creates the service (step 4) before the configure step, so a single run is sufficient;
  the runbook still states the dependency for manual paths.
- **Empty variables:** runtime config is set on the service (not via `deploy.yml`
  `--update-env-vars` interpolation) specifically to avoid an unset GitHub variable
  clobbering a baked-in default (e.g. blanking `FamilyData:Source`).
- **Graceful pre-provision state:** every piece degrades safely if unset — no client ID →
  sign-in no-op; blank Firestore project → in-memory stores; non-`gs://` source → baked-in
  seed. So landing this PR before provisioning changes nothing about the current live site.
