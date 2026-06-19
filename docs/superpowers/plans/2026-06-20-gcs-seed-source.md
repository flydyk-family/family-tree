# Source the family seed from GCS Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move the seed `family.json` out of the container image: in deployment, read it from a Google Cloud Storage object (swappable without redeploy, picked up within the snapshot TTL); locally and in tests keep reading the committed file.

**Architecture:** Make `IFamilyDataLoader` async, select the loader by a single `FamilyData:Source` config value (`gs://…` → a new `GcsFamilyDataLoader`, else the existing local-file `JsonFamilyDataLoader`), and harden the snapshot provider to serve the last-good cached snapshot when a refresh fails (fail-fast only on the very first load). The graph stays an immutable seed + biography overlays — only the seed's *location* changes.

**Tech Stack:** .NET 10, clean-architecture split (Domain / Application / Infrastructure / Api), `Google.Cloud.Storage.V1`, `System.TimeProvider`, xUnit + Moq + AwesomeAssertions, Central Package Management.

## Global Constraints

- **Storage = GCS, no new secrets.** Auth via the existing Workload Identity / Application Default Credentials (`StorageClient.Create()`); never add a key or connection string. The committed `Data/family.json` stays in the repo as the local dev seed.
- **Source is config-selected by one key.** `FamilyData:Source` (default `Data/family.json`): a value starting `gs://` selects the GCS loader; anything else is a local file path. Local dev/tests use the local file — no GCS, no credentials.
- **Failure posture:** fail-fast if the seed can't be read at **startup** (no snapshot yet); on a later refresh failure, **serve the last-good snapshot** and log a warning (never blank the tree or 500 a request/save).
- **Central Package Management** — every NuGet version goes in `Directory.Packages.props`; `PackageReference` elements carry **no** `Version` attribute.
- **C# conventions (CLAUDE.md):** file-scoped namespaces; `_camelCase` private readonly fields; constructor injection (services first, then `ILogger` last); `Async` suffix + trailing `CancellationToken`; nullable enabled, prefer `is null`/`is not null`, avoid `!`; **always brace** control statements; `var` when the type is obvious; add `using` directives rather than fully-qualified names.
- **Logging:** `ILogger<T>` via ctor; **structured logging only** (named placeholders, never interpolation); **log every catch** (warning with the exception on the serve-stale path, error+rethrow on the fail-fast path); **never log PII or secrets**.
- **Tests:** unit-test names follow `<Method>_When<Conditions>_Should<ExpectedResult>`; use `NullLogger<T>.Instance` where a logger is required but irrelevant; pristine output (no warnings).
- **Coverage:** the GCS loader is an untestable external-SDK wrapper → `[ExcludeFromCodeCoverage]` with a justifying comment (same precedent as `GoogleIdTokenValidator` / the Firestore stores); all selection, config, and serve-stale logic stays fully unit-tested so codecov/patch stays green.
- **No self-merge:** open the PR into `main` and stop — the owner reviews and squash-merges.

---

## File structure

**New files:**
- `src/backend/FamilyTree.Infrastructure/GcsFamilyDataLoader.cs` — reads a `gs://bucket/object` seed via `Google.Cloud.Storage.V1`, delegates parsing to `JsonFamilyDataLoader.Deserialize`. `[ExcludeFromCodeCoverage]`.
- `scripts/upload-seed.mjs` — uploads the committed `Data/family.json` to the bucket via `gcloud storage cp`.

**Modified files:**
- `src/backend/FamilyTree.Infrastructure/IFamilyDataLoader.cs` — `Load()` → `Task<FamilyGraph> LoadAsync(CancellationToken)`.
- `src/backend/FamilyTree.Infrastructure/JsonFamilyDataLoader.cs` — async file read; reads `_options.Source`.
- `src/backend/FamilyTree.Infrastructure/FamilyDataOptions.cs` — `FilePath` → `Source`.
- `src/backend/FamilyTree.Api/Configuration/FamilyDataSettings.cs` — `FilePath` → `Source`.
- `src/backend/FamilyTree.Api/appsettings.json` — `FamilyData.FilePath` → `Source` (+ `gs://` comment).
- `src/backend/FamilyTree.Api/Program.cs` — pass `Source` into `AddInfrastructure`.
- `src/backend/FamilyTree.Infrastructure/InfrastructureServiceCollectionExtensions.cs` — copy `Source`; select loader by `gs://`; register `StorageClient` in the GCS branch.
- `src/backend/FamilyTree.Infrastructure/FamilySnapshotProvider.cs` — `await LoadAsync`; serve-stale on refresh failure.
- `Directory.Packages.props` + `FamilyTree.Infrastructure.csproj` — add `Google.Cloud.Storage.V1`.
- Tests: `FamilySnapshotProviderTests.cs` (async stub + serve-stale cases), `InMemoryRepositoryTests.cs` (async Moq), `InfrastructureSelectionTests.cs` (loader-selection cases), `AppSettingsBindingTests.cs` (`Source` assertions).
- Docs: `docs/ci-cd/deploy.md`, `docs/reference/**`, `README.md`, `CLAUDE.md`.

---

## Task 1: Rename `FamilyData:FilePath` → `FamilyData:Source`

A behavior-preserving rename so one key can hold a local path *or* a `gs://` URI.

**Files:**
- Modify: `src/backend/FamilyTree.Infrastructure/FamilyDataOptions.cs`
- Modify: `src/backend/FamilyTree.Api/Configuration/FamilyDataSettings.cs`
- Modify: `src/backend/FamilyTree.Infrastructure/JsonFamilyDataLoader.cs` (the `_options.FilePath` read)
- Modify: `src/backend/FamilyTree.Infrastructure/InfrastructureServiceCollectionExtensions.cs` (the `Configure` lambda)
- Modify: `src/backend/FamilyTree.Api/Program.cs` (the `AddInfrastructure` call)
- Modify: `src/backend/FamilyTree.Api/appsettings.json`
- Test: `tests/integration/FamilyTree.IntegrationTests/AppSettingsBindingTests.cs`

**Interfaces:**
- Produces: `FamilyDataOptions { string Source = "Data/family.json"; int SnapshotTtlMinutes = 10 }` and `FamilyDataSettings { string Source; int SnapshotTtlMinutes }`.

- [ ] **Step 1: Rename in `FamilyDataOptions.cs`**

```csharp
namespace FamilyTree.Infrastructure;

public sealed class FamilyDataOptions
{
    /// <summary>
    /// Where the seed graph is read from: a local file path (default, used in dev/tests)
    /// or a "gs://bucket/object" URI (used in deployment). The loader is selected by this value.
    /// </summary>
    public string Source { get; set; } = "Data/family.json";

    /// <summary>
    /// How long the merged family snapshot is served from memory before the next read
    /// re-reads the seed and re-pulls overrides. A save refreshes it immediately.
    /// </summary>
    public int SnapshotTtlMinutes { get; set; } = 10;
}
```

- [ ] **Step 2: Rename in `FamilyDataSettings.cs`**

```csharp
namespace FamilyTree.Api.Configuration;

public sealed class FamilyDataSettings
{
    public string Source { get; init; } = "Data/family.json";

    public int SnapshotTtlMinutes { get; init; } = 10;
}
```

- [ ] **Step 3: Update the loader's read and the DI copy**

In `src/backend/FamilyTree.Infrastructure/JsonFamilyDataLoader.cs`, change the two `_options.FilePath` references in `Load()` to `_options.Source` (lines 29-31):

```csharp
        var path = Path.IsPathRooted(_options.Source)
            ? _options.Source
            : Path.Combine(_environment.ContentRootPath, _options.Source);
```

In `src/backend/FamilyTree.Infrastructure/InfrastructureServiceCollectionExtensions.cs`, change the `Configure<FamilyDataOptions>` lambda:

```csharp
        services.Configure<FamilyDataOptions>(options =>
        {
            options.Source = familyData.Source;
            options.SnapshotTtlMinutes = familyData.SnapshotTtlMinutes;
        });
```

In `src/backend/FamilyTree.Api/Program.cs`, change the `AddInfrastructure` call's `FamilyDataOptions` initializer (the `FilePath = appSettings.FamilyData.FilePath` line) to:

```csharp
    new FamilyDataOptions
    {
        Source = appSettings.FamilyData.Source,
        SnapshotTtlMinutes = appSettings.FamilyData.SnapshotTtlMinutes
    },
```

- [ ] **Step 4: Update `appsettings.json`**

Replace the `FamilyData` block:

```json
  "FamilyData": {
    "_comment": "Seed graph source. Local file path for dev/tests; in deployment override with FamilyData__Source=gs://<bucket>/family.json (read keylessly via Workload Identity). Edits to the GCS object are picked up within SnapshotTtlMinutes without a redeploy.",
    "Source": "Data/family.json",
    "SnapshotTtlMinutes": 10
  },
```

- [ ] **Step 5: Update the binding test**

In `tests/integration/FamilyTree.IntegrationTests/AppSettingsBindingTests.cs`, replace the `FamilyData:FilePath` key and its assertions with `Source`. In `Bind_WhenAllSectionsPresent_ShouldPopulateEveryNestedValue`, change the dictionary entry `["FamilyData:FilePath"] = "Data/custom.json"` to `["FamilyData:Source"] = "Data/custom.json"` and the assertion `settings!.FamilyData.FilePath.Should().Be("Data/custom.json")` to `settings!.FamilyData.Source.Should().Be("Data/custom.json")`. In `Bind_WhenSectionsMissing_ShouldFallBackToBehaviorPreservingDefaults`, change `settings.FamilyData.FilePath.Should().Be("Data/family.json")` to `settings.FamilyData.Source.Should().Be("Data/family.json")`.

- [ ] **Step 6: Build and run the full suite**

Run: `dotnet build && dotnet test`
Expected: PASS — no remaining `FilePath` references (grep `\.FilePath` in `src/backend` and `tests` returns nothing), all tests green.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "refactor: rename FamilyData:FilePath to Source"
```

---

## Task 2: Make `IFamilyDataLoader` async

Behavior-preserving conversion of the loader to `LoadAsync` so a network-backed (GCS) implementation fits. No GCS yet.

**Files:**
- Modify: `src/backend/FamilyTree.Infrastructure/IFamilyDataLoader.cs`
- Modify: `src/backend/FamilyTree.Infrastructure/JsonFamilyDataLoader.cs`
- Modify: `src/backend/FamilyTree.Infrastructure/FamilySnapshotProvider.cs` (the `_loader.Load()` call site)
- Modify: `tests/unit/FamilyTree.UnitTests/Infrastructure/FamilySnapshotProviderTests.cs` (the `StubLoader`)
- Modify: `tests/unit/FamilyTree.UnitTests/Infrastructure/InMemoryRepositoryTests.cs` (the Moq setup)
- Modify: `tests/unit/FamilyTree.UnitTests/Infrastructure/JsonFamilyDataLoaderTests.cs` (add `LoadAsync` cases — the rewritten method's branches are new changed lines that need coverage)

**Interfaces:**
- Consumes: `JsonFamilyDataLoader.Deserialize(string) → FamilyGraph` (unchanged static).
- Produces: `IFamilyDataLoader.LoadAsync(CancellationToken) → Task<FamilyGraph>`.

- [ ] **Step 1: Change the interface**

`src/backend/FamilyTree.Infrastructure/IFamilyDataLoader.cs`:

```csharp
namespace FamilyTree.Infrastructure;

public interface IFamilyDataLoader
{
    Task<FamilyGraph> LoadAsync(CancellationToken cancellationToken);
}
```

- [ ] **Step 2: Make `JsonFamilyDataLoader` async**

In `src/backend/FamilyTree.Infrastructure/JsonFamilyDataLoader.cs`, replace the `Load()` method with `LoadAsync` (the static `Deserialize` stays unchanged):

```csharp
    public async Task<FamilyGraph> LoadAsync(CancellationToken cancellationToken)
    {
        var path = Path.IsPathRooted(_options.Source)
            ? _options.Source
            : Path.Combine(_environment.ContentRootPath, _options.Source);

        if (!File.Exists(path))
        {
            _logger.LogError("Family data file not found at '{Path}'.", path);
            throw new FileNotFoundException($"Family data file not found at '{path}'.", path);
        }

        var json = await File.ReadAllTextAsync(path, cancellationToken);
        try
        {
            return Deserialize(json);
        }
        catch (Exception ex) when (ex is JsonException or InvalidOperationException)
        {
            _logger.LogError(ex, "Failed to deserialize family data file at '{Path}'.", path);
            throw;
        }
    }
```

> `JsonException` is already imported via `using System.Text.Json;` at the top of the file — the existing `catch` uses the fully-qualified `System.Text.Json.JsonException`; either form compiles. Keep the file's existing `using` directives.

- [ ] **Step 3: Update the snapshot provider call site**

In `src/backend/FamilyTree.Infrastructure/FamilySnapshotProvider.cs`, change the rebuild's load (line 67) from `var seed = _loader.Load();` to:

```csharp
            var seed = await _loader.LoadAsync(cancellationToken);
```

- [ ] **Step 4: Update the test doubles**

In `tests/unit/FamilyTree.UnitTests/Infrastructure/FamilySnapshotProviderTests.cs`, change `StubLoader` to the async interface:

```csharp
    private sealed class StubLoader : IFamilyDataLoader
    {
        public FamilyGraph Graph { get; set; } = new([], []);
        public int LoadCount { get; private set; }

        public Task<FamilyGraph> LoadAsync(CancellationToken cancellationToken)
        {
            LoadCount++;
            return Task.FromResult(Graph);
        }
    }
```

In `tests/unit/FamilyTree.UnitTests/Infrastructure/InMemoryRepositoryTests.cs`, change the Moq setup (line 32) from `loader.Setup(l => l.Load()).Returns(...)` to:

```csharp
        loader.Setup(l => l.LoadAsync(It.IsAny<CancellationToken>()))
            .ReturnsAsync(new FamilyGraph(people, unions));
```

> Add `using Moq;` and `using System.Threading;` only if not already present (the file already mocks `IFamilyDataLoader`, so `Moq` is imported; `ReturnsAsync` is a Moq extension).

- [ ] **Step 5: Add `LoadAsync` unit tests**

`JsonFamilyDataLoaderTests.cs` currently tests only the static `Deserialize`. Add coverage for the rewritten `LoadAsync` (happy path + both error branches), so the changed lines are unit-covered. Add these usings at the top — `using System.IO;`, `using Microsoft.Extensions.Hosting;`, `using Microsoft.Extensions.Logging.Abstractions;`, `using Microsoft.Extensions.Options;`, `using Moq;` — and append to the class:

```csharp
    private static JsonFamilyDataLoader Loader(string source)
    {
        var environment = new Mock<IHostEnvironment>();
        environment.SetupGet(e => e.ContentRootPath).Returns(Path.GetTempPath());
        return new JsonFamilyDataLoader(
            Options.Create(new FamilyDataOptions { Source = source }),
            environment.Object,
            NullLogger<JsonFamilyDataLoader>.Instance);
    }

    [Fact]
    public async Task LoadAsync_WhenFileHasValidJson_ShouldReturnGraph()
    {
        var path = Path.Combine(Path.GetTempPath(), $"ft-seed-{Guid.NewGuid():N}.json");
        await File.WriteAllTextAsync(path, """
        { "people": [ { "id": "p1", "givenName": { "ru": "A" }, "surname": { "ru": "B" }, "birth": { "year": 1900 } } ], "unions": [] }
        """);
        try
        {
            var graph = await Loader(path).LoadAsync(default);

            graph.People.Should().ContainSingle().Which.Id.Should().Be("p1");
        }
        finally
        {
            File.Delete(path);
        }
    }

    [Fact]
    public async Task LoadAsync_WhenFileMissing_ShouldThrowFileNotFound()
    {
        var path = Path.Combine(Path.GetTempPath(), $"ft-missing-{Guid.NewGuid():N}.json");

        var act = async () => await Loader(path).LoadAsync(default);

        await act.Should().ThrowAsync<FileNotFoundException>();
    }

    [Fact]
    public async Task LoadAsync_WhenFileHasInvalidJson_ShouldThrow()
    {
        var path = Path.Combine(Path.GetTempPath(), $"ft-bad-{Guid.NewGuid():N}.json");
        await File.WriteAllTextAsync(path, "{ not json");
        try
        {
            var act = async () => await Loader(path).LoadAsync(default);

            await act.Should().ThrowAsync<Exception>();
        }
        finally
        {
            File.Delete(path);
        }
    }
```

> The temp paths are absolute, so `Path.IsPathRooted` is true and `ContentRootPath` is unused — the mocked environment just satisfies the constructor.

- [ ] **Step 6: Build and run the full suite**

Run: `dotnet build && dotnet test`
Expected: PASS — solution compiles with the async loader; the new `LoadAsync` tests pass; all existing tests green (this is a behavior-preserving refactor).

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "refactor: make IFamilyDataLoader async (LoadAsync)"
```

---

## Task 3: Add `GcsFamilyDataLoader` + the GCS package

**Files:**
- Modify: `Directory.Packages.props`
- Modify: `src/backend/FamilyTree.Infrastructure/FamilyTree.Infrastructure.csproj`
- Create: `src/backend/FamilyTree.Infrastructure/GcsFamilyDataLoader.cs`

**Interfaces:**
- Consumes: `StorageClient` (from `Google.Cloud.Storage.V1`); `IOptions<FamilyDataOptions>` (`Source` is the `gs://` URI); `JsonFamilyDataLoader.Deserialize(string)`.
- Produces: `GcsFamilyDataLoader(StorageClient client, IOptions<FamilyDataOptions> options, ILogger<GcsFamilyDataLoader> logger) : IFamilyDataLoader`.

- [ ] **Step 1: Add the package (CPM)**

In `Directory.Packages.props`, add under the Google group (verify the latest stable on nuget.org at execution time — `4.10.0` is known-good):

```xml
    <!-- Cloud Storage: read the seed graph from a gs:// object in deployment. -->
    <PackageVersion Include="Google.Cloud.Storage.V1" Version="4.10.0" />
```

In `src/backend/FamilyTree.Infrastructure/FamilyTree.Infrastructure.csproj`, add to the package `ItemGroup`:

```xml
    <PackageReference Include="Google.Cloud.Storage.V1" />
```

- [ ] **Step 2: Implement the loader**

`src/backend/FamilyTree.Infrastructure/GcsFamilyDataLoader.cs`. It is `[ExcludeFromCodeCoverage]` — a thin SDK wrapper verified manually against a real bucket (same precedent as the Firestore stores). It parses `gs://bucket/object` from `Source`, downloads the object, and reuses the shared `Deserialize`:

```csharp
using System.Diagnostics.CodeAnalysis;
using System.Text;
using Google.Cloud.Storage.V1;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;

namespace FamilyTree.Infrastructure;

/// <summary>
/// Reads the seed graph from a "gs://bucket/object" URI in deployment, via the Cloud
/// Storage client (Application Default Credentials — no key). Parsing is delegated to
/// <see cref="JsonFamilyDataLoader.Deserialize"/> so both loaders share one parse path.
/// [ExcludeFromCodeCoverage]: a thin SDK wrapper with no testable branching, verified
/// against a real bucket — same rationale as GoogleIdTokenValidator / the Firestore stores.
/// </summary>
[ExcludeFromCodeCoverage]
public sealed class GcsFamilyDataLoader : IFamilyDataLoader
{
    private readonly StorageClient _client;
    private readonly string _bucket;
    private readonly string _object;
    private readonly ILogger<GcsFamilyDataLoader> _logger;

    public GcsFamilyDataLoader(StorageClient client, IOptions<FamilyDataOptions> options, ILogger<GcsFamilyDataLoader> logger)
    {
        _client = client;
        _logger = logger;
        (_bucket, _object) = ParseGsUri(options.Value.Source);
    }

    public async Task<FamilyGraph> LoadAsync(CancellationToken cancellationToken)
    {
        try
        {
            using var stream = new MemoryStream();
            await _client.DownloadObjectAsync(_bucket, _object, stream, cancellationToken: cancellationToken);
            var json = Encoding.UTF8.GetString(stream.ToArray());
            return JsonFamilyDataLoader.Deserialize(json);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to read the seed object 'gs://{Bucket}/{Object}'.", _bucket, _object);
            throw;
        }
    }

    private static (string Bucket, string Object) ParseGsUri(string uri)
    {
        const string scheme = "gs://";
        if (!uri.StartsWith(scheme, StringComparison.OrdinalIgnoreCase))
        {
            throw new ArgumentException($"Seed source '{uri}' is not a gs:// URI.", nameof(uri));
        }

        var rest = uri[scheme.Length..];
        var slash = rest.IndexOf('/');
        if (slash <= 0 || slash == rest.Length - 1)
        {
            throw new ArgumentException($"Seed source '{uri}' must be of the form gs://bucket/object.", nameof(uri));
        }

        return (rest[..slash], rest[(slash + 1)..]);
    }
}
```

- [ ] **Step 3: Build to verify the package resolves and the type compiles**

Run: `dotnet build src/backend/FamilyTree.Infrastructure`
Expected: PASS (package restored; no compile errors). If `4.10.0` fails to restore, update the `PackageVersion` to the latest stable on nuget.org and rebuild.

- [ ] **Step 4: Commit**

```bash
git add Directory.Packages.props \
        src/backend/FamilyTree.Infrastructure/FamilyTree.Infrastructure.csproj \
        src/backend/FamilyTree.Infrastructure/GcsFamilyDataLoader.cs
git commit -m "feat: add GCS family-data loader"
```

---

## Task 4: Select the loader by `gs://` source

**Files:**
- Modify: `src/backend/FamilyTree.Infrastructure/InfrastructureServiceCollectionExtensions.cs`
- Test: `tests/unit/FamilyTree.UnitTests/Infrastructure/InfrastructureSelectionTests.cs`

**Interfaces:**
- Consumes: `GcsFamilyDataLoader` (Task 3); `StorageClient`; `FamilyDataOptions.Source`.
- Produces: `AddInfrastructure` registers `GcsFamilyDataLoader` + a `StorageClient` singleton when `Source` starts with `gs://`, else `JsonFamilyDataLoader`.

- [ ] **Step 1: Write the failing selection tests**

Append to `tests/unit/FamilyTree.UnitTests/Infrastructure/InfrastructureSelectionTests.cs` (it already has the `Descriptor<TService>` helper and Firestore-selection cases). Add:

```csharp
    [Fact]
    public void AddInfrastructure_WhenSourceIsLocalPath_ShouldRegisterJsonLoader()
    {
        var services = new ServiceCollection();

        services.AddInfrastructure(new FamilyDataOptions { Source = "Data/family.json" }, new FirestoreOptions());

        Descriptor<IFamilyDataLoader>(services).ImplementationType.Should().Be(typeof(JsonFamilyDataLoader));
    }

    [Fact]
    public void AddInfrastructure_WhenSourceIsGcsUri_ShouldRegisterGcsLoader()
    {
        var services = new ServiceCollection();

        services.AddInfrastructure(new FamilyDataOptions { Source = "gs://bucket/family.json" }, new FirestoreOptions());

        Descriptor<IFamilyDataLoader>(services).ImplementationType.Should().Be(typeof(GcsFamilyDataLoader));
    }
```

> These assert the registered `ImplementationType` via `ServiceDescriptor` without resolving — so the GCS branch never constructs `StorageClient` (no network/credentials).

- [ ] **Step 2: Run to verify failure**

Run: `dotnet test tests/unit/FamilyTree.UnitTests --filter FullyQualifiedName~InfrastructureSelectionTests`
Expected: FAIL — `AddInfrastructure` always registers `JsonFamilyDataLoader` today, so the gs:// case fails.

- [ ] **Step 3: Implement loader selection**

In `src/backend/FamilyTree.Infrastructure/InfrastructureServiceCollectionExtensions.cs`, add `using Google.Cloud.Storage.V1;` and replace the single loader registration line (`services.AddSingleton<IFamilyDataLoader, JsonFamilyDataLoader>();`, line 27) with a `gs://` branch:

```csharp
        services.AddSingleton(TimeProvider.System);

        if (familyData.Source.StartsWith("gs://", StringComparison.OrdinalIgnoreCase))
        {
            services.AddSingleton(_ => StorageClient.Create());
            services.AddSingleton<IFamilyDataLoader, GcsFamilyDataLoader>();
        }
        else
        {
            services.AddSingleton<IFamilyDataLoader, JsonFamilyDataLoader>();
        }

        services.AddSingleton<IFamilySnapshotProvider, FamilySnapshotProvider>();
```

(Leave the Firestore `if/else` block and the rest of the method unchanged.)

- [ ] **Step 4: Run the selection tests + full suite**

Run: `dotnet build && dotnet test`
Expected: PASS — both loader-selection tests green; whole suite green (the default `Source` is a local path, so nothing constructs `StorageClient`).

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: select the GCS loader when the seed source is a gs:// URI"
```

---

## Task 5: Serve the last-good snapshot when a refresh fails

**Files:**
- Modify: `src/backend/FamilyTree.Infrastructure/FamilySnapshotProvider.cs`
- Test: `tests/unit/FamilyTree.UnitTests/Infrastructure/FamilySnapshotProviderTests.cs`

**Interfaces:**
- Consumes: `IFamilyDataLoader.LoadAsync` (Task 2).
- Produces: `RebuildAsync` returns the existing snapshot (and logs a warning, backing off one TTL) when the load fails and a snapshot already exists; rethrows when no snapshot exists.

- [ ] **Step 1: Extend the test stub to fail on demand and write the failing tests**

In `tests/unit/FamilyTree.UnitTests/Infrastructure/FamilySnapshotProviderTests.cs`, add a `FailWith` field to `StubLoader`:

```csharp
    private sealed class StubLoader : IFamilyDataLoader
    {
        public FamilyGraph Graph { get; set; } = new([], []);
        public int LoadCount { get; private set; }
        public Exception? FailWith { get; set; }

        public Task<FamilyGraph> LoadAsync(CancellationToken cancellationToken)
        {
            LoadCount++;
            if (FailWith is not null)
            {
                throw FailWith;
            }

            return Task.FromResult(Graph);
        }
    }
```

Then add three tests:

```csharp
    [Fact]
    public async Task GetAsync_WhenRefreshFailsWithExistingSnapshot_ShouldServeLastGoodSnapshot()
    {
        var (provider, loader, _, clock) = Build(ttlMinutes: 10);
        var first = await provider.GetAsync(default);

        clock.Advance(TimeSpan.FromMinutes(11));
        loader.FailWith = new InvalidOperationException("gcs down");
        var second = await provider.GetAsync(default);

        second.Should().BeSameAs(first);
        loader.LoadCount.Should().Be(2); // it tried once more, then fell back
    }

    [Fact]
    public async Task GetAsync_WhenFailedRefreshBacksOff_ShouldNotReloadWithinTtl()
    {
        var (provider, loader, _, clock) = Build(ttlMinutes: 10);
        await provider.GetAsync(default);
        clock.Advance(TimeSpan.FromMinutes(11));
        loader.FailWith = new InvalidOperationException("gcs down");
        await provider.GetAsync(default); // fails → backs off, LoadCount == 2

        await provider.GetAsync(default); // within the backed-off TTL

        loader.LoadCount.Should().Be(2); // no extra attempt — no per-request hammering
    }

    [Fact]
    public async Task GetAsync_WhenInitialLoadFails_ShouldThrow()
    {
        var (provider, loader, _, _) = Build(ttlMinutes: 10);
        loader.FailWith = new InvalidOperationException("gcs down");

        var act = async () => await provider.GetAsync(default);

        await act.Should().ThrowAsync<InvalidOperationException>();
    }
```

- [ ] **Step 2: Run to verify failure**

Run: `dotnet test tests/unit/FamilyTree.UnitTests --filter FullyQualifiedName~FamilySnapshotProviderTests`
Expected: FAIL — the current `RebuildAsync` propagates the loader exception, so the serve-stale cases fail (they get an exception instead of the last-good snapshot).

- [ ] **Step 3: Implement serve-stale in `RebuildAsync`**

In `src/backend/FamilyTree.Infrastructure/FamilySnapshotProvider.cs`, wrap the data fetch so a failure with an existing snapshot is non-fatal. Replace the body from the `var seed = await _loader.LoadAsync(...)` line through the `return merged;` line with:

```csharp
            FamilyGraph seed;
            IReadOnlyDictionary<string, LocalizedText> latest;
            try
            {
                seed = await _loader.LoadAsync(cancellationToken);
                latest = await _overrides.GetLatestBiographiesAsync(cancellationToken);
            }
            catch (Exception ex)
            {
                if (current is not null)
                {
                    // Transient source failure: keep serving the last-good snapshot and back off
                    // one TTL so we don't hit the source on every request.
                    _logger.LogWarning(ex, "Family snapshot refresh failed; serving the last-good snapshot.");
                    _builtAt = _timeProvider.GetUtcNow();
                    return current;
                }

                // No snapshot yet (startup) — fail fast.
                _logger.LogError(ex, "Initial family snapshot load failed.");
                throw;
            }

            var people = latest.Count == 0
                ? seed.People
                : seed.People
                    .Select(person => latest.TryGetValue(person.Id, out var biography)
                        ? person with { Biography = biography }
                        : person)
                    .ToList();

            var merged = new FamilyGraph(people, seed.Unions);
            _snapshot = merged;
            _builtAt = _timeProvider.GetUtcNow();
            _logger.LogDebug("Family snapshot rebuilt ({PeopleCount} people, {OverrideCount} overrides).",
                people.Count, latest.Count);
            return merged;
```

> `current` is the local already captured at the top of `RebuildAsync` (`var current = _snapshot;`). `LocalizedText` is in `FamilyTree.Domain` (already covered by the file's `global using FamilyTree.Domain;` via Infrastructure's GlobalUsings).

- [ ] **Step 4: Run the snapshot tests + full suite**

Run: `dotnet test tests/unit/FamilyTree.UnitTests --filter FullyQualifiedName~FamilySnapshotProviderTests` then `dotnet test`
Expected: PASS — serve-stale + fail-fast cases green; full suite green, pristine.

- [ ] **Step 5: Commit**

```bash
git add src/backend/FamilyTree.Infrastructure/FamilySnapshotProvider.cs \
        tests/unit/FamilyTree.UnitTests/Infrastructure/FamilySnapshotProviderTests.cs
git commit -m "feat: serve the last-good snapshot when a refresh fails"
```

---

## Task 6: Seed upload script

**Files:**
- Create: `scripts/upload-seed.mjs`

**Interfaces:** none (tooling).

- [ ] **Step 1: Write the script**

`scripts/upload-seed.mjs` — mirrors `scripts/upload-media.mjs` in style; uploads the committed seed to the bucket via `gcloud storage cp`:

```javascript
#!/usr/bin/env node
// Uploads the committed seed graph to the GCS object the deployed API reads
// (FamilyData__Source=gs://<bucket>/<object>). Re-run to publish an edited baseline;
// the running API picks it up within the snapshot TTL (no redeploy).
//
// Usage:   node scripts/upload-seed.mjs [--dry-run]
// Auth:    `gcloud auth login` (or application-default credentials) with objectAdmin on the bucket.
// Target:  gs://$SEED_BUCKET/$SEED_OBJECT  (defaults below; override via env).
import { execSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const BUCKET = process.env.SEED_BUCKET ?? 'family-tree-seed';
const OBJECT = process.env.SEED_OBJECT ?? 'family.json';
const seed = fileURLToPath(new URL('../src/backend/FamilyTree.Api/Data/family.json', import.meta.url));
const dryRun = process.argv.includes('--dry-run');

if (!existsSync(seed)) {
  console.error(`No seed file at ${seed} — nothing to upload.`);
  process.exit(1);
}

const target = `gs://${BUCKET}/${OBJECT}`;
const command = `gcloud storage cp "${seed}" "${target}"`;

if (dryRun) {
  console.log(`[dry-run] ${command}`);
  process.exit(0);
}

console.log(`Uploading ${seed} -> ${target}`);
execSync(command, { stdio: 'inherit' });
console.log('Done. The API picks up the change within the snapshot TTL.');
```

- [ ] **Step 2: Verify it parses and the dry-run prints the plan**

Run: `node scripts/upload-seed.mjs --dry-run`
Expected: prints `[dry-run] gcloud storage cp ".../Data/family.json" "gs://family-tree-seed/family.json"` and exits 0 (no upload, no gcloud needed).

- [ ] **Step 3: Commit**

```bash
git add scripts/upload-seed.mjs
git commit -m "chore: add seed upload script"
```

---

## Task 7: Deploy config + documentation

**Files:**
- Modify: `docs/ci-cd/deploy.md`
- Modify: relevant `docs/reference/` page(s)
- Modify: `README.md`, `CLAUDE.md`

**Interfaces:** none (docs).

- [ ] **Step 1: Document the GCS prerequisite in `docs/ci-cd/deploy.md`**

Add a subsection (near the Firestore/Workload Identity setup) covering the owner one-time steps:
- Create the bucket: `gcloud storage buckets create gs://family-tree-seed --location <region> --project <PROJECT_ID>`.
- Grant the Cloud Run **runtime** service account object read:
  `gcloud storage buckets add-iam-policy-binding gs://family-tree-seed --member serviceAccount:<runtime-sa> --role roles/storage.objectViewer`.
- Initial upload: `node scripts/upload-seed.mjs` (then re-run to publish edits).
- Set the env var on the service: `FamilyData__Source=gs://family-tree-seed/family.json`.
- Note: **no new secrets, no Workload Identity changes** — GCS is read via the existing keyless ADC; updates are picked up within `SnapshotTtlMinutes` without a redeploy.

- [ ] **Step 2: Update `docs/reference/` (run the docs skill)**

Invoke the `update-docs-for-pr` skill; apply its findings. The behavior to document: in deployment the seed is sourced from a GCS object (`FamilyData:Source=gs://…`), swappable without a redeploy and picked up within the TTL; local/dev reads the committed file; a transient GCS read failure serves the last-good snapshot (startup failure fails fast). Keep live-vs-roadmap honesty (GCS is the source only when `Source` is a `gs://` URI; structural editing remains future work).

- [ ] **Step 3: Update README + CLAUDE overview**

Note that the seed `family.json` is served from GCS in deployment (no longer only baked into the image) and is swappable without a redeploy. Keep edits minimal and accurate.

- [ ] **Step 4: Commit**

```bash
git add docs/ci-cd/deploy.md docs/reference README.md CLAUDE.md
git commit -m "docs: document the GCS-sourced family seed"
```

---

## Final verification (before opening the PR)

- [ ] **Full backend build + test:** `dotnet build && dotnet test` → all green, pristine.
- [ ] **Frontend gate (no changes, but CI runs it):** `npm --prefix src/frontend run build && npm --prefix src/frontend test` → green.
- [ ] **No `FilePath` / `Load()` remnants:** grep `\.FilePath\b` and `\.Load()` under `src/backend` + `tests` → nothing (all renamed/async).
- [ ] **Coverage sanity:** `GcsFamilyDataLoader` carries `[ExcludeFromCodeCoverage]`; loader-selection + serve-stale logic is unit-tested → codecov/patch stays green.
- [ ] **No secrets/PII committed or logged:** `appsettings.json` `Source` is the local default; the GCS loader logs the bucket/object on error (not a secret), never credentials.
- [ ] **Open the PR into `main`** with a title describing the idea (e.g. *"Serve the family seed from GCS instead of the build image"*), run `update-docs-for-pr` at PR time, and **stop** — the owner reviews and squash-merges.

---

## Notes / risks

- **Startup latency:** the warm-up now does one GCS object GET before readiness; small, and it preserves fail-fast.
- **Staleness window:** after a failed refresh the app serves stale for up to one TTL before retrying — bounded and acceptable for this interim step.
- **GCS loader is emulator/manual-verified only** (`[ExcludeFromCodeCoverage]`); the risk surface (selection, parsing entry, serve-stale) is unit-tested. The `ParseGsUri` validation runs at startup, so a malformed `gs://` value fails fast with a clear message.
- **Out of scope:** structural editing (Firestore as graph source-of-record), moving media off R2, an admin force-refresh endpoint, configurable failure backoff.
