# AppSettings Config Refactor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the three ad-hoc ways the API reads its own configuration with a single strongly-typed `AppSettings` binding root, mapped to `IOptions<>` only where a DI-resolved class consumes it — with **no change in runtime behavior**.

**Architecture:** A single `AppSettings` class in `FamilyTree.Api` mirrors the app's config sections (`FamilyData`, `MediatR`, `RateLimiting`); framework sections (`Logging`, `AllowedHosts`) are left to the host. `Program.cs` binds it once (with fail-fast validation), reads root-only settings (`RateLimiting`, `MediatR.LicenseKey`) directly off it, and maps `FamilyData` into the existing `IOptions<FamilyDataOptions>` consumed by `JsonFamilyDataLoader`. `AddInfrastructure` stops taking raw `IConfiguration`.

**Tech Stack:** .NET 10, ASP.NET Core options pattern (`AddOptions`/`Bind`/`ValidateOnStart`), xUnit + AwesomeAssertions.

**This is PR 1 of 2.** It is a pure, behavior-preserving refactor that de-risks the follow-up auth work (PR 2). It introduces **no new config sections** (`Authentication`, `Firestore`, `Session` arrive in PR 2). Per the repo's docs policy, a no-behavior-change diff is doc-exempt — **no doc update needed** for this PR.

**Scope note for the worker:** the safety net for "behavior unchanged" is the **existing** test suite (`tests/integration` boots the real `Program` and exercises the family endpoints, security headers, and rate limiting). Keep it green at every step. The one new test added here only covers the new `AppSettings` binding itself.

---

## Files

- **Create:** `src/backend/FamilyTree.Api/Configuration/AppSettings.cs` — the single config-binding root + its nested section classes (`FamilyDataSettings`, `MediatRSettings`, `RateLimitingSettings`). Lives in `FamilyTree.Api` (the composition root); nothing outside `Program.cs` depends on it.
- **Create:** `tests/integration/FamilyTree.IntegrationTests/AppSettingsBindingTests.cs` — binds sample configuration to `AppSettings` and asserts values + defaults. (Goes in the integration project because that project references `FamilyTree.Api`; the unit project does not.)
- **Modify:** `src/backend/FamilyTree.Api/Program.cs` — bind `AppSettings` once with validation; read `RateLimiting` + `MediatR.LicenseKey` off it; pass the mapped `FamilyData` into `AddInfrastructure`.
- **Modify:** `src/backend/FamilyTree.Infrastructure/InfrastructureServiceCollectionExtensions.cs` — change `AddInfrastructure(IServiceCollection, IConfiguration)` to `AddInfrastructure(IServiceCollection, FamilyDataOptions)`; drop the `IConfiguration`/`GetSection` dependency.

**Unchanged on purpose:** `FamilyDataOptions` (it stays the consumer `Options` type in Infrastructure), `JsonFamilyDataLoader` (still injects `IOptions<FamilyDataOptions>`), `AddApplication` (already takes a `string?` license key), and `appsettings.json` (same sections/keys).

---

## Task 1: Create the `AppSettings` binding root

**Files:**
- Create: `src/backend/FamilyTree.Api/Configuration/AppSettings.cs`
- Test: `tests/integration/FamilyTree.IntegrationTests/AppSettingsBindingTests.cs`

Defaults on every nested property are chosen to **exactly reproduce today's behavior** when a section or key is absent:
- `FamilyData.FilePath` → `"Data/family.json"` (matches `FamilyDataOptions`' current default).
- `RateLimiting.PermitLimit` → `100`, `WindowSeconds` → `60` (matches today's `GetValue(..., 100)` / `GetValue(..., 60)` fallbacks; note `appsettings.json` has **no** `RateLimiting` section today, so these defaults must hold).
- `MediatR.LicenseKey` → `""` (today the missing-key path passes `null`; `AddApplication` treats null/empty/whitespace identically, so `""` is equivalent).

- [ ] **Step 1: Write the failing test**

Create `tests/integration/FamilyTree.IntegrationTests/AppSettingsBindingTests.cs`:

```csharp
using FamilyTree.Api.Configuration;
using Microsoft.Extensions.Configuration;

namespace FamilyTree.IntegrationTests;

public sealed class AppSettingsBindingTests
{
    [Fact]
    public void Bind_WhenAllSectionsPresent_ShouldPopulateEveryNestedValue()
    {
        var configuration = new ConfigurationBuilder()
            .AddInMemoryCollection(new Dictionary<string, string?>
            {
                ["FamilyData:FilePath"] = "Data/custom.json",
                ["MediatR:LicenseKey"] = "abc-123",
                ["RateLimiting:PermitLimit"] = "250",
                ["RateLimiting:WindowSeconds"] = "30"
            })
            .Build();

        var settings = configuration.Get<AppSettings>();

        settings.Should().NotBeNull();
        settings!.FamilyData.FilePath.Should().Be("Data/custom.json");
        settings.MediatR.LicenseKey.Should().Be("abc-123");
        settings.RateLimiting.PermitLimit.Should().Be(250);
        settings.RateLimiting.WindowSeconds.Should().Be(30);
    }

    [Fact]
    public void Bind_WhenSectionsMissing_ShouldFallBackToBehaviorPreservingDefaults()
    {
        var configuration = new ConfigurationBuilder()
            .AddInMemoryCollection(new Dictionary<string, string?>())
            .Build();

        var settings = configuration.Get<AppSettings>() ?? new AppSettings();

        settings.FamilyData.FilePath.Should().Be("Data/family.json");
        settings.MediatR.LicenseKey.Should().Be("");
        settings.RateLimiting.PermitLimit.Should().Be(100);
        settings.RateLimiting.WindowSeconds.Should().Be(60);
    }
}
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `dotnet test tests/integration/FamilyTree.IntegrationTests --filter FullyQualifiedName~AppSettingsBindingTests`
Expected: **build failure / FAIL** — `AppSettings` (and `FamilyTree.Api.Configuration`) does not exist yet.

- [ ] **Step 3: Create the `AppSettings` class**

Create `src/backend/FamilyTree.Api/Configuration/AppSettings.cs`:

```csharp
namespace FamilyTree.Api.Configuration;

/// <summary>
/// Strongly-typed root for the application's own configuration sections, mirroring
/// the shape of appsettings.json. Framework sections (Logging, AllowedHosts) are
/// intentionally excluded — they stay with the host. Bound once in Program.cs;
/// nothing outside the composition root depends on this type.
/// </summary>
public sealed class AppSettings
{
    public FamilyDataSettings FamilyData { get; init; } = new();

    public MediatRSettings MediatR { get; init; } = new();

    public RateLimitingSettings RateLimiting { get; init; } = new();
}

public sealed class FamilyDataSettings
{
    public string FilePath { get; init; } = "Data/family.json";
}

public sealed class MediatRSettings
{
    public string LicenseKey { get; init; } = "";
}

public sealed class RateLimitingSettings
{
    public int PermitLimit { get; init; } = 100;

    public int WindowSeconds { get; init; } = 60;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `dotnet test tests/integration/FamilyTree.IntegrationTests --filter FullyQualifiedName~AppSettingsBindingTests`
Expected: **PASS** (both tests).

- [ ] **Step 5: Commit**

```bash
git add src/backend/FamilyTree.Api/Configuration/AppSettings.cs tests/integration/FamilyTree.IntegrationTests/AppSettingsBindingTests.cs
git commit -m "Add AppSettings config-binding root with behavior-preserving defaults"
```

---

## Task 2: Bind `AppSettings` in `Program.cs` and read `RateLimiting` off it

This wires the new binding into startup and replaces the two `RateLimiting` `GetValue` reads. `MediatR` and `FamilyData` are migrated in Task 3 so each task stays a small, independently-green change. The behavior safety net is the existing integration suite.

**Files:**
- Modify: `src/backend/FamilyTree.Api/Program.cs`

- [ ] **Step 1: Add the `AppSettings` using and bind it once**

In `src/backend/FamilyTree.Api/Program.cs`, add to the `using` block at the top (after the existing `using FamilyTree.Application;` / `using FamilyTree.Infrastructure;` lines):

```csharp
using FamilyTree.Api.Configuration;
```

Then, immediately after this line:

```csharp
var builder = WebApplication.CreateBuilder(args);
```

insert:

```csharp
// Single strongly-typed view of our own configuration (mirrors appsettings.json,
// minus framework sections). Bound once here; root-only settings are read straight
// off `appSettings`, and DI-consumed sections are mapped to their own Options below.
var appSettings = builder.Configuration.Get<AppSettings>() ?? new AppSettings();
builder.Services.AddOptions<AppSettings>()
    .Bind(builder.Configuration)
    .ValidateDataAnnotations()
    .ValidateOnStart();
```

- [ ] **Step 2: Replace the `RateLimiting` reads**

In `src/backend/FamilyTree.Api/Program.cs`, delete these two lines:

```csharp
var rateLimitPermit = builder.Configuration.GetValue("RateLimiting:PermitLimit", 100);
var rateLimitWindowSeconds = builder.Configuration.GetValue("RateLimiting:WindowSeconds", 60);
```

Then update the limiter options to read from `appSettings` — change the `FixedWindowRateLimiterOptions` body from:

```csharp
            factory: _ => new FixedWindowRateLimiterOptions
            {
                PermitLimit = rateLimitPermit,
                Window = TimeSpan.FromSeconds(rateLimitWindowSeconds),
                QueueLimit = 0
            }));
```

to:

```csharp
            factory: _ => new FixedWindowRateLimiterOptions
            {
                PermitLimit = appSettings.RateLimiting.PermitLimit,
                Window = TimeSpan.FromSeconds(appSettings.RateLimiting.WindowSeconds),
                QueueLimit = 0
            }));
```

- [ ] **Step 3: Build to verify it compiles**

Run: `dotnet build src/backend/FamilyTree.Api`
Expected: **build succeeds**, no warnings about unused `rateLimitPermit`/`rateLimitWindowSeconds` (they were removed).

- [ ] **Step 4: Run the integration suite to confirm behavior is unchanged**

Run: `dotnet test tests/integration/FamilyTree.IntegrationTests`
Expected: **PASS** — health, graph endpoints, security headers, and rate limiting still behave identically (the rate-limit value now comes from `appSettings` but resolves to the same defaults).

- [ ] **Step 5: Commit**

```bash
git add src/backend/FamilyTree.Api/Program.cs
git commit -m "Bind AppSettings at startup and source rate-limiting from it"
```

---

## Task 3: Map `FamilyData` → `IOptions<FamilyDataOptions>` and read `MediatR.LicenseKey` off `AppSettings`

This finishes the migration: `AddInfrastructure` stops taking raw `IConfiguration` and instead receives the mapped `FamilyDataOptions`; the MediatR license key comes from `appSettings`.

**Files:**
- Modify: `src/backend/FamilyTree.Infrastructure/InfrastructureServiceCollectionExtensions.cs`
- Modify: `src/backend/FamilyTree.Api/Program.cs`

- [ ] **Step 1: Change the `AddInfrastructure` signature**

Replace the entire contents of `src/backend/FamilyTree.Infrastructure/InfrastructureServiceCollectionExtensions.cs` with:

```csharp
using Microsoft.Extensions.DependencyInjection;

namespace FamilyTree.Infrastructure;

public static class InfrastructureServiceCollectionExtensions
{
    public static IServiceCollection AddInfrastructure(this IServiceCollection services, FamilyDataOptions familyData)
    {
        services.Configure<FamilyDataOptions>(options => options.FilePath = familyData.FilePath);
        services.AddSingleton<IFamilyDataLoader, JsonFamilyDataLoader>();
        services.AddSingleton<FamilyStore>();
        services.AddScoped<IPersonRepository, InMemoryPersonRepository>();
        services.AddScoped<IUnionRepository, InMemoryUnionRepository>();
        return services;
    }
}
```

(Note: the `using Microsoft.Extensions.Configuration;` import is intentionally gone — Infrastructure no longer depends on `IConfiguration`.)

- [ ] **Step 2: Update the two call sites in `Program.cs`**

In `src/backend/FamilyTree.Api/Program.cs`, replace these lines:

```csharp
// MediatR licence key comes from configuration (MediatR:LicenseKey) — set it
// via user-secrets locally or the MediatR__LicenseKey env var in deployment;
// it is never committed.
builder.Services.AddApplication(builder.Configuration["MediatR:LicenseKey"]);
builder.Services.AddInfrastructure(builder.Configuration);
```

with:

```csharp
// MediatR licence key comes from AppSettings (MediatR:LicenseKey) — set it via
// user-secrets locally or the MediatR__LicenseKey env var in deployment; it is
// never committed. Infrastructure receives the mapped FamilyData options.
builder.Services.AddApplication(appSettings.MediatR.LicenseKey);
builder.Services.AddInfrastructure(new FamilyDataOptions { FilePath = appSettings.FamilyData.FilePath });
```

(`FamilyDataOptions` resolves via the existing `using FamilyTree.Infrastructure;` already in `Program.cs`.)

- [ ] **Step 3: Build the whole backend**

Run: `dotnet build`
Expected: **build succeeds** — the only `AddInfrastructure` caller is `Program.cs` (verified), and the only `AddApplication(string?)` caller besides `Program.cs` is a unit test that calls it with no argument, which still compiles against the unchanged default-parameter signature.

- [ ] **Step 4: Run the full backend test suite**

Run: `dotnet test`
Expected: **PASS** — all unit and integration tests. In particular, `FamilyApiFactory` sets `FamilyData:FilePath` via `UseSetting`, which flows into `builder.Configuration`, binds into `appSettings.FamilyData.FilePath`, and is mapped into `FamilyDataOptions` — so the integration tests still load the test fixture exactly as before.

- [ ] **Step 5: Commit**

```bash
git add src/backend/FamilyTree.Infrastructure/InfrastructureServiceCollectionExtensions.cs src/backend/FamilyTree.Api/Program.cs
git commit -m "Map FamilyData and MediatR settings from AppSettings; drop IConfiguration from AddInfrastructure"
```

---

## Task 4: Final verification

**Files:** none (verification only).

- [ ] **Step 1: Confirm no stale config-access patterns remain**

Run: `git grep -n 'Configuration\["' src/backend; git grep -n 'Configuration.GetValue' src/backend; git grep -n 'GetSection' src/backend`
Expected: **no matches** in `src/backend` (every direct config read has been replaced by `AppSettings`). If any remain, they were missed — migrate them the same way before continuing.

- [ ] **Step 2: Full clean build + test**

Run: `dotnet build && dotnet test`
Expected: **build succeeds; all tests PASS.**

- [ ] **Step 3: Smoke-run the API (optional but recommended)**

Run: `dotnet run --project src/backend/FamilyTree.Api` then, in another shell, `curl http://localhost:5037/health`
Expected: `200` with `{"status":"Healthy",...}`. Stop the server afterward. (This confirms `ValidateOnStart` does not reject the real `appsettings.json`.)

---

## Self-review notes (already applied)

- **Spec coverage:** implements section 4 of the design spec *for the existing settings only* (`FamilyData`, `MediatR`, `RateLimiting`) — the `Authentication`/`Firestore`/`Session` sections and their `Options` are explicitly PR 2, per the spec's Delivery/sequencing section.
- **Behavior preservation:** defaults in Task 1 reproduce today's `GetValue` fallbacks and the missing-`RateLimiting`-section case; the existing integration suite is the regression guard.
- **Type consistency:** `AppSettings.FamilyData` (`FamilyDataSettings`) is the *binding* type; `FamilyDataOptions` remains the *consumer* type in Infrastructure; the two are bridged only at the `Program.cs` mapping in Task 3, Step 2.
- **No new config sections / no doc change:** `appsettings.json` keys are unchanged, so this PR is doc-exempt.
