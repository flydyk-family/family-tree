# Firestore-backed stores + cached snapshot read-path Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make editor biography edits **durable and shared** in deployment by adding Firestore-backed `ISessionStore` / `IPersonOverrideStore` implementations (selected by config), a 10-minute TTL merged-snapshot read cache so every viewer sees edits without a per-request store hit, and session-token rotation on sliding renewal.

**Architecture:** Today the read path overlays overrides per-request inside `InMemoryPersonRepository`, and both stores are in-memory only. This PR (1) introduces a singleton `FamilySnapshotProvider` that holds one merged `FamilyGraph` (JSON seed + latest overrides), refreshes it on a 10-minute TTL and on every save, and serves all reads from it; (2) rotates the opaque session token on sliding renewal (a leaked-then-renewed token stops working); and (3) adds `FirestoreSessionStore` / `FirestorePersonOverrideStore`, chosen over the in-memory pair when `Firestore:ProjectId` is configured. Local dev and tests stay 100% in-memory — no Firestore, no Java, no credentials.

**Tech Stack:** .NET 10, clean-architecture split (Domain / Application / Infrastructure / Api), `Google.Cloud.Firestore`, `System.TimeProvider`, xUnit + Moq + AwesomeAssertions, Central Package Management.

## Global Constraints

- **Central Package Management** — every NuGet version goes in `Directory.Packages.props`; `PackageReference` elements carry **no** `Version` attribute.
- **C# conventions (CLAUDE.md):** file-scoped namespaces; `_camelCase` private readonly fields; constructor injection (services first, then `ILogger` last); `Async` suffix + trailing `CancellationToken`; nullable enabled, prefer `is null`/`is not null`, avoid `!`; **always brace** control statements; `var` when the type is obvious; add `using` directives rather than fully-qualified names.
- **Logging:** `ILogger<T>` via constructor injection; **structured logging only** (named placeholders, never interpolation); **log every catch** (fail-fast boundaries `LogError` then rethrow); **never log PII or secrets** (no emails, tokens, cookies, Google ID tokens — log a non-identifying outcome instead). CodeQL "exposure of private information" gates the build.
- **Tests:** unit-test names follow `<Method>_When<Conditions>_Should<ExpectedResult>`; use `NullLogger<T>.Instance` where a logger is required but irrelevant.
- **Secrets:** nothing secret or personal is committed (public repo). `Firestore:ProjectId` etc. ship as empty placeholders; real values come from env (`Firestore__ProjectId`).
- **No self-merge:** open the PR into `main` and stop — the owner reviews and squash-merges.
- **Coverage:** untestable external-SDK wrappers (the Firestore classes) are marked `[ExcludeFromCodeCoverage]` with a justifying comment, matching the existing `GoogleIdTokenValidator` precedent; all *selection* and *cache* logic stays fully covered.

---

## File structure

**New files:**
- `src/backend/FamilyTree.Domain/IFamilySnapshotProvider.cs` — read-side cache abstraction (`GetAsync` → merged `FamilyGraph`, `RefreshAsync`). Domain-level so both Infrastructure repositories and the Application edit handler can depend on it.
- `src/backend/FamilyTree.Infrastructure/FamilySnapshotProvider.cs` — the singleton TTL cache: merges seed + overrides, refreshes on TTL/​on demand, atomic swap.
- `src/backend/FamilyTree.Infrastructure/FirestoreOptions.cs` — `{ ProjectId, SessionsCollection, OverridesCollection }`.
- `src/backend/FamilyTree.Infrastructure/FirestoreSessionStore.cs` — `ISessionStore` over a `sessions` collection keyed by `SHA-256(token)`.
- `src/backend/FamilyTree.Infrastructure/FirestorePersonOverrideStore.cs` — `IPersonOverrideStore` over a `personOverrides` collection (append-only versions).
- `src/backend/FamilyTree.Api/Configuration/FirestoreSettings.cs` — the `Firestore` config-binding section.
- `tests/unit/FamilyTree.UnitTests/Infrastructure/FamilySnapshotProviderTests.cs`
- `tests/unit/FamilyTree.UnitTests/Infrastructure/TestTimeProvider.cs` — a mutable `TimeProvider` test helper.
- `tests/unit/FamilyTree.UnitTests/Infrastructure/InfrastructureSelectionTests.cs`

**Modified files:**
- `src/backend/FamilyTree.Infrastructure/FamilyDataOptions.cs` — add `SnapshotTtlMinutes`.
- `src/backend/FamilyTree.Api/Configuration/FamilyDataSettings.cs` — add `SnapshotTtlMinutes`.
- `src/backend/FamilyTree.Api/Configuration/AppSettings.cs` — add `Firestore`.
- `src/backend/FamilyTree.Infrastructure/InMemoryPersonRepository.cs` — read from the snapshot.
- `src/backend/FamilyTree.Infrastructure/InMemoryUnionRepository.cs` — read from the snapshot.
- `src/backend/FamilyTree.Infrastructure/ISessionStore.cs` — `RenewAsync` → `RotateAsync` (returns the new token).
- `src/backend/FamilyTree.Infrastructure/InMemorySessionStore.cs` — implement rotation.
- `src/backend/FamilyTree.Infrastructure/InfrastructureServiceCollectionExtensions.cs` — register the snapshot provider + `TimeProvider`; select Firestore vs in-memory stores.
- `src/backend/FamilyTree.Application/People/UpdatePersonBiographyHandler.cs` — refresh the snapshot after a save.
- `src/backend/FamilyTree.Api/Auth/SessionAuthenticationHandler.cs` — re-set the cookie with the rotated token.
- `src/backend/FamilyTree.Api/Program.cs` — map `FirestoreOptions`, pass Firestore config + `SnapshotTtlMinutes` to `AddInfrastructure`, warm the snapshot at startup.
- `src/backend/FamilyTree.Api/appsettings.json` — `Firestore` placeholders + `FamilyData:SnapshotTtlMinutes`.
- `Directory.Packages.props` — add `Google.Cloud.Firestore`.
- `src/backend/FamilyTree.Infrastructure/FamilyTree.Infrastructure.csproj` — reference `Google.Cloud.Firestore`.
- **Delete:** `src/backend/FamilyTree.Infrastructure/FamilyStore.cs` (superseded by the snapshot provider).
- Existing tests touching `FamilyStore`: `tests/unit/FamilyTree.UnitTests/Infrastructure/InMemoryRepositoryTests.cs`, `PersonRepositoryOverlayTests.cs`.
- Existing session-renewal tests: `tests/unit/FamilyTree.UnitTests/Infrastructure/InMemorySessionStoreTests.cs`, and the integration sliding-renewal test under `tests/integration/.../Auth/`.
- Docs: `docs/reference/` (data/auth pages), root `README.md`, `CLAUDE.md` overview.

---

## Task 1: Family snapshot provider (TTL read cache)

**Files:**
- Modify: `src/backend/FamilyTree.Infrastructure/FamilyDataOptions.cs`
- Modify: `src/backend/FamilyTree.Api/Configuration/FamilyDataSettings.cs`
- Create: `src/backend/FamilyTree.Domain/IFamilySnapshotProvider.cs`
- Create: `src/backend/FamilyTree.Infrastructure/FamilySnapshotProvider.cs`
- Create: `tests/unit/FamilyTree.UnitTests/Infrastructure/TestTimeProvider.cs`
- Test: `tests/unit/FamilyTree.UnitTests/Infrastructure/FamilySnapshotProviderTests.cs`

**Interfaces:**
- Consumes: `IFamilyDataLoader.Load() → FamilyGraph` (Infrastructure); `IPersonOverrideStore.GetLatestBiographiesAsync(ct) → IReadOnlyDictionary<string, LocalizedText>` (Domain); `FamilyGraph(IReadOnlyList<Person> People, IReadOnlyList<Union> Unions)` (Domain); `FamilyDataOptions { string FilePath; int SnapshotTtlMinutes }`.
- Produces: `IFamilySnapshotProvider { ValueTask<FamilyGraph> GetAsync(CancellationToken); Task RefreshAsync(CancellationToken); }` (Domain), implemented by `FamilySnapshotProvider` (Infrastructure), constructed as `(IFamilyDataLoader loader, IPersonOverrideStore overrides, IOptions<FamilyDataOptions> options, TimeProvider timeProvider, ILogger<FamilySnapshotProvider> logger)`.

- [ ] **Step 1: Add the TTL setting to both options/settings classes**

`src/backend/FamilyTree.Infrastructure/FamilyDataOptions.cs`:

```csharp
namespace FamilyTree.Infrastructure;

public sealed class FamilyDataOptions
{
    public string FilePath { get; set; } = "Data/family.json";

    /// <summary>
    /// How long the merged family snapshot is served from memory before the next read
    /// re-reads family.json and re-pulls overrides. A save refreshes it immediately.
    /// </summary>
    public int SnapshotTtlMinutes { get; set; } = 10;
}
```

`src/backend/FamilyTree.Api/Configuration/FamilyDataSettings.cs`:

```csharp
namespace FamilyTree.Api.Configuration;

public sealed class FamilyDataSettings
{
    public string FilePath { get; init; } = "Data/family.json";

    public int SnapshotTtlMinutes { get; init; } = 10;
}
```

- [ ] **Step 2: Create the Domain interface**

`src/backend/FamilyTree.Domain/IFamilySnapshotProvider.cs`:

```csharp
namespace FamilyTree.Domain;

/// <summary>
/// Serves all reads from a single in-memory merged snapshot (JSON seed + latest
/// biography overrides). The snapshot refreshes on a TTL and on demand (after a save),
/// so public reads never hit the override store per request and edits become visible
/// to everyone without a restart.
/// </summary>
public interface IFamilySnapshotProvider
{
    /// <summary>Returns the current snapshot, refreshing it first if the TTL has elapsed.</summary>
    ValueTask<FamilyGraph> GetAsync(CancellationToken cancellationToken);

    /// <summary>Forces an immediate rebuild (re-reads the seed file and the overrides).</summary>
    Task RefreshAsync(CancellationToken cancellationToken);
}
```

- [ ] **Step 3: Create the test time provider helper**

`tests/unit/FamilyTree.UnitTests/Infrastructure/TestTimeProvider.cs`:

```csharp
namespace FamilyTree.UnitTests.Infrastructure;

/// <summary>A TimeProvider whose clock the test moves by hand — no extra package needed.</summary>
internal sealed class TestTimeProvider : TimeProvider
{
    public DateTimeOffset Now { get; set; } = DateTimeOffset.UnixEpoch;

    public override DateTimeOffset GetUtcNow() => Now;

    public void Advance(TimeSpan delta) => Now += delta;
}
```

- [ ] **Step 4: Write the failing tests**

`tests/unit/FamilyTree.UnitTests/Infrastructure/FamilySnapshotProviderTests.cs`:

```csharp
using FamilyTree.Domain;
using FamilyTree.Infrastructure;
using Microsoft.Extensions.Logging.Abstractions;
using Microsoft.Extensions.Options;

namespace FamilyTree.UnitTests.Infrastructure;

public sealed class FamilySnapshotProviderTests
{
    // A loader whose returned graph and call count the test controls.
    private sealed class StubLoader : IFamilyDataLoader
    {
        public FamilyGraph Graph { get; set; } = new([], []);
        public int LoadCount { get; private set; }

        public FamilyGraph Load()
        {
            LoadCount++;
            return Graph;
        }
    }

    private static Person Person(string id, string bioRu) =>
        new()
        {
            Id = id,
            GivenName = new LocalizedText { Ru = id, En = id },
            Surname = new LocalizedText { Ru = id, En = id },
            Birth = new LifeEvent { Year = 1900 },
            Biography = new LocalizedText { Ru = bioRu, Be = bioRu, En = bioRu }
        };

    private static (FamilySnapshotProvider provider, StubLoader loader, InMemoryPersonOverrideStore overrides, TestTimeProvider clock)
        Build(int ttlMinutes = 10)
    {
        var loader = new StubLoader { Graph = new FamilyGraph([Person("p1", "seed")], []) };
        var overrides = new InMemoryPersonOverrideStore();
        var clock = new TestTimeProvider();
        var options = Options.Create(new FamilyDataOptions { SnapshotTtlMinutes = ttlMinutes });
        var provider = new FamilySnapshotProvider(loader, overrides, options, clock, NullLogger<FamilySnapshotProvider>.Instance);
        return (provider, loader, overrides, clock);
    }

    [Fact]
    public async Task GetAsync_WhenOverrideExists_ShouldReturnMergedBiography()
    {
        var (provider, _, overrides, _) = Build();
        await overrides.AppendBiographyAsync("p1", new LocalizedText { Ru = "edited", Be = "edited", En = "edited" }, "e@x", default);

        var graph = await provider.GetAsync(default);

        graph.People.Single().Biography.Ru.Should().Be("edited");
    }

    [Fact]
    public async Task GetAsync_WhenNoOverride_ShouldReturnSeedBiography()
    {
        var (provider, _, _, _) = Build();

        var graph = await provider.GetAsync(default);

        graph.People.Single().Biography.Ru.Should().Be("seed");
    }

    [Fact]
    public async Task GetAsync_WhenWithinTtl_ShouldReuseCacheWithoutReloading()
    {
        var (provider, loader, _, clock) = Build(ttlMinutes: 10);

        await provider.GetAsync(default);
        clock.Advance(TimeSpan.FromMinutes(9));
        await provider.GetAsync(default);

        loader.LoadCount.Should().Be(1);
    }

    [Fact]
    public async Task GetAsync_WhenTtlElapsed_ShouldReloadFromFile()
    {
        var (provider, loader, _, clock) = Build(ttlMinutes: 10);

        await provider.GetAsync(default);
        clock.Advance(TimeSpan.FromMinutes(11));
        loader.Graph = new FamilyGraph([Person("p1", "manually-swapped")], []);
        var graph = await provider.GetAsync(default);

        loader.LoadCount.Should().Be(2);
        graph.People.Single().Biography.Ru.Should().Be("manually-swapped");
    }

    [Fact]
    public async Task RefreshAsync_WhenCalled_ShouldRebuildImmediately()
    {
        var (provider, loader, overrides, _) = Build(ttlMinutes: 10);
        await provider.GetAsync(default);

        await overrides.AppendBiographyAsync("p1", new LocalizedText { Ru = "fresh", Be = "fresh", En = "fresh" }, "e@x", default);
        await provider.RefreshAsync(default);
        var graph = await provider.GetAsync(default);

        loader.LoadCount.Should().Be(2);
        graph.People.Single().Biography.Ru.Should().Be("fresh");
    }
}
```

- [ ] **Step 5: Run the tests to verify they fail**

Run: `dotnet test tests/unit/FamilyTree.UnitTests --filter FullyQualifiedName~FamilySnapshotProviderTests`
Expected: FAIL — `FamilySnapshotProvider` does not exist (compile error).

- [ ] **Step 6: Implement the provider**

`src/backend/FamilyTree.Infrastructure/FamilySnapshotProvider.cs`:

```csharp
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;

namespace FamilyTree.Infrastructure;

/// <summary>
/// Holds one merged <see cref="FamilyGraph"/> (JSON seed + latest biography overrides)
/// and serves every read from it. Rebuilds when the TTL elapses or on an explicit
/// refresh (an editor's save). A rebuild re-reads family.json via <see cref="IFamilyDataLoader"/>
/// and re-pulls overrides, so a manually replaced seed file is also picked up within the TTL.
/// Registered as a singleton; refresh is serialized by a semaphore to avoid a rebuild stampede.
/// </summary>
public sealed class FamilySnapshotProvider : IFamilySnapshotProvider
{
    private readonly IFamilyDataLoader _loader;
    private readonly IPersonOverrideStore _overrides;
    private readonly TimeProvider _timeProvider;
    private readonly ILogger<FamilySnapshotProvider> _logger;
    private readonly TimeSpan _ttl;
    private readonly SemaphoreSlim _refreshLock = new(1, 1);

    private FamilyGraph? _snapshot;
    private DateTimeOffset _builtAt;

    public FamilySnapshotProvider(
        IFamilyDataLoader loader,
        IPersonOverrideStore overrides,
        IOptions<FamilyDataOptions> options,
        TimeProvider timeProvider,
        ILogger<FamilySnapshotProvider> logger)
    {
        _loader = loader;
        _overrides = overrides;
        _timeProvider = timeProvider;
        _logger = logger;
        _ttl = TimeSpan.FromMinutes(Math.Max(1, options.Value.SnapshotTtlMinutes));
    }

    public async ValueTask<FamilyGraph> GetAsync(CancellationToken cancellationToken)
    {
        var current = _snapshot;
        if (current is not null && _timeProvider.GetUtcNow() - _builtAt < _ttl)
        {
            return current;
        }

        return await RebuildAsync(cancellationToken);
    }

    public async Task RefreshAsync(CancellationToken cancellationToken)
    {
        await RebuildAsync(cancellationToken);
    }

    private async Task<FamilyGraph> RebuildAsync(CancellationToken cancellationToken)
    {
        await _refreshLock.WaitAsync(cancellationToken);
        try
        {
            // Another caller may have rebuilt while we waited — re-check the TTL.
            var current = _snapshot;
            if (current is not null && _timeProvider.GetUtcNow() - _builtAt < _ttl)
            {
                return current;
            }

            var seed = _loader.Load();
            var latest = await _overrides.GetLatestBiographiesAsync(cancellationToken);

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
        }
        finally
        {
            _refreshLock.Release();
        }
    }
}
```

- [ ] **Step 7: Run the tests to verify they pass**

Run: `dotnet test tests/unit/FamilyTree.UnitTests --filter FullyQualifiedName~FamilySnapshotProviderTests`
Expected: PASS (5 tests).

- [ ] **Step 8: Commit**

```bash
git add src/backend/FamilyTree.Domain/IFamilySnapshotProvider.cs \
        src/backend/FamilyTree.Infrastructure/FamilySnapshotProvider.cs \
        src/backend/FamilyTree.Infrastructure/FamilyDataOptions.cs \
        src/backend/FamilyTree.Api/Configuration/FamilyDataSettings.cs \
        tests/unit/FamilyTree.UnitTests/Infrastructure/FamilySnapshotProviderTests.cs \
        tests/unit/FamilyTree.UnitTests/Infrastructure/TestTimeProvider.cs
git commit -m "feat: add TTL merged-snapshot family read cache"
```

---

## Task 2: Route repositories through the snapshot; remove FamilyStore; warm at startup

**Files:**
- Modify: `src/backend/FamilyTree.Infrastructure/InMemoryPersonRepository.cs`
- Modify: `src/backend/FamilyTree.Infrastructure/InMemoryUnionRepository.cs`
- Modify: `src/backend/FamilyTree.Infrastructure/InfrastructureServiceCollectionExtensions.cs`
- Modify: `src/backend/FamilyTree.Api/Program.cs`
- Delete: `src/backend/FamilyTree.Infrastructure/FamilyStore.cs`
- Modify (tests): `tests/unit/FamilyTree.UnitTests/Infrastructure/InMemoryRepositoryTests.cs`
- Delete (tests): `tests/unit/FamilyTree.UnitTests/Infrastructure/PersonRepositoryOverlayTests.cs` (its overlay coverage now lives in `FamilySnapshotProviderTests`)

**Interfaces:**
- Consumes: `IFamilySnapshotProvider.GetAsync(ct) → FamilyGraph` (Task 1).
- Produces: `InMemoryPersonRepository(IFamilySnapshotProvider snapshot)`, `InMemoryUnionRepository(IFamilySnapshotProvider snapshot)`; `AddInfrastructure` registers `IFamilySnapshotProvider` (singleton) + `TimeProvider.System` and no longer registers `FamilyStore`.

- [ ] **Step 1: Rewrite the person repository to read from the snapshot**

`src/backend/FamilyTree.Infrastructure/InMemoryPersonRepository.cs`:

```csharp
namespace FamilyTree.Infrastructure;

public sealed class InMemoryPersonRepository : IPersonRepository
{
    private readonly IFamilySnapshotProvider _snapshot;

    public InMemoryPersonRepository(IFamilySnapshotProvider snapshot)
    {
        _snapshot = snapshot;
    }

    public async Task<IReadOnlyList<Person>> GetAllAsync(CancellationToken cancellationToken)
    {
        var graph = await _snapshot.GetAsync(cancellationToken);
        return graph.People;
    }

    public async Task<Person?> GetByIdAsync(string id, CancellationToken cancellationToken)
    {
        var graph = await _snapshot.GetAsync(cancellationToken);
        return graph.People.FirstOrDefault(person => person.Id == id);
    }
}
```

- [ ] **Step 2: Rewrite the union repository to read from the snapshot**

`src/backend/FamilyTree.Infrastructure/InMemoryUnionRepository.cs`:

```csharp
namespace FamilyTree.Infrastructure;

public sealed class InMemoryUnionRepository : IUnionRepository
{
    private readonly IFamilySnapshotProvider _snapshot;

    public InMemoryUnionRepository(IFamilySnapshotProvider snapshot)
    {
        _snapshot = snapshot;
    }

    public async Task<IReadOnlyList<Union>> GetAllAsync(CancellationToken cancellationToken)
    {
        var graph = await _snapshot.GetAsync(cancellationToken);
        return graph.Unions;
    }
}
```

- [ ] **Step 3: Delete FamilyStore**

```bash
git rm src/backend/FamilyTree.Infrastructure/FamilyStore.cs
```

- [ ] **Step 4: Update the DI registration**

In `src/backend/FamilyTree.Infrastructure/InfrastructureServiceCollectionExtensions.cs`, replace the body of `AddInfrastructure` so it registers the snapshot provider + `TimeProvider` and drops `FamilyStore` (Firestore selection is added in Task 8; keep the in-memory stores here for now):

```csharp
using FamilyTree.Domain;
using Microsoft.Extensions.DependencyInjection;

namespace FamilyTree.Infrastructure;

public static class InfrastructureServiceCollectionExtensions
{
    public static IServiceCollection AddInfrastructure(this IServiceCollection services, FamilyDataOptions familyData)
    {
        services.Configure<FamilyDataOptions>(options =>
        {
            options.FilePath = familyData.FilePath;
            options.SnapshotTtlMinutes = familyData.SnapshotTtlMinutes;
        });
        services.AddSingleton(TimeProvider.System);
        services.AddSingleton<IFamilyDataLoader, JsonFamilyDataLoader>();
        services.AddSingleton<IFamilySnapshotProvider, FamilySnapshotProvider>();
        services.AddSingleton<ISessionStore, InMemorySessionStore>();
        services.AddSingleton<IPersonOverrideStore, InMemoryPersonOverrideStore>();
        services.AddScoped<IPersonRepository, InMemoryPersonRepository>();
        services.AddScoped<IUnionRepository, InMemoryUnionRepository>();
        return services;
    }
}
```

- [ ] **Step 5: Warm the snapshot at startup (preserve fail-fast on a bad seed file)**

In `src/backend/FamilyTree.Api/Program.cs`, after `var app = builder.Build();` and before the existing `if (string.IsNullOrWhiteSpace(...ClientId))` block, add an eager rebuild so a missing/invalid `family.json` still fails at startup (as `FamilyStore` used to) and the first request is warm:

```csharp
// Warm the read cache once at startup. This re-reads family.json (fail-fast on a
// missing/invalid seed, mirroring the old eager FamilyStore load) and seeds the cache
// so the first request does not pay the build cost.
await app.Services.GetRequiredService<IFamilySnapshotProvider>().RefreshAsync(CancellationToken.None);
```

Add `using FamilyTree.Domain;` to the `Program.cs` usings if not already present (it is needed for `IFamilySnapshotProvider`).

- [ ] **Step 6: Update the existing repository tests to the new constructors**

Open `tests/unit/FamilyTree.UnitTests/Infrastructure/InMemoryRepositoryTests.cs`. Wherever a test constructs `new FamilyStore(loader)` and passes it to `new InMemoryPersonRepository(...)` / `new InMemoryUnionRepository(...)`, replace that with a real `FamilySnapshotProvider` built from the same loader (so the tests still exercise real read behavior). Use this helper at the top of the test class and call it from each test:

```csharp
using FamilyTree.Infrastructure;
using Microsoft.Extensions.Logging.Abstractions;
using Microsoft.Extensions.Options;

// inside the test class:
private static IFamilySnapshotProvider Snapshot(IFamilyDataLoader loader) =>
    new FamilySnapshotProvider(
        loader,
        new InMemoryPersonOverrideStore(),
        Options.Create(new FamilyDataOptions()),
        TimeProvider.System,
        NullLogger<FamilySnapshotProvider>.Instance);
```

Then `new InMemoryPersonRepository(Snapshot(loader))` and `new InMemoryUnionRepository(Snapshot(loader))`. Delete the now-redundant overlay test file:

```bash
git rm tests/unit/FamilyTree.UnitTests/Infrastructure/PersonRepositoryOverlayTests.cs
```

> If `InMemoryRepositoryTests` references `IFamilySnapshotProvider`, add `using FamilyTree.Domain;`. Read the file first; only the construction sites change — the assertions stay.

- [ ] **Step 7: Build and run the full backend test suite**

Run: `dotnet build && dotnet test`
Expected: PASS — solution compiles (no remaining `FamilyStore` references) and all tests are green.

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "refactor: serve reads from the snapshot cache, retire FamilyStore"
```

---

## Task 3: Refresh the snapshot immediately on a biography save

**Files:**
- Modify: `src/backend/FamilyTree.Application/People/UpdatePersonBiographyHandler.cs`
- Test: `tests/unit/FamilyTree.UnitTests/Application/UpdatePersonBiographyHandlerTests.cs` (existing — add one case)

**Interfaces:**
- Consumes: `IFamilySnapshotProvider.RefreshAsync(ct)` (Task 1, Domain — already referenced by Application).
- Produces: handler constructor gains an `IFamilySnapshotProvider` parameter (after `IPersonOverrideStore`, before `IMapper`).

- [ ] **Step 1: Add the failing test**

Read `tests/unit/FamilyTree.UnitTests/Application/UpdatePersonBiographyHandlerTests.cs` first to match its existing Moq setup style. Add a test asserting the handler refreshes the snapshot after appending, in the right order (append before refresh):

```csharp
[Fact]
public async Task Handle_WhenPersonExists_ShouldRefreshSnapshotAfterAppending()
{
    // Arrange — reuse the file's existing mocks for IFamilyQueryService, IPersonOverrideStore, IMapper.
    // (queryService returns a non-null person for the id; mapper maps both ways.)
    var snapshot = new Mock<IFamilySnapshotProvider>();
    var sequence = new MockSequence();
    overrideStore.InSequence(sequence)
        .Setup(s => s.AppendBiographyAsync(It.IsAny<string>(), It.IsAny<LocalizedText>(), It.IsAny<string>(), It.IsAny<CancellationToken>()))
        .Returns(Task.CompletedTask);
    snapshot.InSequence(sequence)
        .Setup(s => s.RefreshAsync(It.IsAny<CancellationToken>()))
        .Returns(Task.CompletedTask);

    var handler = new UpdatePersonBiographyHandler(
        queryService.Object, overrideStore.Object, snapshot.Object, mapper.Object,
        NullLogger<UpdatePersonBiographyHandler>.Instance);

    await handler.Handle(new UpdatePersonBiographyCommand("p1", biographyDto, "e@x"), default);

    snapshot.Verify(s => s.RefreshAsync(It.IsAny<CancellationToken>()), Times.Once);
}
```

> Adapt the variable names (`overrideStore`, `queryService`, `mapper`, `biographyDto`) to whatever the existing tests already declare. The `using FamilyTree.Domain;` import is needed for `IFamilySnapshotProvider`.

- [ ] **Step 2: Run the test to verify it fails**

Run: `dotnet test tests/unit/FamilyTree.UnitTests --filter FullyQualifiedName~UpdatePersonBiographyHandlerTests`
Expected: FAIL — `UpdatePersonBiographyHandler` has no 5-arg constructor.

- [ ] **Step 3: Add the refresh to the handler**

`src/backend/FamilyTree.Application/People/UpdatePersonBiographyHandler.cs` — inject the provider and refresh after the append:

```csharp
using FamilyTree.Application.Abstractions;
using FamilyTree.Domain;
using Microsoft.Extensions.Logging;

namespace FamilyTree.Application.People;

public sealed class UpdatePersonBiographyHandler : IRequestHandler<UpdatePersonBiographyCommand, PersonDto?>
{
    private readonly IFamilyQueryService _service;
    private readonly IPersonOverrideStore _overrides;
    private readonly IFamilySnapshotProvider _snapshot;
    private readonly IMapper _mapper;
    private readonly ILogger<UpdatePersonBiographyHandler> _logger;

    public UpdatePersonBiographyHandler(
        IFamilyQueryService service,
        IPersonOverrideStore overrides,
        IFamilySnapshotProvider snapshot,
        IMapper mapper,
        ILogger<UpdatePersonBiographyHandler> logger)
    {
        _service = service;
        _overrides = overrides;
        _snapshot = snapshot;
        _mapper = mapper;
        _logger = logger;
    }

    public async Task<PersonDto?> Handle(UpdatePersonBiographyCommand request, CancellationToken cancellationToken)
    {
        var existing = await _service.GetPersonAsync(request.Id, cancellationToken);
        if (existing is null)
        {
            return null;
        }

        var biography = _mapper.Map<LocalizedText>(request.Biography);
        await _overrides.AppendBiographyAsync(request.Id, biography, request.EditorEmail, cancellationToken);

        // Rebuild the read cache now so this editor (and, on a single instance, everyone)
        // sees the change immediately rather than waiting out the TTL.
        await _snapshot.RefreshAsync(cancellationToken);

        var merged = await _service.GetPersonAsync(request.Id, cancellationToken);
        // Do not log the editor email (PII / private information). The authoritative
        // "who edited" is persisted on the override revision, not in application logs.
        _logger.LogInformation("Biography for person {PersonId} updated.", request.Id);
        return merged is null ? null : _mapper.Map<PersonDto>(merged);
    }
}
```

- [ ] **Step 4: Run the handler tests to verify they pass**

Run: `dotnet test tests/unit/FamilyTree.UnitTests --filter FullyQualifiedName~UpdatePersonBiographyHandlerTests`
Expected: PASS (existing cases + the new sequence assertion).

- [ ] **Step 5: Run the integration biography test (end-to-end through the real provider)**

Run: `dotnet test tests/integration/FamilyTree.IntegrationTests --filter FullyQualifiedName~Biography`
Expected: PASS — the follow-up `GET` still reflects the edit (now via the refreshed snapshot, not the per-request overlay).

- [ ] **Step 6: Commit**

```bash
git add src/backend/FamilyTree.Application/People/UpdatePersonBiographyHandler.cs \
        tests/unit/FamilyTree.UnitTests/Application/UpdatePersonBiographyHandlerTests.cs
git commit -m "feat: refresh the read snapshot immediately after a biography save"
```

---

## Task 4: Rotate the session token on sliding renewal

**Files:**
- Modify: `src/backend/FamilyTree.Infrastructure/ISessionStore.cs`
- Modify: `src/backend/FamilyTree.Infrastructure/InMemorySessionStore.cs`
- Modify: `src/backend/FamilyTree.Api/Auth/SessionAuthenticationHandler.cs`
- Modify (tests): `tests/unit/FamilyTree.UnitTests/Infrastructure/InMemorySessionStoreTests.cs`
- Modify (tests): the sliding-renewal test in `tests/integration/FamilyTree.IntegrationTests/Auth/AuthEndpointsTests.cs`

**Interfaces:**
- Consumes: `Session` record; existing `GetAsync`/`CreateAsync`/`DeleteAsync`.
- Produces: `ISessionStore.RotateAsync(string oldToken, DateTimeOffset newExpiresAt, CancellationToken) → Task<string?>` **replaces** `RenewAsync`; returns the new token (the old token is invalidated), or `null` if the session no longer exists.

- [ ] **Step 1: Change the interface**

`src/backend/FamilyTree.Infrastructure/ISessionStore.cs` — replace `RenewAsync` with `RotateAsync`:

```csharp
namespace FamilyTree.Infrastructure;

public interface ISessionStore
{
    Task<string> CreateAsync(Session session, CancellationToken cancellationToken);
    Task<Session?> GetAsync(string token, CancellationToken cancellationToken);

    /// <summary>
    /// Extends a session's expiry and issues a fresh token, invalidating the old one
    /// (rotation on renewal — a leaked-then-renewed token stops working). Returns the
    /// new token, or null if no session matched the old token.
    /// </summary>
    Task<string?> RotateAsync(string oldToken, DateTimeOffset newExpiresAt, CancellationToken cancellationToken);

    Task DeleteAsync(string token, CancellationToken cancellationToken);
}
```

- [ ] **Step 2: Write the failing store test**

In `tests/unit/FamilyTree.UnitTests/Infrastructure/InMemorySessionStoreTests.cs`, replace any `RenewAsync` test with rotation tests:

```csharp
[Fact]
public async Task RotateAsync_WhenSessionExists_ShouldIssueNewTokenAndInvalidateOld()
{
    var store = new InMemorySessionStore();
    var session = new Session
    {
        Email = "e@x", Name = "E", CanEdit = true,
        CreatedAt = DateTimeOffset.UtcNow, ExpiresAt = DateTimeOffset.UtcNow.AddDays(7)
    };
    var oldToken = await store.CreateAsync(session, default);

    var newExpiry = DateTimeOffset.UtcNow.AddDays(7);
    var newToken = await store.RotateAsync(oldToken, newExpiry, default);

    newToken.Should().NotBeNull().And.NotBe(oldToken);
    (await store.GetAsync(oldToken, default)).Should().BeNull();
    var rotated = await store.GetAsync(newToken!, default);
    rotated.Should().NotBeNull();
    rotated!.Email.Should().Be("e@x");
    rotated.ExpiresAt.Should().BeCloseTo(newExpiry, TimeSpan.FromSeconds(1));
}

[Fact]
public async Task RotateAsync_WhenTokenUnknown_ShouldReturnNull()
{
    var store = new InMemorySessionStore();

    var result = await store.RotateAsync("does-not-exist", DateTimeOffset.UtcNow.AddDays(7), default);

    result.Should().BeNull();
}
```

- [ ] **Step 3: Run to verify failure**

Run: `dotnet test tests/unit/FamilyTree.UnitTests --filter FullyQualifiedName~InMemorySessionStoreTests`
Expected: FAIL — `RotateAsync` not defined.

- [ ] **Step 4: Implement rotation in the in-memory store**

In `src/backend/FamilyTree.Infrastructure/InMemorySessionStore.cs`, replace the `RenewAsync` method with `RotateAsync` (the rest of the class is unchanged):

```csharp
public Task<string?> RotateAsync(string oldToken, DateTimeOffset newExpiresAt, CancellationToken cancellationToken)
{
    if (!_sessions.TryRemove(Hash(oldToken), out var session))
    {
        return Task.FromResult<string?>(null);
    }

    var newToken = Base64UrlEncode(RandomNumberGenerator.GetBytes(32));
    _sessions[Hash(newToken)] = session with { ExpiresAt = newExpiresAt };
    return Task.FromResult<string?>(newToken);
}
```

- [ ] **Step 5: Re-set the cookie with the rotated token in the auth handler**

In `src/backend/FamilyTree.Api/Auth/SessionAuthenticationHandler.cs`, replace the sliding-renewal block (the `if (_sessionOptions.SlidingRenewal)` body) so it rotates and re-sets the cookie only when a new token comes back:

```csharp
if (_sessionOptions.SlidingRenewal)
{
    var halfLife = session.CreatedAt + (session.ExpiresAt - session.CreatedAt) / 2;
    if (DateTimeOffset.UtcNow > halfLife)
    {
        var newExpiresAt = DateTimeOffset.UtcNow.AddDays(_sessionOptions.LifetimeDays);
        var rotatedToken = await _store.RotateAsync(token, newExpiresAt, Context.RequestAborted);
        if (rotatedToken is not null)
        {
            Response.Cookies.Append(_sessionOptions.CookieName, rotatedToken, SessionCookie.Build(_sessionOptions));
        }
    }
}
```

Also update the class XML-doc line "extends the expiry and re-sets the cookie" → "rotates the token, extends the expiry, and re-sets the cookie".

- [ ] **Step 6: Update the integration sliding-renewal test**

Open the integration auth test that seeds a past-half-life session and asserts a `Set-Cookie` on the response. Update it to assert the **rotated** cookie value differs from the seeded token (read the file to match its helpers; the assertion becomes: the response sets the session cookie, and its value is not equal to the originally seeded token). If the test cannot observe the seeded token's raw value, assert only that a `Set-Cookie` for the session cookie is present (behavior preserved).

- [ ] **Step 7: Run the unit + integration auth suites**

Run: `dotnet test tests/unit/FamilyTree.UnitTests --filter FullyQualifiedName~SessionStore` then `dotnet test tests/integration/FamilyTree.IntegrationTests --filter FullyQualifiedName~Auth`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "feat: rotate the session token on sliding renewal"
```

---

## Task 5: Firestore config section + options

**Files:**
- Create: `src/backend/FamilyTree.Infrastructure/FirestoreOptions.cs`
- Create: `src/backend/FamilyTree.Api/Configuration/FirestoreSettings.cs`
- Modify: `src/backend/FamilyTree.Api/Configuration/AppSettings.cs`
- Modify: `src/backend/FamilyTree.Api/appsettings.json`
- Test: `tests/integration/FamilyTree.IntegrationTests/AppSettingsBindingTests.cs` (existing — add the Firestore cases here, matching its style)

**Interfaces:**
- Produces: `FirestoreOptions { string ProjectId; string SessionsCollection = "sessions"; string OverridesCollection = "personOverrides" }` (Infrastructure); `FirestoreSettings` (Api) with the same shape; `AppSettings.Firestore`.

- [ ] **Step 1: Create the Infrastructure options**

`src/backend/FamilyTree.Infrastructure/FirestoreOptions.cs`:

```csharp
namespace FamilyTree.Infrastructure;

public sealed class FirestoreOptions
{
    /// <summary>GCP project id. When blank, the in-memory stores are used (local dev / tests).</summary>
    public string ProjectId { get; set; } = "";

    public string SessionsCollection { get; set; } = "sessions";

    public string OverridesCollection { get; set; } = "personOverrides";
}
```

- [ ] **Step 2: Create the Api settings section**

`src/backend/FamilyTree.Api/Configuration/FirestoreSettings.cs`:

```csharp
namespace FamilyTree.Api.Configuration;

public sealed class FirestoreSettings
{
    public string ProjectId { get; init; } = "";

    public string SessionsCollection { get; init; } = "sessions";

    public string OverridesCollection { get; init; } = "personOverrides";
}
```

- [ ] **Step 3: Add it to AppSettings**

`src/backend/FamilyTree.Api/Configuration/AppSettings.cs` — add the property:

```csharp
    public FirestoreSettings Firestore { get; init; } = new();
```

(Place it after `Authentication`.)

- [ ] **Step 4: Add placeholders to appsettings.json**

In `src/backend/FamilyTree.Api/appsettings.json`, add a `FamilyData:SnapshotTtlMinutes` and a `Firestore` section. The `FamilyData` block becomes:

```json
  "FamilyData": {
    "FilePath": "Data/family.json",
    "SnapshotTtlMinutes": 10
  },
```

And add a top-level `Firestore` section (after `Authentication`):

```json
  "Firestore": {
    "_comment": "Leave ProjectId blank for local dev/tests (the in-memory session + override stores are used). In deployment set Firestore__ProjectId to the GCP project id; auth uses Workload Identity (no key). Collection names have sensible defaults.",
    "ProjectId": "",
    "SessionsCollection": "sessions",
    "OverridesCollection": "personOverrides"
  }
```

- [ ] **Step 5: Extend the existing binding tests**

The binding test already lives at `tests/integration/FamilyTree.IntegrationTests/AppSettingsBindingTests.cs`. Add the new keys to its two existing tests (no new file). In `Bind_WhenAllSectionsPresent_ShouldPopulateEveryNestedValue`, add to the in-memory dictionary:

```csharp
                ["FamilyData:SnapshotTtlMinutes"] = "5",
                ["Firestore:ProjectId"] = "my-project",
                ["Firestore:SessionsCollection"] = "s",
                ["Firestore:OverridesCollection"] = "o",
```

and add these assertions:

```csharp
        settings.FamilyData.SnapshotTtlMinutes.Should().Be(5);
        settings.Firestore.ProjectId.Should().Be("my-project");
        settings.Firestore.SessionsCollection.Should().Be("s");
        settings.Firestore.OverridesCollection.Should().Be("o");
```

In `Bind_WhenSectionsMissing_ShouldFallBackToBehaviorPreservingDefaults`, add the default assertions:

```csharp
        settings.FamilyData.SnapshotTtlMinutes.Should().Be(10);
        settings.Firestore.ProjectId.Should().Be("");
        settings.Firestore.SessionsCollection.Should().Be("sessions");
        settings.Firestore.OverridesCollection.Should().Be("personOverrides");
```

- [ ] **Step 6: Run the binding test**

Run: `dotnet test tests/integration/FamilyTree.IntegrationTests --filter FullyQualifiedName~AppSettingsBindingTests`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat: add Firestore config section and options"
```

---

## Task 6: FirestoreSessionStore

**Files:**
- Modify: `Directory.Packages.props`
- Modify: `src/backend/FamilyTree.Infrastructure/FamilyTree.Infrastructure.csproj`
- Create: `src/backend/FamilyTree.Infrastructure/FirestoreSessionStore.cs`

**Interfaces:**
- Consumes: `FirestoreDb` (from `Google.Cloud.Firestore`); `FirestoreOptions`; `ISessionStore` (Task 4 shape — `CreateAsync`, `GetAsync`, `RotateAsync`, `DeleteAsync`); `Session`.
- Produces: `FirestoreSessionStore(FirestoreDb db, IOptions<FirestoreOptions> options, ILogger<FirestoreSessionStore> logger)`.

- [ ] **Step 1: Add the Firestore package (CPM)**

In `Directory.Packages.props`, add under the Google group (use the latest stable `Google.Cloud.Firestore`; verify on nuget.org at execution time — `3.10.0` is known-good):

```xml
    <!-- Firestore (native mode) durable session + override stores in deployment. -->
    <PackageVersion Include="Google.Cloud.Firestore" Version="3.10.0" />
```

In `src/backend/FamilyTree.Infrastructure/FamilyTree.Infrastructure.csproj`, add to the package `ItemGroup`:

```xml
    <PackageReference Include="Google.Cloud.Firestore" />
```

- [ ] **Step 2: Implement the store**

`src/backend/FamilyTree.Infrastructure/FirestoreSessionStore.cs`. It is `[ExcludeFromCodeCoverage]` — it is a thin wrapper over the Firestore SDK and is exercised only against the emulator (optional, not in CI), matching the `GoogleIdTokenValidator` precedent. The document is keyed by `SHA-256(token)` so a store leak never exposes a usable token; rotation deletes the old doc and writes a new one.

```csharp
using System.Diagnostics.CodeAnalysis;
using System.Security.Cryptography;
using System.Text;
using Google.Cloud.Firestore;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;

namespace FamilyTree.Infrastructure;

/// <summary>
/// Firestore-backed revocable session store for deployment. Documents live in the
/// configured collection keyed by SHA-256(token) — a store leak exposes no usable
/// token. Revocation = delete the document. [ExcludeFromCodeCoverage]: a thin SDK
/// wrapper with no testable branching, verified only against the Firestore emulator
/// (optional, not required by CI) — same rationale as GoogleIdTokenValidator.
/// </summary>
[ExcludeFromCodeCoverage]
public sealed class FirestoreSessionStore : ISessionStore
{
    private readonly CollectionReference _sessions;
    private readonly ILogger<FirestoreSessionStore> _logger;

    public FirestoreSessionStore(FirestoreDb db, IOptions<FirestoreOptions> options, ILogger<FirestoreSessionStore> logger)
    {
        _sessions = db.Collection(options.Value.SessionsCollection);
        _logger = logger;
    }

    public async Task<string> CreateAsync(Session session, CancellationToken cancellationToken)
    {
        var token = Base64UrlEncode(RandomNumberGenerator.GetBytes(32));
        await _sessions.Document(Hash(token)).SetAsync(ToDocument(session), cancellationToken: cancellationToken);
        return token;
    }

    public async Task<Session?> GetAsync(string token, CancellationToken cancellationToken)
    {
        var snapshot = await _sessions.Document(Hash(token)).GetSnapshotAsync(cancellationToken);
        if (!snapshot.Exists)
        {
            return null;
        }

        var session = FromDocument(snapshot);
        return session.ExpiresAt <= DateTimeOffset.UtcNow ? null : session;
    }

    public async Task<string?> RotateAsync(string oldToken, DateTimeOffset newExpiresAt, CancellationToken cancellationToken)
    {
        var oldDoc = _sessions.Document(Hash(oldToken));
        var snapshot = await oldDoc.GetSnapshotAsync(cancellationToken);
        if (!snapshot.Exists)
        {
            return null;
        }

        var session = FromDocument(snapshot) with { ExpiresAt = newExpiresAt };
        var newToken = Base64UrlEncode(RandomNumberGenerator.GetBytes(32));
        await _sessions.Document(Hash(newToken)).SetAsync(ToDocument(session), cancellationToken: cancellationToken);
        await oldDoc.DeleteAsync(cancellationToken: cancellationToken);
        return newToken;
    }

    public Task DeleteAsync(string token, CancellationToken cancellationToken)
    {
        return _sessions.Document(Hash(token)).DeleteAsync(cancellationToken: cancellationToken);
    }

    private static Dictionary<string, object> ToDocument(Session session) => new()
    {
        ["email"] = session.Email,
        ["name"] = session.Name,
        ["canEdit"] = session.CanEdit,
        ["createdAt"] = session.CreatedAt.UtcDateTime,
        ["expiresAt"] = session.ExpiresAt.UtcDateTime
    };

    private static Session FromDocument(DocumentSnapshot doc) => new()
    {
        Email = doc.GetValue<string>("email"),
        Name = doc.GetValue<string>("name"),
        CanEdit = doc.GetValue<bool>("canEdit"),
        CreatedAt = doc.GetValue<DateTime>("createdAt"),
        ExpiresAt = doc.GetValue<DateTime>("expiresAt")
    };

    private static string Hash(string token)
    {
        var bytes = SHA256.HashData(Encoding.UTF8.GetBytes(token));
        return Convert.ToHexString(bytes);
    }

    private static string Base64UrlEncode(byte[] bytes) =>
        Convert.ToBase64String(bytes).TrimEnd('=').Replace('+', '-').Replace('/', '_');
}
```

- [ ] **Step 3: Build to verify the package resolves and the type compiles**

Run: `dotnet build src/backend/FamilyTree.Infrastructure`
Expected: PASS (Firestore package restored; no compile errors). If `3.10.0` fails to restore, update the `PackageVersion` to the latest stable on nuget.org and rebuild.

- [ ] **Step 4: Commit**

```bash
git add Directory.Packages.props \
        src/backend/FamilyTree.Infrastructure/FamilyTree.Infrastructure.csproj \
        src/backend/FamilyTree.Infrastructure/FirestoreSessionStore.cs
git commit -m "feat: add Firestore session store"
```

---

## Task 7: FirestorePersonOverrideStore

**Files:**
- Create: `src/backend/FamilyTree.Infrastructure/FirestorePersonOverrideStore.cs`

**Interfaces:**
- Consumes: `FirestoreDb`; `FirestoreOptions`; `IPersonOverrideStore` (Domain — `AppendBiographyAsync`, `GetLatestBiographyAsync`, `GetLatestBiographiesAsync`); `LocalizedText`.
- Produces: `FirestorePersonOverrideStore(FirestoreDb db, IOptions<FirestoreOptions> options, ILogger<FirestorePersonOverrideStore> logger)`.

- [ ] **Step 1: Implement the store**

`src/backend/FamilyTree.Infrastructure/FirestorePersonOverrideStore.cs`. One document per person in the configured collection, holding an append-only `versions` array (newest last); reads take the latest. `[ExcludeFromCodeCoverage]` for the same reason as Task 6.

```csharp
using System.Diagnostics.CodeAnalysis;
using FamilyTree.Domain;
using Google.Cloud.Firestore;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;

namespace FamilyTree.Infrastructure;

/// <summary>
/// Firestore-backed append-only person-override store for deployment. One document per
/// person holds a "versions" array (newest last), each { biographyRu/Be/En, editorEmail,
/// editedAt }; reads take the latest. [ExcludeFromCodeCoverage]: thin SDK wrapper,
/// emulator-verified only (optional, not required by CI) — same rationale as Task 6.
/// </summary>
[ExcludeFromCodeCoverage]
public sealed class FirestorePersonOverrideStore : IPersonOverrideStore
{
    private readonly CollectionReference _overrides;
    private readonly ILogger<FirestorePersonOverrideStore> _logger;

    public FirestorePersonOverrideStore(FirestoreDb db, IOptions<FirestoreOptions> options, ILogger<FirestorePersonOverrideStore> logger)
    {
        _overrides = db.Collection(options.Value.OverridesCollection);
        _logger = logger;
    }

    public async Task AppendBiographyAsync(string personId, LocalizedText biography, string editorEmail, CancellationToken cancellationToken)
    {
        var version = new Dictionary<string, object>
        {
            ["biographyRu"] = biography.Ru,
            ["biographyBe"] = biography.Be,
            ["biographyEn"] = biography.En,
            ["editorEmail"] = editorEmail,
            ["editedAt"] = DateTime.UtcNow
        };

        await _overrides.Document(personId).SetAsync(
            new Dictionary<string, object> { ["versions"] = FieldValue.ArrayUnion(version) },
            SetOptions.MergeAll,
            cancellationToken);
    }

    public async Task<LocalizedText?> GetLatestBiographyAsync(string personId, CancellationToken cancellationToken)
    {
        var snapshot = await _overrides.Document(personId).GetSnapshotAsync(cancellationToken);
        return snapshot.Exists ? LatestFrom(snapshot) : null;
    }

    public async Task<IReadOnlyDictionary<string, LocalizedText>> GetLatestBiographiesAsync(CancellationToken cancellationToken)
    {
        var result = new Dictionary<string, LocalizedText>(StringComparer.Ordinal);
        var snapshot = await _overrides.GetSnapshotAsync(cancellationToken);
        foreach (var doc in snapshot.Documents)
        {
            var latest = LatestFrom(doc);
            if (latest is not null)
            {
                result[doc.Id] = latest;
            }
        }

        return result;
    }

    private static LocalizedText? LatestFrom(DocumentSnapshot doc)
    {
        if (!doc.TryGetValue<List<Dictionary<string, object>>>("versions", out var versions) || versions.Count == 0)
        {
            return null;
        }

        var latest = versions[^1];
        return new LocalizedText
        {
            Ru = (string)latest["biographyRu"],
            Be = (string)latest["biographyBe"],
            En = (string)latest["biographyEn"]
        };
    }
}
```

- [ ] **Step 2: Build to verify it compiles**

Run: `dotnet build src/backend/FamilyTree.Infrastructure`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/backend/FamilyTree.Infrastructure/FirestorePersonOverrideStore.cs
git commit -m "feat: add Firestore person-override store"
```

---

## Task 8: Select Firestore vs in-memory stores by config

**Files:**
- Modify: `src/backend/FamilyTree.Infrastructure/InfrastructureServiceCollectionExtensions.cs`
- Modify: `src/backend/FamilyTree.Api/Program.cs`
- Test: `tests/unit/FamilyTree.UnitTests/Infrastructure/InfrastructureSelectionTests.cs`

**Interfaces:**
- Consumes: `FirestoreOptions` (Task 5); `FirestoreSessionStore` / `FirestorePersonOverrideStore` (Tasks 6–7); `FirestoreDb`.
- Produces: `AddInfrastructure(this IServiceCollection, FamilyDataOptions familyData, FirestoreOptions firestore)` — a **second parameter**. When `firestore.ProjectId` is non-blank it registers the Firestore stores + a `FirestoreDb` singleton; otherwise the in-memory stores.

- [ ] **Step 1: Write the failing selection tests**

`tests/unit/FamilyTree.UnitTests/Infrastructure/InfrastructureSelectionTests.cs`. The tests assert the **registered implementation type** via the `ServiceDescriptor` — they never resolve the Firestore store (which would touch the network):

```csharp
using FamilyTree.Infrastructure;
using Microsoft.Extensions.DependencyInjection;

namespace FamilyTree.UnitTests.Infrastructure;

public sealed class InfrastructureSelectionTests
{
    private static ServiceDescriptor Descriptor<TService>(IServiceCollection services) =>
        services.Last(d => d.ServiceType == typeof(TService));

    [Fact]
    public void AddInfrastructure_WhenFirestoreProjectIdBlank_ShouldRegisterInMemoryStores()
    {
        var services = new ServiceCollection();

        services.AddInfrastructure(new FamilyDataOptions(), new FirestoreOptions { ProjectId = "" });

        Descriptor<ISessionStore>(services).ImplementationType.Should().Be(typeof(InMemorySessionStore));
        Descriptor<IPersonOverrideStore>(services).ImplementationType.Should().Be(typeof(InMemoryPersonOverrideStore));
    }

    [Fact]
    public void AddInfrastructure_WhenFirestoreProjectIdSet_ShouldRegisterFirestoreStores()
    {
        var services = new ServiceCollection();

        services.AddInfrastructure(new FamilyDataOptions(), new FirestoreOptions { ProjectId = "proj" });

        Descriptor<ISessionStore>(services).ImplementationType.Should().Be(typeof(FirestoreSessionStore));
        Descriptor<IPersonOverrideStore>(services).ImplementationType.Should().Be(typeof(FirestorePersonOverrideStore));
    }
}
```

> `IPersonOverrideStore` lives in `FamilyTree.Domain`; add `using FamilyTree.Domain;` if the analyzer asks.

- [ ] **Step 2: Run to verify failure**

Run: `dotnet test tests/unit/FamilyTree.UnitTests --filter FullyQualifiedName~InfrastructureSelectionTests`
Expected: FAIL — `AddInfrastructure` has no 2-parameter overload.

- [ ] **Step 3: Implement selection**

`src/backend/FamilyTree.Infrastructure/InfrastructureServiceCollectionExtensions.cs`:

```csharp
using FamilyTree.Domain;
using Google.Cloud.Firestore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Options;

namespace FamilyTree.Infrastructure;

public static class InfrastructureServiceCollectionExtensions
{
    public static IServiceCollection AddInfrastructure(
        this IServiceCollection services,
        FamilyDataOptions familyData,
        FirestoreOptions firestore)
    {
        services.Configure<FamilyDataOptions>(options =>
        {
            options.FilePath = familyData.FilePath;
            options.SnapshotTtlMinutes = familyData.SnapshotTtlMinutes;
        });
        services.Configure<FirestoreOptions>(options =>
        {
            options.ProjectId = firestore.ProjectId;
            options.SessionsCollection = firestore.SessionsCollection;
            options.OverridesCollection = firestore.OverridesCollection;
        });

        services.AddSingleton(TimeProvider.System);
        services.AddSingleton<IFamilyDataLoader, JsonFamilyDataLoader>();
        services.AddSingleton<IFamilySnapshotProvider, FamilySnapshotProvider>();

        if (string.IsNullOrWhiteSpace(firestore.ProjectId))
        {
            services.AddSingleton<ISessionStore, InMemorySessionStore>();
            services.AddSingleton<IPersonOverrideStore, InMemoryPersonOverrideStore>();
        }
        else
        {
            services.AddSingleton(_ => FirestoreDb.Create(firestore.ProjectId));
            services.AddSingleton<ISessionStore, FirestoreSessionStore>();
            services.AddSingleton<IPersonOverrideStore, FirestorePersonOverrideStore>();
        }

        services.AddScoped<IPersonRepository, InMemoryPersonRepository>();
        services.AddScoped<IUnionRepository, InMemoryUnionRepository>();
        return services;
    }
}
```

- [ ] **Step 4: Pass Firestore config from Program.cs**

In `src/backend/FamilyTree.Api/Program.cs`, update the `AddInfrastructure` call to pass the Firestore options mapped from `appSettings`:

```csharp
builder.Services.AddInfrastructure(
    new FamilyDataOptions
    {
        FilePath = appSettings.FamilyData.FilePath,
        SnapshotTtlMinutes = appSettings.FamilyData.SnapshotTtlMinutes
    },
    new FirestoreOptions
    {
        ProjectId = appSettings.Firestore.ProjectId,
        SessionsCollection = appSettings.Firestore.SessionsCollection,
        OverridesCollection = appSettings.Firestore.OverridesCollection
    });
```

- [ ] **Step 5: Run the selection tests + full backend build/test**

Run: `dotnet build && dotnet test`
Expected: PASS — selection tests green; whole suite green (local config has a blank `ProjectId`, so the in-memory stores are used and nothing touches the network).

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat: select Firestore stores when a project id is configured"
```

---

## Task 9: Documentation

**Files:**
- Modify: relevant page(s) under `docs/reference/` (data/persistence and auth/session pages)
- Modify: `README.md` (overview paragraph)
- Modify: `CLAUDE.md` (Project overview paragraph)

**Interfaces:** none (docs only).

- [ ] **Step 1: Run the docs skill to find the impacted pages**

Invoke the `update-docs-for-pr` skill. It identifies which `docs/reference/` pages cover observable behavior changed on this branch. The behavior to document:
- Reads are served from an **in-memory merged snapshot** (JSON seed + latest biography overrides) with a **10-minute TTL**; an editor's save refreshes it immediately; a manually replaced `family.json` is picked up within the TTL (single Cloud Run instance, so no cross-instance staleness).
- In deployment, sessions and overrides persist in **Firestore** (native mode) — selected when `Firestore:ProjectId` is set; local dev/tests stay in-memory. No DB password (Workload Identity).
- The session token now **rotates on sliding renewal** (a renewed session gets a fresh cookie value; the old token stops working). 7-day sliding lifetime unchanged.

- [ ] **Step 2: Update `docs/reference/` pages**

Apply the changes the skill surfaces — document the snapshot/TTL read model, the Firestore-vs-in-memory selection, the new config keys (`FamilyData:SnapshotTtlMinutes`, `Firestore:ProjectId`/`SessionsCollection`/`OverridesCollection`), and token rotation. Keep the live-vs-roadmap callouts honest (Firestore is live only when `ProjectId` is configured in deployment).

- [ ] **Step 3: Update the README + CLAUDE overview**

In `README.md` and `CLAUDE.md`, adjust the overview so it notes that editor edits are **durable** (Firestore-backed in deployment) and served via a cached snapshot — replacing any wording that implies edits are in-memory only.

- [ ] **Step 4: Commit**

```bash
git add docs/reference README.md CLAUDE.md
git commit -m "docs: document Firestore-backed durable edits and the snapshot read cache"
```

---

## Final verification (before opening the PR)

- [ ] **Full backend build + test:** `dotnet build && dotnet test` → all green.
- [ ] **Frontend untouched but gate it anyway:** `npm --prefix src/frontend run build && npm --prefix src/frontend test` → green (no frontend changes in this PR, but CI runs it).
- [ ] **Coverage sanity:** confirm the two Firestore classes carry `[ExcludeFromCodeCoverage]`; everything else (snapshot cache, rotation, selection, config binding) has tests. This keeps codecov/patch green.
- [ ] **No secrets/PII committed:** `appsettings.json` Firestore `ProjectId` is blank; no emails/tokens in logs (the snapshot logs counts only; rotation logs nothing identifying).
- [ ] **Open the PR into `main`** with a title describing the idea (e.g. *"Persist editor edits in Firestore behind a cached snapshot read-path"*), run the `update-docs-for-pr` skill at PR time, and **stop** — the owner reviews and squash-merges. Do not self-merge.

---

## Notes / risks

- **Token-rotation concurrency:** rotation deletes the old token and writes a new one. Two in-flight requests sharing the same pre-rotation cookie could race (the second sees the old token already gone → `401`, prompting a re-auth). Renewal only fires past the half-life (~every 3.5 days), and browsers serialize cookie updates per origin, so this is vanishingly rare for a single editor — acceptable for this app. Documented here so a reviewer can weigh it.
- **Firestore impls are emulator-verified only.** They are `[ExcludeFromCodeCoverage]` thin SDK wrappers with no branching logic worth unit-testing without a live backend; the spec marks emulator coverage optional and not required by CI. The risk surface (selection, merge, rotation, config) is fully unit-tested.
- **Snapshot warm-up at startup** restores the fail-fast-on-bad-seed behavior that the removed eager `FamilyStore` load provided.
- **Out of scope (later PRs):** frontend sign-in UI (PR-c); deploy config — enabling Firestore in GCP, Workload Identity datastore access, env vars, budget alert, `UseForwardedHeaders` (PR-d).
