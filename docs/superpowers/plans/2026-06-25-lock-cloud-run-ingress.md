# Lock Cloud Run ingress to Cloudflare — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an application-level origin gate so only the Cloudflare proxy can reach the Cloud Run API: the proxy injects a high-entropy `X-Origin-Verify` header; the API requires it (403 otherwise) when a secret is configured, exempting `/health` and staying dormant in local dev / CI.

**Architecture:** A pure `OriginVerifier` (constant-time secret check, enabled only when a secret is configured) behind an `OriginVerificationMiddleware` placed after the security-headers middleware and before the rate limiter. The Cloudflare Pages `/api/*` proxy injects the matching header from an `ORIGIN_VERIFY_SECRET` env var. Secrets live in GCP Secret Manager (API) + a Cloudflare Pages env var (proxy); provisioning is added to `setup-gcp-deploy.ps1`.

**Tech Stack:** .NET 10 (ASP.NET Core, `System.Security.Cryptography`), Vue 3 + TypeScript Cloudflare Pages Functions, PowerShell provisioning, xUnit + AwesomeAssertions (backend), Vitest (frontend).

## Global Constraints

- **Branch off `main`; open a PR back into `main`; do NOT self-merge** (owner reviews + squash-merges). Already on branch `claude/lock-cloud-run-ingress`.
- **Agent/owner boundary:** the agent writes code/workflow/script/docs/tests only. The OWNER sets the secret in Secret Manager + Cloudflare and cuts the release. **Do not run `gcloud`/`wrangler` against the project.**
- **C# conventions:** file-scoped namespaces; `_camelCase` private fields; `Async` suffix + `CancellationToken` last; `is null`/`is not null`; brace every control statement; `ILogger<T>` via constructor (last param).
- **Structured logging only; never log PII or secrets** — the CodeQL "exposure of private information" gate fails the build otherwise. The origin secret and the `X-Origin-Verify` header value must NEVER appear in logs.
- **Graceful degradation:** the gate is enabled **iff** at least one non-blank secret is configured (mirrors blank `MediatR__LicenseKey`/`ClientId`/`Firestore` → feature off). Unconfigured ⇒ dormant ⇒ existing tests stay green.
- **Header name** is the fixed constant `X-Origin-Verify` on both sides (not secret, not config). Only the value is secret.
- **`/health` is always exempt** from the gate.
- **TDD, frequent commits.** Run the app locally with `node scripts/dev.mjs` (NOT the default ports 5173/5037 — another instance often owns them).
- **Docs land in this PR** (run the `update-docs-for-pr` skill at PR time).

## File Structure

**Backend (`src/backend/FamilyTree.Api/`):**
- Create `Security/OriginVerifyOptions.cs` — DI options consumed by the verifier (`IReadOnlyList<string> Secrets`).
- Create `Security/OriginVerifier.cs` — pure logic: `IsEnabled`, `IsTrusted(string?)`, constant-time.
- Create `Security/OriginVerificationMiddleware.cs` — conventional middleware + the `X-Origin-Verify` constant.
- Create `Configuration/OriginVerifySettings.cs` + `Configuration/SecuritySettings.cs` — `AppSettings` binding shape.
- Modify `Configuration/AppSettings.cs` — add `Security` property.
- Modify `Program.cs` — map `OriginVerifyOptions`, register `OriginVerifier`, insert the middleware.
- Modify `appsettings.json` — add a commented, empty `Security:OriginVerify:Secrets`.

**Backend tests:**
- Create `tests/unit/FamilyTree.UnitTests/Security/OriginVerifierTests.cs`.
- Create `tests/integration/FamilyTree.IntegrationTests/OriginVerificationTests.cs`.

**Frontend (`src/frontend/`):**
- Modify `src/api/apiProxy.ts` — `ORIGIN_VERIFY_HEADER` const, `applyOriginVerification`, add `x-origin-verify` to the strip list.
- Modify `src/api/apiProxy.spec.ts` — tests.
- Modify `functions/api/[[path]].ts` — `Env.ORIGIN_VERIFY_SECRET` + call injection.

**Provisioning / docs:**
- Modify `docs/ci-cd/setup-gcp-deploy.ps1` — `-OriginVerifySecret` param + idempotent secret + binding + print.
- Modify `docs/ci-cd/deploy.md`, `docs/reference/features/backend-api.md`, `docs/reference/ci-cd.md`, `docs/reference/roadmap.md`.

---

### Task 1: `OriginVerifier` + options (pure security logic)

**Files:**
- Create: `src/backend/FamilyTree.Api/Security/OriginVerifyOptions.cs`
- Create: `src/backend/FamilyTree.Api/Security/OriginVerifier.cs`
- Test: `tests/unit/FamilyTree.UnitTests/Security/OriginVerifierTests.cs`

**Interfaces:**
- Consumes: nothing (leaf).
- Produces:
  - `OriginVerifyOptions { IReadOnlyList<string> Secrets { get; set; } }` (namespace `FamilyTree.Api.Security`).
  - `OriginVerifier(IOptions<OriginVerifyOptions> options)` with `bool IsEnabled` and `bool IsTrusted(string? headerValue)`.

- [ ] **Step 1: Write the options class** (needed for the test to compile)

Create `src/backend/FamilyTree.Api/Security/OriginVerifyOptions.cs`:

```csharp
namespace FamilyTree.Api.Security;

public sealed class OriginVerifyOptions
{
    /// <summary>
    /// Accepted origin-verification secrets. Empty ⇒ the gate is dormant. Normally one entry;
    /// a second entry exists only transiently during a zero-downtime rotation.
    /// </summary>
    public IReadOnlyList<string> Secrets { get; set; } = [];
}
```

- [ ] **Step 2: Write the failing tests**

Create `tests/unit/FamilyTree.UnitTests/Security/OriginVerifierTests.cs`:

```csharp
using FamilyTree.Api.Security;
using Microsoft.Extensions.Options;

namespace FamilyTree.UnitTests.Security;

public sealed class OriginVerifierTests
{
    private static OriginVerifier Build(params string[] secrets) =>
        new(Options.Create(new OriginVerifyOptions { Secrets = secrets }));

    [Fact]
    public void IsEnabled_WhenNoSecretsConfigured_ShouldBeFalse()
    {
        Build().IsEnabled.Should().BeFalse();
    }

    [Fact]
    public void IsEnabled_WhenOnlyBlankSecretsConfigured_ShouldBeFalse()
    {
        Build("", "   ").IsEnabled.Should().BeFalse();
    }

    [Fact]
    public void IsEnabled_WhenSecretConfigured_ShouldBeTrue()
    {
        Build("s3cr3t").IsEnabled.Should().BeTrue();
    }

    [Fact]
    public void IsTrusted_WhenHeaderMatchesConfiguredSecret_ShouldBeTrue()
    {
        Build("s3cr3t").IsTrusted("s3cr3t").Should().BeTrue();
    }

    [Fact]
    public void IsTrusted_WhenHeaderMatchesAnyOfASet_ShouldBeTrue()
    {
        var verifier = Build("old-secret", "new-secret");
        verifier.IsTrusted("old-secret").Should().BeTrue();
        verifier.IsTrusted("new-secret").Should().BeTrue();
    }

    [Fact]
    public void IsTrusted_WhenHeaderWrong_ShouldBeFalse()
    {
        Build("s3cr3t").IsTrusted("nope").Should().BeFalse();
    }

    [Fact]
    public void IsTrusted_WhenHeaderEmpty_ShouldBeFalse()
    {
        Build("s3cr3t").IsTrusted("").Should().BeFalse();
    }

    [Fact]
    public void IsTrusted_WhenHeaderNull_ShouldBeFalse()
    {
        Build("s3cr3t").IsTrusted(null).Should().BeFalse();
    }
}
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `dotnet test tests/unit/FamilyTree.UnitTests/FamilyTree.UnitTests.csproj --filter "FullyQualifiedName~OriginVerifierTests"`
Expected: FAIL to compile / `OriginVerifier` not found.

- [ ] **Step 4: Implement `OriginVerifier`**

Create `src/backend/FamilyTree.Api/Security/OriginVerifier.cs`:

```csharp
using System.Security.Cryptography;
using System.Text;
using Microsoft.Extensions.Options;

namespace FamilyTree.Api.Security;

/// <summary>
/// Decides whether a request carries a valid origin-verification secret (the Cloudflare
/// proxy's shared header). Enabled only when at least one non-blank secret is configured,
/// so it is dormant in local dev / CI. Comparison is constant-time; the secret is never
/// logged or exposed.
/// </summary>
public sealed class OriginVerifier
{
    private readonly byte[][] _secrets;

    public OriginVerifier(IOptions<OriginVerifyOptions> options)
    {
        _secrets = options.Value.Secrets
            .Where(secret => !string.IsNullOrWhiteSpace(secret))
            .Select(Encoding.UTF8.GetBytes)
            .ToArray();
    }

    /// <summary>True when at least one non-blank secret is configured (production); false in dev/CI.</summary>
    public bool IsEnabled => _secrets.Length > 0;

    /// <summary>True iff the supplied header value matches any configured secret (constant-time).</summary>
    public bool IsTrusted(string? headerValue)
    {
        if (string.IsNullOrEmpty(headerValue))
        {
            return false;
        }

        var candidate = Encoding.UTF8.GetBytes(headerValue);
        var trusted = false;
        foreach (var secret in _secrets)
        {
            // Evaluate every secret (|= does not short-circuit) so neither the match position
            // nor whether one matched leaks via timing. FixedTimeEquals handles length mismatch.
            trusted |= CryptographicOperations.FixedTimeEquals(candidate, secret);
        }

        return trusted;
    }
}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `dotnet test tests/unit/FamilyTree.UnitTests/FamilyTree.UnitTests.csproj --filter "FullyQualifiedName~OriginVerifierTests"`
Expected: PASS (8 tests).

- [ ] **Step 6: Commit**

```bash
git add src/backend/FamilyTree.Api/Security/OriginVerifyOptions.cs \
        src/backend/FamilyTree.Api/Security/OriginVerifier.cs \
        tests/unit/FamilyTree.UnitTests/Security/OriginVerifierTests.cs
git commit -m "Add OriginVerifier: constant-time origin-secret check, dormant when unconfigured"
```

---

### Task 2: `OriginVerificationMiddleware` + config + pipeline wiring

**Files:**
- Create: `src/backend/FamilyTree.Api/Security/OriginVerificationMiddleware.cs`
- Create: `src/backend/FamilyTree.Api/Configuration/OriginVerifySettings.cs`
- Create: `src/backend/FamilyTree.Api/Configuration/SecuritySettings.cs`
- Modify: `src/backend/FamilyTree.Api/Configuration/AppSettings.cs`
- Modify: `src/backend/FamilyTree.Api/Program.cs`
- Modify: `src/backend/FamilyTree.Api/appsettings.json`
- Test: `tests/integration/FamilyTree.IntegrationTests/OriginVerificationTests.cs`

**Interfaces:**
- Consumes: `OriginVerifier`, `OriginVerifyOptions` (Task 1).
- Produces: `OriginVerificationMiddleware` with `public const string HeaderName = "X-Origin-Verify";`. `AppSettings.Security.OriginVerify.Secrets` (`IReadOnlyList<string>`).

- [ ] **Step 1: Write the failing integration tests**

Create `tests/integration/FamilyTree.IntegrationTests/OriginVerificationTests.cs`:

```csharp
using System.Net;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;

namespace FamilyTree.IntegrationTests;

public sealed class OriginVerificationTests : IClassFixture<FamilyApiFactory>
{
    private const string Secret = "test-origin-secret-abc123";
    private readonly FamilyApiFactory _factory;

    public OriginVerificationTests(FamilyApiFactory factory)
    {
        _factory = factory;
    }

    private WebApplicationFactory<Program> Gated() =>
        _factory.WithWebHostBuilder(builder =>
            builder.UseSetting("Security:OriginVerify:Secrets:0", Secret));

    [Fact]
    public async Task ApiRequest_WhenGateConfiguredAndHeaderMissing_ShouldReturn403()
    {
        using var factory = Gated();
        var client = factory.CreateClient();

        var response = await client.GetAsync("/api/family/graph");

        response.StatusCode.Should().Be(HttpStatusCode.Forbidden);
        // The gate runs after the security-headers middleware, so the 403 still carries them.
        response.Headers.GetValues("X-Content-Type-Options").Should().Equal("nosniff");
    }

    [Fact]
    public async Task ApiRequest_WhenGateConfiguredAndHeaderWrong_ShouldReturn403()
    {
        using var factory = Gated();
        var client = factory.CreateClient();
        client.DefaultRequestHeaders.Add("X-Origin-Verify", "wrong-secret");

        var response = await client.GetAsync("/api/family/graph");

        response.StatusCode.Should().Be(HttpStatusCode.Forbidden);
    }

    [Fact]
    public async Task ApiRequest_WhenGateConfiguredAndHeaderValid_ShouldReturn200()
    {
        using var factory = Gated();
        var client = factory.CreateClient();
        client.DefaultRequestHeaders.Add("X-Origin-Verify", Secret);

        var response = await client.GetAsync("/api/family/graph");

        response.StatusCode.Should().Be(HttpStatusCode.OK);
    }

    [Fact]
    public async Task Health_WhenGateConfiguredAndHeaderMissing_ShouldStayReachable()
    {
        using var factory = Gated();
        var client = factory.CreateClient();

        var response = await client.GetAsync("/health");

        response.StatusCode.Should().Be(HttpStatusCode.OK);
    }

    [Fact]
    public async Task ApiRequest_WhenGateUnconfigured_ShouldNotRequireHeader()
    {
        var client = _factory.CreateClient();   // default fixture: no secret ⇒ gate dormant

        var response = await client.GetAsync("/api/family/graph");

        response.StatusCode.Should().Be(HttpStatusCode.OK);
    }
}
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `dotnet test tests/integration/FamilyTree.IntegrationTests/FamilyTree.IntegrationTests.csproj --filter "FullyQualifiedName~OriginVerificationTests"`
Expected: FAIL — the gate doesn't exist, so the three "configured" tests get `200`/`OK` instead of `403` (the `Health` and `Unconfigured` tests pass already).

- [ ] **Step 3: Add the config classes**

Create `src/backend/FamilyTree.Api/Configuration/OriginVerifySettings.cs`:

```csharp
namespace FamilyTree.Api.Configuration;

public sealed class OriginVerifySettings
{
    public IReadOnlyList<string> Secrets { get; init; } = [];
}
```

Create `src/backend/FamilyTree.Api/Configuration/SecuritySettings.cs`:

```csharp
namespace FamilyTree.Api.Configuration;

public sealed class SecuritySettings
{
    public OriginVerifySettings OriginVerify { get; init; } = new();
}
```

Modify `src/backend/FamilyTree.Api/Configuration/AppSettings.cs` — add the property after `RequestLimits`:

```csharp
    public RequestLimitsSettings RequestLimits { get; init; } = new();

    public SecuritySettings Security { get; init; } = new();
```

- [ ] **Step 4: Implement the middleware**

Create `src/backend/FamilyTree.Api/Security/OriginVerificationMiddleware.cs`:

```csharp
namespace FamilyTree.Api.Security;

/// <summary>
/// Rejects requests that did not arrive through the Cloudflare proxy: when an origin secret
/// is configured, every request except <c>/health</c> must carry a valid X-Origin-Verify
/// header, else 403. Dormant (pass-through) when no secret is configured (local dev / CI).
/// Runs before the rate limiter, so all rate-limiter-reaching traffic has come through
/// Cloudflare — which makes trusting X-Forwarded-For for the rate-limit partition sound.
/// </summary>
public sealed class OriginVerificationMiddleware
{
    public const string HeaderName = "X-Origin-Verify";

    private readonly RequestDelegate _next;
    private readonly OriginVerifier _verifier;
    private readonly ILogger<OriginVerificationMiddleware> _logger;

    public OriginVerificationMiddleware(
        RequestDelegate next,
        OriginVerifier verifier,
        ILogger<OriginVerificationMiddleware> logger)
    {
        _next = next;
        _verifier = verifier;
        _logger = logger;
    }

    public async Task InvokeAsync(HttpContext context)
    {
        if (!_verifier.IsEnabled || IsHealthCheck(context.Request.Path))
        {
            await _next(context);
            return;
        }

        var header = context.Request.Headers[HeaderName].ToString();
        if (_verifier.IsTrusted(header))
        {
            await _next(context);
            return;
        }

        // Log only the non-identifying outcome — never the header value or a secret.
        _logger.LogWarning("Rejected an unverified request to {Path} (missing/invalid origin header).",
            context.Request.Path);
        context.Response.StatusCode = StatusCodes.Status403Forbidden;
        await context.Response.WriteAsJsonAsync(new { title = "Forbidden." });
    }

    private static bool IsHealthCheck(PathString path) =>
        path.Equals("/health", StringComparison.OrdinalIgnoreCase);
}
```

- [ ] **Step 5: Wire it into `Program.cs`**

Add the using near the other `FamilyTree.Api.*` usings at the top:

```csharp
using FamilyTree.Api.Security;
```

After the `builder.Services.Configure<SessionAuthOptions>(...)` block, add the options mapping + verifier registration:

```csharp
builder.Services.Configure<OriginVerifyOptions>(options =>
{
    options.Secrets = appSettings.Security.OriginVerify.Secrets;
});
builder.Services.AddSingleton<OriginVerifier>();
```

Insert the middleware immediately **before** `app.UseRateLimiter();` (which sits after the security-headers `app.Use(...)` block):

```csharp
// Reject requests that bypassed the Cloudflare proxy before they can reach the rate limiter.
// Dormant unless an origin secret is configured; /health is exempted inside the middleware.
app.UseMiddleware<OriginVerificationMiddleware>();

app.UseRateLimiter();
```

- [ ] **Step 6: Add the commented config key to `appsettings.json`**

In `src/backend/FamilyTree.Api/appsettings.json`, add a top-level `Security` section after the `Firestore` block:

```json
  "Security": {
    "OriginVerify": {
      "_comment": "Shared-secret origin gate. Empty for local dev/CI (the gate is dormant). In deployment, bind Secret-Manager secrets to Security__OriginVerify__Secrets__0 (origin-verify-0), __1, …; the Cloudflare Pages proxy injects the matching X-Origin-Verify header. /health is always exempt.",
      "Secrets": []
    }
  }
```

(Place it as the last top-level section; ensure the preceding `Firestore` block's closing brace gets a trailing comma.)

- [ ] **Step 7: Run the tests to verify they pass**

Run: `dotnet test tests/integration/FamilyTree.IntegrationTests/FamilyTree.IntegrationTests.csproj --filter "FullyQualifiedName~OriginVerificationTests"`
Expected: PASS (5 tests).

- [ ] **Step 8: Run the full backend suite (no regressions)**

Run: `dotnet test`
Expected: PASS — all existing unit + integration tests stay green (they send no header; the gate is dormant by default).

- [ ] **Step 9: Commit**

```bash
git add src/backend/FamilyTree.Api/Security/OriginVerificationMiddleware.cs \
        src/backend/FamilyTree.Api/Configuration/OriginVerifySettings.cs \
        src/backend/FamilyTree.Api/Configuration/SecuritySettings.cs \
        src/backend/FamilyTree.Api/Configuration/AppSettings.cs \
        src/backend/FamilyTree.Api/Program.cs \
        src/backend/FamilyTree.Api/appsettings.json \
        tests/integration/FamilyTree.IntegrationTests/OriginVerificationTests.cs
git commit -m "Gate Cloud Run ingress on a shared-secret X-Origin-Verify header (403; /health exempt; dormant unconfigured)"
```

---

### Task 3: Cloudflare proxy injects the header

**Files:**
- Modify: `src/frontend/src/api/apiProxy.ts`
- Modify: `src/frontend/src/api/apiProxy.spec.ts`
- Modify: `src/frontend/functions/api/[[path]].ts`

**Interfaces:**
- Consumes: nothing (the API in Task 2 expects header `X-Origin-Verify`).
- Produces: `ORIGIN_VERIFY_HEADER` constant + `applyOriginVerification(headers: Headers, secret: string | undefined): void` exported from `apiProxy.ts`.

- [ ] **Step 1: Write the failing tests**

In `src/frontend/src/api/apiProxy.spec.ts`, update the import and append a `describe` block:

```ts
import { buildApiTargetUrl, stripUnsafeUpstreamHeaders, applyOriginVerification } from './apiProxy';
```

```ts
describe('applyOriginVerification', () => {
  it('injects the X-Origin-Verify header when a secret is configured', () => {
    const headers = new Headers();
    applyOriginVerification(headers, 'top-secret');
    expect(headers.get('x-origin-verify')).toBe('top-secret');
  });

  it('overwrites any client-supplied X-Origin-Verify value', () => {
    const headers = new Headers({ 'x-origin-verify': 'forged-by-client' });
    applyOriginVerification(headers, 'top-secret');
    expect(headers.get('x-origin-verify')).toBe('top-secret');
  });

  it('is a no-op when the secret is undefined or empty', () => {
    const undef = new Headers();
    applyOriginVerification(undef, undefined);
    expect(undef.get('x-origin-verify')).toBeNull();

    const empty = new Headers();
    applyOriginVerification(empty, '');
    expect(empty.get('x-origin-verify')).toBeNull();
  });

  it('stripUnsafeUpstreamHeaders removes a client-supplied X-Origin-Verify', () => {
    const headers = new Headers({ 'x-origin-verify': 'forged-by-client' });
    stripUnsafeUpstreamHeaders(headers);
    expect(headers.get('x-origin-verify')).toBeNull();
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run (from `src/frontend`): `npx vitest run src/api/apiProxy.spec.ts`
Expected: FAIL — `applyOriginVerification` is not exported; the strip test fails (header not yet stripped).

- [ ] **Step 3: Implement in `apiProxy.ts`**

Add `'x-origin-verify'` to the `UNSAFE_UPSTREAM_HEADERS` array (with the forwarding-headers group):

```ts
  'x-forwarded-for',
  'x-forwarded-host',
  'x-forwarded-proto',
  'forwarded',
  // The proxy injects its own X-Origin-Verify below; never relay a client-supplied one.
  'x-origin-verify',
];
```

Append the constant + helper at the end of `apiProxy.ts`:

```ts
export const ORIGIN_VERIFY_HEADER = 'X-Origin-Verify';

/**
 * Injects the shared origin-verification secret so the API can confirm the request came
 * through this proxy (not a direct, Cloudflare-bypassing caller). `set()` overwrites any
 * client-supplied value. No-op when the secret is unset (local dev / unconfigured preview).
 */
export function applyOriginVerification(headers: Headers, secret: string | undefined): void {
  if (secret && secret.length > 0) {
    headers.set(ORIGIN_VERIFY_HEADER, secret);
  }
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run (from `src/frontend`): `npx vitest run src/api/apiProxy.spec.ts`
Expected: PASS.

- [ ] **Step 5: Wire it into the Pages Function**

In `src/frontend/functions/api/[[path]].ts`:

Update the import:

```ts
import { buildApiTargetUrl, stripUnsafeUpstreamHeaders, applyOriginVerification } from '../../src/api/apiProxy';
```

Add the env binding:

```ts
interface Env {
  API_ORIGIN: string;
  ORIGIN_VERIFY_SECRET?: string;
}
```

After the `stripUnsafeUpstreamHeaders(upstream.headers);` line, inject the header:

```ts
  const upstream = new Request(target, request);
  stripUnsafeUpstreamHeaders(upstream.headers);
  applyOriginVerification(upstream.headers, env.ORIGIN_VERIFY_SECRET);
```

- [ ] **Step 6: Type-check the build**

Run (from `src/frontend`): `npm run build`
Expected: PASS (vue-tsc type-check clean; no unused-import or type errors).

- [ ] **Step 7: Commit**

```bash
git add src/frontend/src/api/apiProxy.ts \
        src/frontend/src/api/apiProxy.spec.ts \
        "src/frontend/functions/api/[[path]].ts"
git commit -m "Inject X-Origin-Verify in the Pages /api proxy; strip any client-supplied value"
```

---

### Task 4: Provisioning — `setup-gcp-deploy.ps1` origin secret

**Files:**
- Modify: `docs/ci-cd/setup-gcp-deploy.ps1`

**Interfaces:**
- Consumes: existing script context — `$ProjectId`, `$Region`, `$CloudRunService`, `$pnum` (project number, set in step 6), the `Test-Exe`/`Invoke-Exe`/`Write-Step`/`Write-Note` helpers.
- Produces: a Secret-Manager secret `origin-verify-0` bound to `Security__OriginVerify__Secrets__0` on the Cloud Run service, plus a printed "ACTION REQUIRED" line for Cloudflare.

> Not unit-tested (infra). Validated by review; idempotent guards are the safety net. Do **not** run it.

- [ ] **Step 1: Add the parameter**

In the `param(...)` block, after `[string]$MediatRLicenseKey = '',`:

```powershell
    [string]$OriginVerifySecret     = '',   # shared-secret origin gate; auto-generated if empty & not yet created
```

- [ ] **Step 2: Add it to the startup summary**

In the `Write-Host @"..."` banner, after the `MediatR secret ....` line:

```
  Origin verify ..... $(if ($OriginVerifySecret) { 'provided' } else { 'generate/keep' })
```

- [ ] **Step 3: Add the provisioning step**

Insert a new step after `7d. Editor allow-list (Secret Manager)` and before `7e. Cloud Run runtime config`:

```powershell
# ----------------------------- 7d2. Origin verification secret ---------------
Write-Step 'Origin verification secret (Secret Manager)'
Invoke-Exe gcloud @('services', 'enable', 'secretmanager.googleapis.com', '--project', $ProjectId)
$originSecretName = 'origin-verify-0'
$originSecretExists = Test-Exe gcloud @('secrets', 'describe', $originSecretName, '--project', $ProjectId)
$generatedOrigin = ''
if ($OriginVerifySecret) {
    # Owner-supplied value: create or add a new version.
    $value = $OriginVerifySecret
} elseif ($originSecretExists) {
    # Idempotent re-run: keep the existing secret (do NOT regenerate — that would break Cloudflare).
    Write-Note "Secret '$originSecretName' already exists - keeping it (pass -OriginVerifySecret to rotate)."
    $value = ''
} else {
    # First run, no value supplied: generate a high-entropy machine secret.
    $bytes = [System.Security.Cryptography.RandomNumberGenerator]::GetBytes(32)
    $generatedOrigin = [Convert]::ToBase64String($bytes).TrimEnd('=').Replace('+', '-').Replace('/', '_')
    $value = $generatedOrigin
}
if ($value) {
    $tmp = New-TemporaryFile
    try {
        [System.IO.File]::WriteAllText($tmp.FullName, $value)   # no trailing newline
        if ($originSecretExists) {
            Invoke-Exe gcloud @('secrets', 'versions', 'add', $originSecretName, '--data-file', $tmp.FullName, '--project', $ProjectId)
        } else {
            Invoke-Exe gcloud @('secrets', 'create', $originSecretName, '--data-file', $tmp.FullName, '--project', $ProjectId)
        }
    } finally {
        Remove-Item $tmp.FullName -Force
    }
}
Invoke-Exe gcloud @('secrets', 'add-iam-policy-binding', $originSecretName, '--project', $ProjectId,
    '--role', 'roles/secretmanager.secretAccessor',
    '--member', "serviceAccount:${pnum}-compute@developer.gserviceaccount.com", '--condition=None')
Invoke-Exe gcloud @('run', 'services', 'update', $CloudRunService, '--project', $ProjectId, '--region', $Region,
    '--update-secrets', "Security__OriginVerify__Secrets__0=${originSecretName}:latest")
```

- [ ] **Step 4: Print the value for the owner to paste into Cloudflare**

In the `Write-Host '  ACTION REQUIRED in the Cloudflare dashboard ...'` block, add (after the `API_ORIGIN` line):

```powershell
if ($generatedOrigin) {
    Write-Host "    - environment variable  ORIGIN_VERIFY_SECRET = $generatedOrigin   (Production) — shown once; paste it now" -ForegroundColor Magenta
} elseif ($OriginVerifySecret) {
    Write-Host "    - environment variable  ORIGIN_VERIFY_SECRET = <the value you passed>   (Production)" -ForegroundColor Magenta
} else {
    Write-Host "    - environment variable  ORIGIN_VERIFY_SECRET = <existing origin-verify-0 value>   (Production, if not already set)" -ForegroundColor Magenta
}
```

- [ ] **Step 5: Add it to the final summary's manual-steps list**

In the closing `Write-Host @"..."` summary, under "Remaining manual steps", extend the Cloudflare bullet to mention `ORIGIN_VERIFY_SECRET` alongside `API_ORIGIN`:

```
  1. Cloudflare Pages: production branch = $PagesProductionBranch (must equal deploy.yml --branch),
     env var API_ORIGIN = $cloudRunUrl AND env var ORIGIN_VERIFY_SECRET (the origin-verify-0 value),
     then redeploy the SPA.
```

- [ ] **Step 6: Lint-check the script parses**

Run: `pwsh -NoProfile -Command "$null = [System.Management.Automation.Language.Parser]::ParseFile('docs/ci-cd/setup-gcp-deploy.ps1', [ref]$null, [ref]$e); if ($e) { $e; exit 1 } else { 'parse OK' }"`
Expected: `parse OK` (no parser errors). If `pwsh` is unavailable, skip and rely on review.

- [ ] **Step 7: Commit**

```bash
git add docs/ci-cd/setup-gcp-deploy.ps1
git commit -m "Provision the origin-verify secret + Cloud Run binding in setup-gcp-deploy.ps1 (idempotent, generates if absent)"
```

---

### Task 5: Documentation

**Files:**
- Modify: `docs/ci-cd/deploy.md`
- Modify: `docs/reference/features/backend-api.md`
- Modify: `docs/reference/ci-cd.md`
- Modify: `docs/reference/roadmap.md`

**Interfaces:** none (prose). Ground every statement in the code from Tasks 1–4.

- [ ] **Step 1: `docs/ci-cd/deploy.md` — add an "Origin verification (Cloudflare-only ingress)" subsection**

Add a subsection (near the auth/Firestore enablement section) covering, in prose:
- What it does: the Pages proxy injects `X-Origin-Verify`; the API requires it in production and returns **403** otherwise; this closes the `X-Forwarded-For` spoofing vector so the rate limiter's real-IP trust is sound.
- Where the secret lives: `origin-verify-0` in GCP Secret Manager (bound to `Security__OriginVerify__Secrets__0` on Cloud Run) **and** the Cloudflare Pages `ORIGIN_VERIFY_SECRET` env var (Production).
- How to set it: `setup-gcp-deploy.ps1` generates one if `-OriginVerifySecret` is not supplied and prints it once; paste that value into Cloudflare Pages → `ORIGIN_VERIFY_SECRET` (Production) and redeploy the SPA.
- That **`/health` stays reachable directly** on the Cloud Run URL (it is gate-exempt), so the post-deploy health check is unaffected.
- That the gate is **dormant until configured** (no secret ⇒ no enforcement), so landing the code changes nothing until both sides are set.
- **Rotation (zero-downtime):** (1) add `origin-verify-1` (new value), bind `Security__OriginVerify__Secrets__1`, deploy a revision — the API now accepts both; (2) set Cloudflare `ORIGIN_VERIFY_SECRET` to the new value, redeploy the SPA; (3) remove the `origin-verify-0` binding, deploy. No 403 window.

- [ ] **Step 2: `docs/reference/features/backend-api.md` — document the gate + update the XFF note**

- In the security/non-functional section, add a bullet: **Origin verification gate** — when `Security:OriginVerify:Secrets` is configured (production), every request except `/health` must carry a valid `X-Origin-Verify` header (injected by the Cloudflare proxy), else **403**; dormant when unconfigured (local dev / CI). It runs before the rate limiter, so all rate-limiter-reaching traffic has come through Cloudflare.
- Update the existing rate-limiting bullet's spoofing caveat: change "a caller that bypasses Cloudflare … could spoof its rate-limit IP" to note this is **closed when the origin gate is enabled** (off-Cloudflare callers are 403'd before the limiter); link the gate bullet.
- Add **403** to the error-shapes list: `{ "title": "Forbidden." }` (origin gate; also the standard authz 403 has no body).

- [ ] **Step 3: `docs/reference/ci-cd.md` — config tables + proxy description**

- In the "Production config" Cloud Run table, add a row: `Security__OriginVerify__Secrets__0` | Secret Manager secret → Cloud Run secret binding | `origin-verify-0` — the shared origin-gate secret.
- In the GitHub/Cloudflare table, add a row: `ORIGIN_VERIFY_SECRET` | Cloudflare Pages **environment variable** (Production) | the value the `/api` proxy injects as `X-Origin-Verify`.
- In the `/api/*` proxy description (the `stripUnsafeUpstreamHeaders` paragraph), note that the proxy also **injects `X-Origin-Verify`** from `ORIGIN_VERIFY_SECRET` (and strips any client-supplied one).

- [ ] **Step 4: `docs/reference/roadmap.md` — move the follow-up to done**

In "Other unbuilt items", replace the "**Lock Cloud Run ingress to Cloudflare IPs**" bullet with an Implemented note: the ingress lock shipped as an **application-level shared-secret header** (`X-Origin-Verify`) injected by the Pages proxy and required by the API (403 otherwise; `/health` exempt; dormant until the owner configures the secret) — see [features/backend-api.md]. Note that network-level isolation (LB + Cloud Armor / Authenticated Origin Pulls) remains a deferred further follow-up. (Also reflect it in the Authentication & editing table if appropriate.)

- [ ] **Step 5: Verify doc links resolve**

Run: `dotnet test` and `npx vitest run` once more from the repo root / `src/frontend` to confirm nothing regressed, and eyeball that every new Markdown link target exists.

- [ ] **Step 6: Commit**

```bash
git add docs/ci-cd/deploy.md docs/reference/features/backend-api.md docs/reference/ci-cd.md docs/reference/roadmap.md
git commit -m "Docs: document the X-Origin-Verify origin gate, rotation runbook, and config; mark the ingress-lock follow-up done"
```

---

## Final verification (before opening the PR)

- [ ] `dotnet test` — all backend unit + integration green.
- [ ] From `src/frontend`: `npx vitest run` (full suite) and `npm run build` — green + type-checked.
- [ ] Optional manual smoke (custom ports): `node scripts/dev.mjs` — the app runs with the gate dormant (no secret), the proxy injects nothing locally; confirm `/api/family/graph` still serves.
- [ ] Run the `update-docs-for-pr` skill, then open the PR into `main` (do not self-merge).

## Self-review notes (author)

- **Spec coverage:** backend gate (Tasks 1–2), `/health` exemption + enable-on-configured + 403 + constant-time + no-secret-logging (Tasks 1–2 + tests), proxy injection + client-value strip (Task 3), provisioning + generation + rotation print (Task 4), all four doc targets + XFF-caveat update + roadmap (Task 5). Owner/agent boundary honored (no `gcloud`/`wrangler` runs).
- **Type consistency:** `OriginVerifyOptions.Secrets` / `AppSettings.Security.OriginVerify.Secrets` (both `IReadOnlyList<string>`); `OriginVerificationMiddleware.HeaderName == "X-Origin-Verify" == ORIGIN_VERIFY_HEADER`; config key `Security:OriginVerify:Secrets:<n>` ↔ env `Security__OriginVerify__Secrets__<n>` ↔ secret `origin-verify-<n>`.
