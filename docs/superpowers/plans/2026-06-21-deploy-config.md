# Deploy Configuration (PR-d) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Wire the deploy so the existing Google sign-in, Firestore-backed edits, and GCS-sourced seed actually work in production — without going live (the owner provisions and releases separately).

**Architecture:** One backend code change (`UseForwardedHeaders` so per-IP rate limiting works behind the Cloudflare→Cloud Run proxy), one workflow change (bake `VITE_GOOGLE_CLIENT_ID` into the SPA build), idempotent provisioning additions to `setup-gcp-deploy.ps1` (Firestore + GCS seed bucket + editor secret + Cloud Run runtime config + the GitHub variable), and the owner runbook + reference docs. Runtime config is set once on the Cloud Run service and preserved across deploys; editor emails (PII) live only in GCP Secret Manager.

**Tech Stack:** ASP.NET Core (.NET 10), `Microsoft.AspNetCore.HttpOverrides`; GitHub Actions; PowerShell 7 + `gcloud`/`gh`; xUnit + AwesomeAssertions integration tests (`WebApplicationFactory<Program>`).

## Global Constraints

- **No app behavior change beyond the proxy headers.** The only backend code change is `UseForwardedHeaders`; it is a **no-op without an `X-Forwarded-For` header**, so dev/tests/local are unaffected.
- **Editor emails are PII** → GCP **Secret Manager** only. Never in GitHub, never in plaintext env, never committed. One secret per editor index (`family-editor-0`, `family-editor-1`, …) bound to `Authentication__Google__Editors__<n>`.
- **`VITE_GOOGLE_CLIENT_ID` is public** → a GitHub Actions **repo variable** consumed by the `deploy-spa` build step. The **same** value is the backend `Authentication__Google__ClientId`.
- **Runtime config is set once on the Cloud Run service** (env vars + bound secrets), **not** in `deploy.yml`. The workflow's `--update-env-vars APP_COMMIT=…` preserves it (it touches only that one var).
- **Use `--update-secrets` / `--update-env-vars`** (additive) when configuring the service so the existing `MediatR__LicenseKey` secret binding and `APP_COMMIT` are preserved.
- **Idempotent provisioning:** every `setup-gcp-deploy.ps1` addition guards with `Test-Exe … describe` and creates only if absent — safe to re-run. Optional params that are empty **skip** their piece with a `Write-Note` (never half-configure).
- **No budget alert** (deferred). **PR-d stops at a merged PR** — no agent runs `gcloud`/`wrangler` or cuts a release.
- Forwarded-headers security trade-off (a direct caller could spoof its rate-limit IP; impact is bounded to rate-limit gaming on public-read data) is **documented** in the reference; the root fix (lock Cloud Run ingress) is a tracked follow-up, not in this PR.

---

### Task 1: `UseForwardedHeaders` — per-IP rate limiting behind the proxy

**Files:**
- Modify: `src/backend/FamilyTree.Api/Program.cs` (add a `using`, insert the middleware before `app.UseExceptionHandler`)
- Test: `tests/integration/FamilyTree.IntegrationTests/ForwardedHeadersRateLimitTests.cs` (create)

**Interfaces:**
- Consumes: the existing rate-limit policy (`ApiRateLimitPolicy`, partitions by `httpContext.Connection.RemoteIpAddress`) and `FamilyApiFactory` (test host with the fixture seed).
- Produces: no new public API — a behavior (forwarded `X-Forwarded-For` becomes `RemoteIpAddress` → distinct rate-limit partitions).

- [ ] **Step 1: Write the failing test**

Create `tests/integration/FamilyTree.IntegrationTests/ForwardedHeadersRateLimitTests.cs`:

```csharp
using System.Net;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;

namespace FamilyTree.IntegrationTests;

public sealed class ForwardedHeadersRateLimitTests
{
    // Pin the limiter to 1 request/window so partitioning is directly observable.
    private static WebApplicationFactory<Program> Factory() =>
        new FamilyApiFactory().WithWebHostBuilder(builder =>
        {
            builder.UseSetting("RateLimiting:PermitLimit", "1");
            builder.UseSetting("RateLimiting:WindowSeconds", "300");
        });

    private static HttpRequestMessage GraphRequest(string forwardedFor)
    {
        var request = new HttpRequestMessage(HttpMethod.Get, "/api/family/graph");
        request.Headers.Add("X-Forwarded-For", forwardedFor);
        return request;
    }

    [Fact]
    public async Task RateLimit_WhenForwardedForDiffers_ShouldPartitionByClientIp()
    {
        using var factory = Factory();
        var client = factory.CreateClient();

        // First request from client A is allowed.
        var first = await client.SendAsync(GraphRequest("203.0.113.10"));
        first.StatusCode.Should().Be(HttpStatusCode.OK);

        // Second request from the SAME forwarded IP hits the per-IP limit.
        var second = await client.SendAsync(GraphRequest("203.0.113.10"));
        second.StatusCode.Should().Be(HttpStatusCode.TooManyRequests);

        // A DIFFERENT forwarded IP is a different partition → allowed.
        // Without UseForwardedHeaders both share the connection's ("unknown") partition,
        // so this would be 429 — which is exactly the RED before the middleware exists.
        var other = await client.SendAsync(GraphRequest("203.0.113.20"));
        other.StatusCode.Should().Be(HttpStatusCode.OK);
    }

    [Fact]
    public async Task RateLimit_WithoutForwardedFor_ShouldStillServeFirstRequest()
    {
        // No X-Forwarded-For → the middleware is a no-op; the endpoint still works.
        using var factory = Factory();
        var client = factory.CreateClient();

        var response = await client.GetAsync("/api/family/graph");

        response.StatusCode.Should().Be(HttpStatusCode.OK);
    }
}
```

Note: this project uses **global usings** for xUnit (`Fact`) and **AwesomeAssertions** (`.Should()`) — see other files in `tests/integration/FamilyTree.IntegrationTests/`. If `.Should()` or `[Fact]` don't resolve, add `using AwesomeAssertions;` / `using Xunit;` to match the sibling test files.

- [ ] **Step 2: Run the test to verify it fails**

Run: `dotnet test tests/integration/FamilyTree.IntegrationTests --filter ForwardedHeadersRateLimitTests`
Expected: FAIL — `RateLimit_WhenForwardedForDiffers_ShouldPartitionByClientIp` asserts the third request is `OK` but gets `429` (without forwarded headers, all requests share the `"unknown"` partition). The no-op test passes.

- [ ] **Step 3: Add the `using` to `Program.cs`**

In `src/backend/FamilyTree.Api/Program.cs`, add this near the other `using` directives at the top of the file:

```csharp
using Microsoft.AspNetCore.HttpOverrides;
```

- [ ] **Step 4: Insert the middleware before the exception handler**

In `src/backend/FamilyTree.Api/Program.cs`, immediately **before** the `app.UseExceptionHandler(handler =>` line (currently line ~120, after the startup warm-up + client-id warning block), insert:

```csharp
// Behind the Cloudflare → Cloud Run proxy chain, honor X-Forwarded-For/Proto so the
// rate limiter partitions by the real client IP (not the proxy) and Request.Scheme is
// https. KnownProxies/KnownNetworks are cleared because Cloud Run's front-end IPs are
// not a fixed set. Trade-off: a direct (Cloudflare-bypassing) caller could spoof its
// rate-limit IP — bounded, since the IP feeds only the limiter (never authz). Documented
// in docs/reference; the root fix (lock Cloud Run ingress) is a tracked follow-up.
var forwardedHeadersOptions = new ForwardedHeadersOptions
{
    ForwardedHeaders = ForwardedHeaders.XForwardedFor | ForwardedHeaders.XForwardedProto,
    ForwardLimit = 2   // Cloudflare + Cloud Run hops; validate against the deployed chain.
};
forwardedHeadersOptions.KnownNetworks.Clear();
forwardedHeadersOptions.KnownProxies.Clear();
app.UseForwardedHeaders(forwardedHeadersOptions);
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `dotnet test tests/integration/FamilyTree.IntegrationTests --filter ForwardedHeadersRateLimitTests`
Expected: PASS (2 tests).

- [ ] **Step 6: Run the full backend suite (no regressions)**

Run: `dotnet test`
Expected: PASS (all unit + integration tests; the middleware is dormant without the header so existing tests are unaffected).

- [ ] **Step 7: Commit**

```bash
git add src/backend/FamilyTree.Api/Program.cs tests/integration/FamilyTree.IntegrationTests/ForwardedHeadersRateLimitTests.cs
git commit -m "feat(api): honor X-Forwarded-For so rate limiting partitions by client IP behind the proxy"
```

---

### Task 2: `deploy.yml` — bake `VITE_GOOGLE_CLIENT_ID` into the SPA build

**Files:**
- Modify: `.github/workflows/deploy.yml` (the `deploy-spa` job's Build step `env`)

**Interfaces:**
- Consumes: a GitHub Actions repo variable `VITE_GOOGLE_CLIENT_ID` (set by the owner / the script in Task 3).
- Produces: a production SPA bundle whose sign-in control renders (the client ID is present at `vite build` time).

- [ ] **Step 1: Add the build env var**

In `.github/workflows/deploy.yml`, find the `deploy-spa` job's Build step:

```yaml
      - name: Build
        run: npm run build
        env:
          APP_COMMIT: ${{ github.sha }}
```

Change the `env:` block to:

```yaml
      - name: Build
        run: npm run build
        env:
          APP_COMMIT: ${{ github.sha }}
          # Public Google OAuth client ID, baked into the bundle at build time. When the
          # repo variable is unset the build still succeeds and the sign-in control is a
          # deliberate no-op, so this never breaks a pre-provision deploy.
          VITE_GOOGLE_CLIENT_ID: ${{ vars.VITE_GOOGLE_CLIENT_ID }}
```

- [ ] **Step 2: Validate the workflow YAML parses**

Run: `node -e "const y=require('js-yaml'); y.load(require('fs').readFileSync('.github/workflows/deploy.yml','utf8')); console.log('yaml ok')"`
Expected: `yaml ok` (if `js-yaml` is unavailable, instead verify by eye that indentation matches the surrounding steps — `env:` keys aligned under the step).

- [ ] **Step 3: Commit**

```bash
git add .github/workflows/deploy.yml
git commit -m "ci: pass VITE_GOOGLE_CLIENT_ID to the SPA build so prod sign-in renders"
```

---

### Task 3: `setup-gcp-deploy.ps1` — provision auth/Firestore/GCS + configure the service

Idempotent additions modeled on the existing MediatR-secret step (lines ~230-253) and Cloud Run step (lines ~180-190). Read those first to match helper usage (`Invoke-Exe`, `Test-Exe`, `Get-ExeValue`, `Set-GhVar`) exactly.

**Files:**
- Modify: `docs/ci-cd/setup-gcp-deploy.ps1` (new params; new provisioning steps inserted after the MediatR step and before the GitHub step; update the `Set-GhVar` block)

**Interfaces:**
- Consumes: existing script vars `$ProjectId`, `$Region`, `$CloudRunService`, `$pnum` (project number, computed in step 6), the runtime SA `${pnum}-compute@developer.gserviceaccount.com`, and helpers above.
- Produces: a Firestore (native) DB, a GCS seed bucket with the seed uploaded, editor secret(s), a fully-configured Cloud Run service, and the `VITE_GOOGLE_CLIENT_ID` GitHub variable.

- [ ] **Step 1: Add new params**

In the `param(...)` block of `docs/ci-cd/setup-gcp-deploy.ps1`, add under the `# --- Google Cloud ---` group (after `$MediatRLicenseKey`):

```powershell
    [string]$GoogleClientId         = '',   # public OAuth client ID; sign-in env + GitHub var are wired only if set
    [string[]]$EditorEmails         = @(),  # editor allow-list (PII → Secret Manager); one secret per entry
    [string]$SeedBucket             = '',   # GCS seed bucket; defaults to "<ProjectId>-family-seed" when empty
    [string]$SeedObject             = 'family.json',
```

- [ ] **Step 2: Insert the provisioning block after the MediatR step**

In `docs/ci-cd/setup-gcp-deploy.ps1`, immediately **after** the MediatR step's closing `}` (the `else { Write-Note 'No -MediatRLicenseKey…' }` block, ~line 253) and **before** `# --------------------------------------- 8. GitHub secrets/vars/env ----------`, insert:

```powershell
# ----------------------------- 7b. Firestore (durable edits) -----------------
Write-Step 'Firestore (native mode)'
Invoke-Exe gcloud @('services', 'enable', 'firestore.googleapis.com', '--project', $ProjectId)
if (Test-Exe gcloud @('firestore', 'databases', 'describe', '--database=(default)', '--project', $ProjectId)) {
    Write-Note 'Default Firestore database already exists.'
} else {
    Invoke-Exe gcloud @('firestore', 'databases', 'create', '--location', $Region, '--type', 'firestore-native', '--project', $ProjectId)
}
Invoke-Exe gcloud @('projects', 'add-iam-policy-binding', $ProjectId,
    '--member', "serviceAccount:${pnum}-compute@developer.gserviceaccount.com",
    '--role', 'roles/datastore.user', '--condition=None')

# ----------------------------- 7c. GCS seed bucket ---------------------------
Write-Step 'GCS seed bucket'
if (-not $SeedBucket) { $SeedBucket = "$ProjectId-family-seed" }
Invoke-Exe gcloud @('services', 'enable', 'storage.googleapis.com', '--project', $ProjectId)
if (Test-Exe gcloud @('storage', 'buckets', 'describe', "gs://$SeedBucket", '--project', $ProjectId)) {
    Write-Note "Bucket gs://$SeedBucket already exists."
} else {
    Invoke-Exe gcloud @('storage', 'buckets', 'create', "gs://$SeedBucket",
        '--project', $ProjectId, '--location', $Region, '--uniform-bucket-level-access')
}
Invoke-Exe gcloud @('storage', 'buckets', 'add-iam-policy-binding', "gs://$SeedBucket",
    '--member', "serviceAccount:${pnum}-compute@developer.gserviceaccount.com",
    '--role', 'roles/storage.objectViewer')
# Publish the committed seed so the first real deploy can read it (fail-fast on startup
# otherwise). Re-publish an edited seed later with scripts/upload-seed.mjs.
$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..' '..')).Path
$seedPath = Join-Path $repoRoot 'src/backend/FamilyTree.Api/Data/family.json'
Invoke-Exe gcloud @('storage', 'cp', $seedPath, "gs://$SeedBucket/$SeedObject", '--project', $ProjectId)

# ----------------------------- 7d. Editor allow-list (Secret Manager) --------
Write-Step 'Editor allow-list (Secret Manager)'
if ($EditorEmails.Count -gt 0) {
    Invoke-Exe gcloud @('services', 'enable', 'secretmanager.googleapis.com', '--project', $ProjectId)
    for ($i = 0; $i -lt $EditorEmails.Count; $i++) {
        $secretName = "family-editor-$i"
        $tmp = New-TemporaryFile
        try {
            [System.IO.File]::WriteAllText($tmp.FullName, $EditorEmails[$i])   # no trailing newline
            if (Test-Exe gcloud @('secrets', 'describe', $secretName, '--project', $ProjectId)) {
                Invoke-Exe gcloud @('secrets', 'versions', 'add', $secretName, '--data-file', $tmp.FullName, '--project', $ProjectId)
            } else {
                Invoke-Exe gcloud @('secrets', 'create', $secretName, '--data-file', $tmp.FullName, '--project', $ProjectId)
            }
        } finally {
            Remove-Item $tmp.FullName -Force
        }
        Invoke-Exe gcloud @('secrets', 'add-iam-policy-binding', $secretName, '--project', $ProjectId,
            '--role', 'roles/secretmanager.secretAccessor',
            '--member', "serviceAccount:${pnum}-compute@developer.gserviceaccount.com", '--condition=None')
    }
} else {
    Write-Note 'No -EditorEmails provided - editors unset (sign-in works, no one can edit).'
}

# ----------------------------- 7e. Cloud Run runtime config ------------------
Write-Step 'Cloud Run runtime config (env vars + secrets)'
$envList = "Firestore__ProjectId=$ProjectId,FamilyData__Source=gs://$SeedBucket/$SeedObject"
if ($GoogleClientId) { $envList += ",Authentication__Google__ClientId=$GoogleClientId" }
Invoke-Exe gcloud @('run', 'services', 'update', $CloudRunService, '--project', $ProjectId, '--region', $Region,
    '--update-env-vars', $envList)
if ($EditorEmails.Count -gt 0) {
    $secretPairs = (0..($EditorEmails.Count - 1) |
        ForEach-Object { "Authentication__Google__Editors__$($_)=family-editor-$($_):latest" }) -join ','
    Invoke-Exe gcloud @('run', 'services', 'update', $CloudRunService, '--project', $ProjectId, '--region', $Region,
        '--update-secrets', $secretPairs)
}
```

- [ ] **Step 3: Wire the GitHub variable**

In the `8/8  GitHub secrets, variables, environment` step (the `else` branch where `Set-GhVar` is already called for `CLOUDFLARE_PAGES_PROJECT`, ~line 278), add after the existing `Set-GhVar` lines:

```powershell
    if ($GoogleClientId) {
        Set-GhVar 'VITE_GOOGLE_CLIENT_ID' $GoogleClientId
    } else {
        Write-Note 'No -GoogleClientId provided - set the VITE_GOOGLE_CLIENT_ID GitHub variable before releasing.'
    }
```

- [ ] **Step 4: Update the run banner / summary**

In the banner `Write-Host @"…"@` near the top (the `Cloudflare ……` summary line area, ~line 142) and the final `Summary` block (~line 304), add one line each noting the new provisioning, e.g. in the summary's numbered notes add:

```
  - Auth/Firestore/GCS: Firestore (native) enabled, seed bucket gs://$SeedBucket created + seeded,
    editor secrets in Secret Manager, Cloud Run configured. Set VITE_GOOGLE_CLIENT_ID GitHub var = the client ID.
```

(Keep the existing here-string interpolation style; `$SeedBucket` is in scope.)

- [ ] **Step 5: Verify the script parses (PowerShell syntax check)**

Run: `pwsh -NoProfile -Command "[void][System.Management.Automation.Language.Parser]::ParseFile('docs/ci-cd/setup-gcp-deploy.ps1', [ref]$null, [ref]$null); 'parse ok'"`
Expected: `parse ok` (no parse errors). This does **not** execute the script (no GCP calls).

- [ ] **Step 6: Commit**

```bash
git add docs/ci-cd/setup-gcp-deploy.ps1
git commit -m "chore(deploy): provision Firestore + GCS seed + editor secret + service config in setup script"
```

---

### Task 4: Owner runbook + reference docs

**Files:**
- Modify: `docs/ci-cd/deploy.md` (the owner runbook for enabling auth/Firestore/GCS + the env-var/secret table)
- Modify: `docs/reference/features/backend-api.md` (forwarded-headers + per-IP-rate-limit-behind-proxy note)
- Modify: `docs/reference/ci-cd.md` and/or `docs/reference/tech-stack.md` (prod env vars + Secret-Manager editor list + the build variable)
- Modify: `docs/reference/roadmap.md` (deploy config landed; go-live is the owner's trigger)

**Interfaces:** none (docs only).

- [ ] **Step 1: deploy.md — runbook**

In `docs/ci-cd/deploy.md`, under the `## One-time owner setup` area (near the existing Google sign-in note added in #103), add a subsection documenting the end-to-end enablement order. Include:

- The new `setup-gcp-deploy.ps1` params: `-GoogleClientId <id>`, `-EditorEmails a@b.com,c@d.com`, `-SeedBucket <name>` (optional, defaults to `<ProjectId>-family-seed`).
- What the script provisions: Firestore (native) + `datastore.user`; the seed bucket + `storage.objectViewer` + the seed upload; editor secret(s) + `secretmanager.secretAccessor`; the Cloud Run env vars (`Authentication__Google__ClientId`, `Firestore__ProjectId`, `FamilyData__Source`) + the editor secret bindings; the `VITE_GOOGLE_CLIENT_ID` GitHub variable.
- The runtime-config table (verbatim values):

  | Setting | Where | Source |
  |---|---|---|
  | `Authentication__Google__ClientId` | Cloud Run env var | public client ID (= `VITE_GOOGLE_CLIENT_ID`) |
  | `Firestore__ProjectId` | Cloud Run env var | the GCP project id |
  | `FamilyData__Source` | Cloud Run env var | `gs://<bucket>/family.json` |
  | `Authentication__Google__Editors__0…` | Secret Manager → Cloud Run secret | one secret per editor |
  | `VITE_GOOGLE_CLIENT_ID` | GitHub Actions variable | public client ID (SPA build) |

- The go-live steps: cut the release (bump `VERSION`, push `vX.Y.Z`) — cross-reference the existing Releasing section.
- A verification checklist: `/health` on the Cloud Run URL; sign in on `https://family-tree-4fl.pages.dev`; an editor sees the badge; a biography `PUT` persists (Firestore).
- State plainly: **no OAuth client secret and no DB password are needed; editor emails live only in Secret Manager.** Cross-reference [`google-signin-setup.md`](../ci-cd/google-signin-setup.md) for the OAuth client.

- [ ] **Step 2: backend-api.md — forwarded headers note**

In `docs/reference/features/backend-api.md` (the security/rate-limiting area), add a short note: the API runs `UseForwardedHeaders` (trusts `X-Forwarded-For`/`-Proto`, `KnownProxies`/`KnownNetworks` cleared) so the **rate limiter partitions by the real client IP** behind the Cloudflare→Cloud Run proxy. Note the bounded trade-off (a direct caller could spoof its rate-limit IP; the IP feeds only the limiter, never authz) and that locking Cloud Run ingress to Cloudflare is a tracked follow-up.

- [ ] **Step 3: ci-cd.md / tech-stack.md — prod config**

Add the production env vars + the Secret-Manager editor list + the `VITE_GOOGLE_CLIENT_ID` build variable to whichever of `docs/reference/ci-cd.md` / `docs/reference/tech-stack.md` documents deploy config (grep for `MediatR__LicenseKey` / `API_ORIGIN` to find the right spot and match its format).

- [ ] **Step 4: roadmap.md — status**

In `docs/reference/roadmap.md`, move "deploy config / go-live enablement" toward done (config landed on `main`; the owner triggers go-live), and add the "lock Cloud Run ingress to Cloudflare" follow-up.

- [ ] **Step 5: Commit**

```bash
git add docs/
git commit -m "docs: owner runbook + reference for the auth/Firestore/GCS deploy enablement"
```

---

## Self-Review notes (for the executor)

- **Spec coverage:** Task 1 ↔ change 1 (UseForwardedHeaders + test). Task 2 ↔ change 2 (VITE_GOOGLE_CLIENT_ID at build). Task 3 ↔ changes 3+4 (runtime config + setup-script provisioning, Secret Manager for editors, no budget). Task 4 ↔ changes 5+6 (runbook + reference + the security note + the ingress-lock follow-up). The "stop at merged PR" boundary holds — no task runs provisioning or cuts a release.
- **`ForwardLimit = 2`** assumes the Cloudflare + Cloud Run hop count; it must be validated against the deployed chain (if prod logs show the proxy IP instead of the client IP, adjust). The integration test uses a single-entry `X-Forwarded-For`, which works for any `ForwardLimit >= 1`.
- **Idempotency:** re-running the script must not error on existing resources — every create is guarded by `Test-Exe … describe`. IAM `add-iam-policy-binding` is naturally idempotent.
- **Ordering:** the script creates the service (existing step 4) before the runtime-config step, and uploads the seed before the first real deploy reads `FamilyData__Source` — so a single run is safe.
- **No secrets/PII committed:** the script reads editor emails from a param into Secret Manager via a temp file (deleted in `finally`), mirroring the MediatR handling. No email or client secret is written to the repo.
