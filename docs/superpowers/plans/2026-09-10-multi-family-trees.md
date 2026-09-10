# Multi-Family Trees Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a visitor switch between several family trees, and jump from a member card to the family tree that person came from or married into.

**Architecture:** Each family is its own seed file, listed in a `families.json` registry beside the seeds. A `FamilySnapshotRegistry` hands out one existing-and-unchanged `FamilySnapshotProvider` per family. The family travels through the request as a **scoped `IFamilyContext`**, and `IFamilySnapshotProvider` becomes a scoped registration resolved from it — so every repository, query service, and MediatR handler keeps working untouched. API routes gain a `/api/families/{familyId}/…` form with the current routes aliased to the default family; the SPA mirrors this with `/f/:familyId` route variants.

**Tech Stack:** .NET 10 (ASP.NET Core controllers, MediatR, Mapster, xUnit + Moq + AwesomeAssertions), Vue 3 + TypeScript (Pinia, Vue Router, vue-i18n, Vitest).

**Spec:** [`docs/superpowers/specs/2026-09-10-multi-family-trees-design.md`](../specs/2026-09-10-multi-family-trees-design.md)

## Global Constraints

- **Default family keeps bare storage keys forever.** `OverrideKey(default, "p-0001") == "p-0001"`; only non-default families are prefixed. No migration of existing Firestore or R2 data.
- **Existing routes must not change behaviour.** `/api/family/graph` and `/api/people/…` stay, resolving to the default family. Existing frontend URLs (`/`, `/chronicle`, `/members/:slug?`, `/person/:slug`) stay.
- **No registry file → single-family fallback.** The API synthesizes a one-family registry (id `default`) from `FamilyData:Source`, so local dev, tests, and the current deployment keep working with no new file.
- **Family id format:** `^[a-z0-9-]+$`. Duplicate ids or an unknown `defaultFamily` fail startup with `LogError` + throw.
- **`FamilySnapshotProvider` internals are off-limits.** Its refresh lock, TTL, last-good fallback, and failure counter are not modified by any task in this plan.
- **C# conventions:** file-scoped namespaces, `_camelCase` private readonly fields, `Async` suffix, `CancellationToken` last, always brace, structured logging with named placeholders, never log PII.
- **Test naming (C#):** `<MethodName>_When<Conditions>_Should<ExpectedResult>`.
- **Frontend focused test command:** `npm --prefix src/frontend test -- run <path>` (a bare `npm exec vitest` resolves the wrong root and breaks `.vue` imports).
- **Commit after every task.** Branch: `claude/family-tree-switching-ee48f8`. Do not open or merge a PR — the owner reviews.

## File Structure

**Backend — new files**

| File | Responsibility |
|---|---|
| `src/backend/FamilyTree.Domain/FamilyRegistry.cs` | `FamilyRegistry` / `FamilyRegistryEntry` records; lookup and default resolution |
| `src/backend/FamilyTree.Domain/FamilyLink.cs` | `FamilyLink` record + `FamilyLinkRelation` enum |
| `src/backend/FamilyTree.Domain/StorageKeys.cs` | `OverrideKey` / media-prefix helpers (the one home of the default-is-bare rule) |
| `src/backend/FamilyTree.Domain/IFamilyContext.cs` | Scoped "which family is this request about" |
| `src/backend/FamilyTree.Infrastructure/FamilyRegistryFile.cs` | JSON shape of `families.json` |
| `src/backend/FamilyTree.Infrastructure/FamilyRegistryLoader.cs` | Reads + validates the registry; synthesizes the fallback |
| `src/backend/FamilyTree.Infrastructure/FamilyDataLoaderFactory.cs` | Picks the GCS or JSON loader per family source |
| `src/backend/FamilyTree.Infrastructure/FamilySnapshotRegistry.cs` | One provider per family, lazily created |
| `src/backend/FamilyTree.Infrastructure/SeedMediaExpander.cs` | Rewrites a non-default family's bare media names to prefixed keys |
| `src/backend/FamilyTree.Api/Controllers/FamiliesController.cs` | `GET /api/families` + family-scoped graph/people routes |
| `src/backend/FamilyTree.Api/Family/FamilyContextMiddleware.cs` | Sets `IFamilyContext` from the route, 404s an unknown id |

**Backend — modified**

`FamilyDataSettings.cs`, `FamilyDataOptions.cs`, `Person.cs`, `PersonDto.cs`, `PersonSummaryDto.cs`, `IPersonOverrideStore.cs` + both implementations, `MediaKeyGenerator.cs`, `AddPersonPhotoHandler.cs`, `FamilySnapshotProvider.cs` (constructor + link filtering + media expansion only), `InfrastructureServiceCollectionExtensions.cs`, `Program.cs`, `FamilyDataHealthCheck.cs`, `FamilyController.cs`, `PeopleController.cs`.

**Frontend — new files**

| File | Responsibility |
|---|---|
| `src/frontend/src/api/familiesApi.ts` | `fetchFamilies()` |
| `src/frontend/src/stores/familiesStore.ts` | Registry list + `activeFamilyId` |
| `src/frontend/src/router/familyRoutes.ts` | Builds the bare + `/f/:familyId` route pairs, resolves the active id |
| `src/frontend/src/components/FamilySwitcher.vue` | The settings-panel family list |

**Frontend — modified**

`types/family.ts`, `api/familyApi.ts`, `stores/familyStore.ts`, `stores/selectionStore.ts`, `router/index.ts`, `router/firstVisit.ts`, `components/PersonHeader.vue`, `components/SettingsPanel.vue`, `views/TreeView.vue`, `views/ChronicleView.vue`, `views/MembersView.vue`, `i18n/messages/{ru,be,en}.ts`.

---

## Phase A — Backend

### Task 1: The family registry model and loader

**Files:**
- Create: `src/backend/FamilyTree.Domain/FamilyRegistry.cs`
- Create: `src/backend/FamilyTree.Infrastructure/FamilyRegistryFile.cs`
- Create: `src/backend/FamilyTree.Infrastructure/FamilyRegistryLoader.cs`
- Modify: `src/backend/FamilyTree.Api/Configuration/FamilyDataSettings.cs`
- Modify: `src/backend/FamilyTree.Infrastructure/FamilyDataOptions.cs`
- Test: `tests/unit/FamilyTree.UnitTests/Infrastructure/FamilyRegistryLoaderTests.cs`

**Interfaces:**
- Consumes: `LocalizedText` (existing, `FamilyTree.Domain`), `JsonFamilyDataLoader.Deserialize` (existing pattern for `JsonSerializerDefaults.Web`).
- Produces:
  - `sealed record FamilyRegistryEntry(string Id, string Source, LocalizedText Name, string? MediaPrefix)`
  - `sealed record FamilyRegistry(IReadOnlyList<FamilyRegistryEntry> Families, string DefaultFamilyId)` with
    `bool Contains(string familyId)`, `FamilyRegistryEntry? Find(string familyId)`,
    `FamilyRegistryEntry Default`, `bool IsDefault(string familyId)`,
    `string MediaPrefixFor(string familyId)`
  - `interface IFamilyRegistryProvider { ValueTask<FamilyRegistry> GetAsync(CancellationToken cancellationToken); }`
  - `sealed class FamilyRegistryLoader : IFamilyRegistryProvider`

- [ ] **Step 1: Write the failing tests**

Create `tests/unit/FamilyTree.UnitTests/Infrastructure/FamilyRegistryLoaderTests.cs`:

```csharp
using System.Text.Json;
using FamilyTree.Domain;
using FamilyTree.Infrastructure;

namespace FamilyTree.UnitTests.Infrastructure;

public sealed class FamilyRegistryLoaderTests
{
    private const string TwoFamilies = """
    {
      "defaultFamily": "perovsky",
      "families": [
        { "id": "perovsky", "source": "family.json", "name": { "en": "Perovsky" } },
        { "id": "kowalski", "source": "kowalski.json", "mediaPrefix": "portraits/kw",
          "name": { "en": "Kowalski" } }
      ]
    }
    """;

    [Fact]
    public void Parse_WhenRegistryListsTwoFamilies_ShouldExposeBothAndTheDefault()
    {
        var registry = FamilyRegistryLoader.Parse(TwoFamilies);

        registry.Families.Should().HaveCount(2);
        registry.DefaultFamilyId.Should().Be("perovsky");
        registry.IsDefault("perovsky").Should().BeTrue();
        registry.IsDefault("kowalski").Should().BeFalse();
        registry.Find("kowalski")!.Source.Should().Be("kowalski.json");
    }

    [Fact]
    public void Parse_WhenFamilyOmitsMediaPrefix_ShouldDeriveItFromTheId()
    {
        var registry = FamilyRegistryLoader.Parse(TwoFamilies);

        registry.MediaPrefixFor("kowalski").Should().Be("portraits/kw");
        registry.MediaPrefixFor("perovsky").Should().Be("portraits");
    }

    [Fact]
    public void Parse_WhenDefaultFamilyIsNotListed_ShouldThrow()
    {
        var json = """
        { "defaultFamily": "missing",
          "families": [ { "id": "perovsky", "source": "family.json", "name": { "en": "P" } } ] }
        """;

        var act = () => FamilyRegistryLoader.Parse(json);

        act.Should().Throw<InvalidOperationException>().WithMessage("*missing*");
    }

    [Fact]
    public void Parse_WhenTwoFamiliesShareAnId_ShouldThrow()
    {
        var json = """
        { "defaultFamily": "a",
          "families": [ { "id": "a", "source": "a.json", "name": { "en": "A" } },
                        { "id": "a", "source": "b.json", "name": { "en": "B" } } ] }
        """;

        var act = () => FamilyRegistryLoader.Parse(json);

        act.Should().Throw<InvalidOperationException>().WithMessage("*duplicate*");
    }

    [Theory]
    [InlineData("Perovsky")]
    [InlineData("per ovsky")]
    [InlineData("per/ovsky")]
    [InlineData("")]
    public void Parse_WhenFamilyIdIsNotSlugShaped_ShouldThrow(string id)
    {
        var json = JsonSerializer.Serialize(new
        {
            defaultFamily = id,
            families = new[] { new { id, source = "a.json", name = new { en = "A" } } }
        });

        var act = () => FamilyRegistryLoader.Parse(json);

        act.Should().Throw<InvalidOperationException>();
    }

    [Fact]
    public void Parse_WhenFamilyHasNoSource_ShouldThrow()
    {
        var json = """
        { "defaultFamily": "a", "families": [ { "id": "a", "name": { "en": "A" } } ] }
        """;

        var act = () => FamilyRegistryLoader.Parse(json);

        act.Should().Throw<InvalidOperationException>().WithMessage("*source*");
    }

    [Fact]
    public void Single_WhenNoRegistryFileExists_ShouldSynthesizeTheDefaultFamilyFromTheSeedSource()
    {
        var registry = FamilyRegistry.Single("Data/family.json");

        registry.Families.Should().HaveCount(1);
        registry.DefaultFamilyId.Should().Be("default");
        registry.Default.Source.Should().Be("Data/family.json");
        registry.IsDefault("default").Should().BeTrue();
        registry.MediaPrefixFor("default").Should().Be("portraits");
    }
}
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `dotnet test tests/unit/FamilyTree.UnitTests --filter FamilyRegistryLoaderTests`
Expected: FAIL — `FamilyRegistryLoader` and `FamilyRegistry` do not exist (compile error).

- [ ] **Step 3: Write the domain model**

Create `src/backend/FamilyTree.Domain/FamilyRegistry.cs`:

```csharp
namespace FamilyTree.Domain;

/// <summary>One family tree available to the app: its id, seed source, display name,
/// and optional media key prefix.</summary>
public sealed record FamilyRegistryEntry(string Id, string Source, LocalizedText Name, string? MediaPrefix);

/// <summary>The set of family trees the app serves, plus which one is the default.
/// The default family is the one whose URLs and storage keys carry no family segment.</summary>
public sealed record FamilyRegistry(IReadOnlyList<FamilyRegistryEntry> Families, string DefaultFamilyId)
{
    /// <summary>The id used for the synthesized single-family registry when no
    /// <c>families.json</c> is configured.</summary>
    public const string SyntheticId = "default";

    private const string DefaultMediaPrefix = "portraits";

    public FamilyRegistryEntry Default =>
        Find(DefaultFamilyId) ?? throw new InvalidOperationException($"Default family '{DefaultFamilyId}' is not registered.");

    public FamilyRegistryEntry? Find(string familyId) =>
        Families.FirstOrDefault(family => family.Id == familyId);

    public bool Contains(string familyId) => Find(familyId) is not null;

    public bool IsDefault(string familyId) => familyId == DefaultFamilyId;

    /// <summary>The R2 key prefix under which this family's seed media lives. The default
    /// family keeps the historical bare <c>portraits</c> prefix.</summary>
    public string MediaPrefixFor(string familyId)
    {
        var entry = Find(familyId);
        if (entry?.MediaPrefix is { Length: > 0 } configured)
        {
            return configured;
        }

        return IsDefault(familyId) ? DefaultMediaPrefix : $"{DefaultMediaPrefix}/{familyId}";
    }

    /// <summary>Builds the one-family registry used when no registry file is configured,
    /// so a single-family deployment keeps working with no new file.</summary>
    public static FamilyRegistry Single(string source) =>
        new([new FamilyRegistryEntry(SyntheticId, source, new LocalizedText(), null)], SyntheticId);
}
```

- [ ] **Step 4: Write the file shape and the loader**

Create `src/backend/FamilyTree.Infrastructure/FamilyRegistryFile.cs`:

```csharp
namespace FamilyTree.Infrastructure;

internal sealed record FamilyRegistryFile
{
    public string? DefaultFamily { get; init; }
    public IReadOnlyList<FamilyRegistryFileEntry> Families { get; init; } = [];
}

internal sealed record FamilyRegistryFileEntry
{
    public string? Id { get; init; }
    public string? Source { get; init; }
    public LocalizedText? Name { get; init; }
    public string? MediaPrefix { get; init; }
}
```

Create `src/backend/FamilyTree.Infrastructure/FamilyRegistryLoader.cs`:

```csharp
using System.Text.Json;
using System.Text.RegularExpressions;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;

namespace FamilyTree.Infrastructure;

/// <summary>
/// Loads <c>families.json</c> once at first use and caches it for the process lifetime —
/// the registry names the seeds, so changing it is a deployment-level act, unlike the seed
/// contents (which refresh on the snapshot TTL). Falls back to a synthesized one-family
/// registry when no registry path is configured.
/// </summary>
public sealed class FamilyRegistryLoader : IFamilyRegistryProvider
{
    private static readonly JsonSerializerOptions SerializerOptions = new(JsonSerializerDefaults.Web);
    private static readonly Regex IdPattern = new("^[a-z0-9-]+$", RegexOptions.Compiled);

    private readonly FamilyDataOptions _options;
    private readonly IRegistryFileReader _reader;
    private readonly ILogger<FamilyRegistryLoader> _logger;
    private readonly SemaphoreSlim _loadLock = new(1, 1);
    private FamilyRegistry? _cached;

    public FamilyRegistryLoader(
        IOptions<FamilyDataOptions> options,
        IRegistryFileReader reader,
        ILogger<FamilyRegistryLoader> logger)
    {
        _options = options.Value;
        _reader = reader;
        _logger = logger;
    }

    public async ValueTask<FamilyRegistry> GetAsync(CancellationToken cancellationToken)
    {
        var cached = _cached;
        if (cached is not null)
        {
            return cached;
        }

        await _loadLock.WaitAsync(cancellationToken);
        try
        {
            if (_cached is not null)
            {
                return _cached;
            }

            if (string.IsNullOrWhiteSpace(_options.Registry))
            {
                _logger.LogInformation("No family registry configured; serving a single family from the seed source.");
                _cached = FamilyRegistry.Single(_options.Source);
                return _cached;
            }

            var json = await _reader.ReadAsync(_options.Registry, cancellationToken);
            try
            {
                _cached = Parse(json);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Family registry at '{Registry}' is invalid.", _options.Registry);
                throw;
            }

            _logger.LogInformation("Family registry loaded ({FamilyCount} families, default '{DefaultFamily}').",
                _cached.Families.Count, _cached.DefaultFamilyId);
            return _cached;
        }
        finally
        {
            _loadLock.Release();
        }
    }

    /// <summary>Parses and validates registry JSON. Throws <see cref="InvalidOperationException"/>
    /// on any malformed entry so a bad registry fails startup rather than serving half a site.</summary>
    public static FamilyRegistry Parse(string json)
    {
        var file = JsonSerializer.Deserialize<FamilyRegistryFile>(json, SerializerOptions)
            ?? throw new InvalidOperationException("Family registry deserialized to null.");

        if (file.Families.Count == 0)
        {
            throw new InvalidOperationException("Family registry lists no families.");
        }

        var entries = new List<FamilyRegistryEntry>(file.Families.Count);
        var seen = new HashSet<string>(StringComparer.Ordinal);
        foreach (var entry in file.Families)
        {
            var id = entry.Id ?? "";
            if (!IdPattern.IsMatch(id))
            {
                throw new InvalidOperationException($"Family id '{id}' must match ^[a-z0-9-]+$.");
            }
            if (string.IsNullOrWhiteSpace(entry.Source))
            {
                throw new InvalidOperationException($"Family '{id}' has no source.");
            }
            if (!seen.Add(id))
            {
                throw new InvalidOperationException($"Family registry has a duplicate id '{id}'.");
            }

            entries.Add(new FamilyRegistryEntry(id, entry.Source, entry.Name ?? new LocalizedText(), entry.MediaPrefix));
        }

        var defaultId = file.DefaultFamily ?? "";
        if (entries.All(family => family.Id != defaultId))
        {
            throw new InvalidOperationException($"Default family '{defaultId}' is not listed in the registry.");
        }

        return new FamilyRegistry(entries, defaultId);
    }
}
```

Add to `src/backend/FamilyTree.Domain/FamilyRegistry.cs` (same file, below the records):

```csharp
/// <summary>Supplies the registry of available families.</summary>
public interface IFamilyRegistryProvider
{
    ValueTask<FamilyRegistry> GetAsync(CancellationToken cancellationToken);
}
```

Create `src/backend/FamilyTree.Infrastructure/IRegistryFileReader.cs`:

```csharp
namespace FamilyTree.Infrastructure;

/// <summary>Reads a registry document's text from the seed source (local file or GCS),
/// mirroring how <see cref="IFamilyDataLoader"/> is selected.</summary>
public interface IRegistryFileReader
{
    Task<string> ReadAsync(string source, CancellationToken cancellationToken);
}
```

Create `src/backend/FamilyTree.Infrastructure/LocalRegistryFileReader.cs`:

```csharp
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;

namespace FamilyTree.Infrastructure;

public sealed class LocalRegistryFileReader : IRegistryFileReader
{
    private readonly IHostEnvironment _environment;
    private readonly ILogger<LocalRegistryFileReader> _logger;

    public LocalRegistryFileReader(IHostEnvironment environment, ILogger<LocalRegistryFileReader> logger)
    {
        _environment = environment;
        _logger = logger;
    }

    public async Task<string> ReadAsync(string source, CancellationToken cancellationToken)
    {
        var path = Path.IsPathRooted(source) ? source : Path.Combine(_environment.ContentRootPath, source);
        if (!File.Exists(path))
        {
            _logger.LogError("Family registry file not found at '{Path}'.", path);
            throw new FileNotFoundException($"Family registry file not found at '{path}'.", path);
        }

        return await File.ReadAllTextAsync(path, cancellationToken);
    }
}
```

- [ ] **Step 5: Add the Registry setting**

In `src/backend/FamilyTree.Api/Configuration/FamilyDataSettings.cs`, add below `Source`:

```csharp
    /// <summary>Optional path or gs:// URI of the families.json registry. Empty (the default)
    /// means a single family served from <see cref="Source"/>.</summary>
    public string Registry { get; init; } = "";
```

In `src/backend/FamilyTree.Infrastructure/FamilyDataOptions.cs`, add:

```csharp
    /// <summary>Optional path or "gs://" URI of the family registry document. Empty means
    /// a single synthesized family reading <see cref="Source"/>.</summary>
    public string Registry { get; set; } = "";

    /// <summary>True when <see cref="Registry"/> is a "gs://" URI.</summary>
    public bool IsGcsRegistry => Registry.StartsWith("gs://", StringComparison.OrdinalIgnoreCase);
```

- [ ] **Step 6: Run the tests to verify they pass**

Run: `dotnet test tests/unit/FamilyTree.UnitTests --filter FamilyRegistryLoaderTests`
Expected: PASS (8 tests).

- [ ] **Step 7: Commit**

```bash
git add src/backend/FamilyTree.Domain/FamilyRegistry.cs src/backend/FamilyTree.Infrastructure/FamilyRegistryFile.cs src/backend/FamilyTree.Infrastructure/FamilyRegistryLoader.cs src/backend/FamilyTree.Infrastructure/IRegistryFileReader.cs src/backend/FamilyTree.Infrastructure/LocalRegistryFileReader.cs src/backend/FamilyTree.Api/Configuration/FamilyDataSettings.cs src/backend/FamilyTree.Infrastructure/FamilyDataOptions.cs tests/unit/FamilyTree.UnitTests/Infrastructure/FamilyRegistryLoaderTests.cs
git commit -m "Add the family registry model and loader"
```

---

### Task 2: Storage key helpers

**Files:**
- Create: `src/backend/FamilyTree.Domain/StorageKeys.cs`
- Test: `tests/unit/FamilyTree.UnitTests/Domain/StorageKeysTests.cs`

**Interfaces:**
- Consumes: `FamilyRegistry` (Task 1).
- Produces: `static class StorageKeys` with
  `string OverrideKey(FamilyRegistry registry, string familyId, string personId)`,
  `string UploadPrefix(FamilyRegistry registry, string familyId, string personId)`,
  `string ExpandSeedMedia(FamilyRegistry registry, string familyId, string reference)`.

- [ ] **Step 1: Write the failing tests**

Create `tests/unit/FamilyTree.UnitTests/Domain/StorageKeysTests.cs`:

```csharp
using FamilyTree.Domain;

namespace FamilyTree.UnitTests.Domain;

public sealed class StorageKeysTests
{
    private static readonly FamilyRegistry Registry = new(
    [
        new FamilyRegistryEntry("perovsky", "family.json", new LocalizedText(), null),
        new FamilyRegistryEntry("kowalski", "kowalski.json", new LocalizedText(), null)
    ], "perovsky");

    [Fact]
    public void OverrideKey_WhenFamilyIsTheDefault_ShouldReturnTheBarePersonId()
    {
        StorageKeys.OverrideKey(Registry, "perovsky", "p-0001").Should().Be("p-0001");
    }

    [Fact]
    public void OverrideKey_WhenFamilyIsNotTheDefault_ShouldPrefixWithTheFamilyId()
    {
        StorageKeys.OverrideKey(Registry, "kowalski", "p-0001").Should().Be("kowalski/p-0001");
    }

    [Fact]
    public void UploadPrefix_WhenFamilyIsTheDefault_ShouldKeepTheHistoricalLayout()
    {
        StorageKeys.UploadPrefix(Registry, "perovsky", "p-0001").Should().Be("uploads/p-0001");
    }

    [Fact]
    public void UploadPrefix_WhenFamilyIsNotTheDefault_ShouldInsertTheFamilySegment()
    {
        StorageKeys.UploadPrefix(Registry, "kowalski", "p-0001").Should().Be("uploads/kowalski/p-0001");
    }

    [Fact]
    public void ExpandSeedMedia_WhenFamilyIsTheDefault_ShouldLeaveABareNameAlone()
    {
        StorageKeys.ExpandSeedMedia(Registry, "perovsky", "p-0001.jpg").Should().Be("p-0001.jpg");
    }

    [Fact]
    public void ExpandSeedMedia_WhenFamilyIsNotTheDefault_ShouldPrefixABareName()
    {
        StorageKeys.ExpandSeedMedia(Registry, "kowalski", "p-0001.jpg")
            .Should().Be("portraits/kowalski/p-0001.jpg");
    }

    [Fact]
    public void ExpandSeedMedia_WhenReferenceIsAlreadyAKey_ShouldLeaveItUntouched()
    {
        StorageKeys.ExpandSeedMedia(Registry, "kowalski", "uploads/p-0001/ab12.webp")
            .Should().Be("uploads/p-0001/ab12.webp");
    }
}
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `dotnet test tests/unit/FamilyTree.UnitTests --filter StorageKeysTests`
Expected: FAIL — `StorageKeys` does not exist.

- [ ] **Step 3: Write the implementation**

Create `src/backend/FamilyTree.Domain/StorageKeys.cs`:

```csharp
namespace FamilyTree.Domain;

/// <summary>
/// The single home of the family-scoping rule for durable keys: the default family keeps the
/// historical bare keys, every other family is prefixed with its id.
/// </summary>
/// <remarks>
/// Because the default family's keys are unprefixed, promoting a different family to default
/// would orphan the existing overrides and uploads. That would need a one-time key rewrite.
/// </remarks>
public static class StorageKeys
{
    /// <summary>Key for a person's override documents.</summary>
    public static string OverrideKey(FamilyRegistry registry, string familyId, string personId) =>
        registry.IsDefault(familyId) ? personId : $"{familyId}/{personId}";

    /// <summary>Key prefix for a person's uploaded media objects.</summary>
    public static string UploadPrefix(FamilyRegistry registry, string familyId, string personId) =>
        $"uploads/{OverrideKey(registry, familyId, personId)}";

    /// <summary>Expands a seed media reference to a full media key. A bare filename belongs to
    /// the family's media prefix; a reference that already contains a '/' is a full key and is
    /// returned unchanged.</summary>
    public static string ExpandSeedMedia(FamilyRegistry registry, string familyId, string reference)
    {
        if (reference.Contains('/') || registry.IsDefault(familyId))
        {
            return reference;
        }

        return $"{registry.MediaPrefixFor(familyId)}/{reference}";
    }
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `dotnet test tests/unit/FamilyTree.UnitTests --filter StorageKeysTests`
Expected: PASS (7 tests).

- [ ] **Step 5: Commit**

```bash
git add src/backend/FamilyTree.Domain/StorageKeys.cs tests/unit/FamilyTree.UnitTests/Domain/StorageKeysTests.cs
git commit -m "Add family-scoped storage key helpers"
```

---

### Task 3: Cross-family links on a person

**Files:**
- Create: `src/backend/FamilyTree.Domain/FamilyLink.cs`
- Modify: `src/backend/FamilyTree.Domain/Person.cs`
- Modify: `src/backend/FamilyTree.Application/Dtos/PersonDto.cs`, `src/backend/FamilyTree.Application/Dtos/PersonSummaryDto.cs`
- Create: `src/backend/FamilyTree.Application/Dtos/FamilyLinkDto.cs`
- Test: `tests/unit/FamilyTree.UnitTests/Infrastructure/FamilyLinkSeedTests.cs`

**Interfaces:**
- Consumes: `JsonFamilyDataLoader.Deserialize` (existing).
- Produces: `enum FamilyLinkRelation { Origin, Joined }`,
  `sealed record FamilyLink(string Family, string? PersonId, FamilyLinkRelation Relation)`,
  `Person.FamilyLinks` (`IReadOnlyList<FamilyLink>`, defaults to `[]`),
  `sealed record FamilyLinkDto(string Family, string? PersonId, string Relation)`.

- [ ] **Step 1: Write the failing test**

Create `tests/unit/FamilyTree.UnitTests/Infrastructure/FamilyLinkSeedTests.cs`:

```csharp
using FamilyTree.Domain;
using FamilyTree.Infrastructure;

namespace FamilyTree.UnitTests.Infrastructure;

public sealed class FamilyLinkSeedTests
{
    [Fact]
    public void Deserialize_WhenPersonDeclaresFamilyLinks_ShouldReadRelationAndCounterpart()
    {
        var json = """
        { "people": [ { "id": "p-1", "givenName": { "en": "A" }, "surname": { "en": "B" },
            "birth": { "year": 1900 },
            "familyLinks": [ { "family": "kowalski", "personId": "p-42", "relation": "origin" },
                             { "family": "nowak", "relation": "joined" } ] } ],
          "unions": [] }
        """;

        var graph = JsonFamilyDataLoader.Deserialize(json);

        var links = graph.People.Single().FamilyLinks;
        links.Should().HaveCount(2);
        links[0].Should().Be(new FamilyLink("kowalski", "p-42", FamilyLinkRelation.Origin));
        links[1].Should().Be(new FamilyLink("nowak", null, FamilyLinkRelation.Joined));
    }

    [Fact]
    public void Deserialize_WhenPersonDeclaresNoFamilyLinks_ShouldDefaultToAnEmptyList()
    {
        var json = """
        { "people": [ { "id": "p-1", "givenName": { "en": "A" }, "surname": { "en": "B" },
            "birth": { "year": 1900 } } ], "unions": [] }
        """;

        var graph = JsonFamilyDataLoader.Deserialize(json);

        graph.People.Single().FamilyLinks.Should().BeEmpty();
    }
}
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `dotnet test tests/unit/FamilyTree.UnitTests --filter FamilyLinkSeedTests`
Expected: FAIL — `FamilyLink` does not exist.

- [ ] **Step 3: Write the domain type and wire it onto Person**

Create `src/backend/FamilyTree.Domain/FamilyLink.cs`:

```csharp
namespace FamilyTree.Domain;

/// <summary>How a person relates to another family tree.</summary>
public enum FamilyLinkRelation
{
    /// <summary>The person married into this family from the linked one.</summary>
    Origin,

    /// <summary>The person left this family for the linked one.</summary>
    Joined
}

/// <summary>An authored link from a person to another family tree, optionally naming that
/// family's record of the same person.</summary>
public sealed record FamilyLink(string Family, string? PersonId, FamilyLinkRelation Relation);
```

In `src/backend/FamilyTree.Domain/Person.cs`, add below `MarriedIntoFamily`:

```csharp
    public IReadOnlyList<FamilyLink> FamilyLinks { get; init; } = [];
```

- [ ] **Step 4: Add the DTO**

Create `src/backend/FamilyTree.Application/Dtos/FamilyLinkDto.cs`:

```csharp
namespace FamilyTree.Application.Dtos;

public sealed record FamilyLinkDto(string Family, string? PersonId, string Relation);
```

Add to both `PersonDto` and `PersonSummaryDto` (matching each record's existing member style):

```csharp
    public IReadOnlyList<FamilyLinkDto> FamilyLinks { get; init; } = [];
```

Mapster maps `FamilyLinkRelation` to its string name by convention; verify in Step 6 and, if the mapping produces an integer, register in the existing mapping configuration:

```csharp
config.NewConfig<FamilyLink, FamilyLinkDto>()
    .Map(dest => dest.Relation, src => src.Relation.ToString().ToLowerInvariant());
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `dotnet test tests/unit/FamilyTree.UnitTests --filter FamilyLinkSeedTests`
Expected: PASS (2 tests).

- [ ] **Step 6: Verify the DTO mapping emits a lowercase relation string**

Add to `tests/unit/FamilyTree.UnitTests/Application/` the mapping check in the existing mapping test class (or create `FamilyLinkMappingTests.cs` following its pattern):

```csharp
[Fact]
public void Map_WhenPersonHasAFamilyLink_ShouldEmitTheRelationAsALowercaseString()
{
    var person = new Person
    {
        Id = "p-1",
        GivenName = new LocalizedText { En = "A" },
        Surname = new LocalizedText { En = "B" },
        Birth = new LifeEvent { Year = 1900 },
        FamilyLinks = [new FamilyLink("kowalski", "p-42", FamilyLinkRelation.Origin)]
    };

    var dto = person.Adapt<PersonSummaryDto>();

    dto.FamilyLinks.Single().Relation.Should().Be("origin");
}
```

Run: `dotnet test tests/unit/FamilyTree.UnitTests --filter FamilyLink`
Expected: PASS. If the relation comes through as `"Origin"` or an integer, add the explicit Mapster rule from Step 4 and re-run.

- [ ] **Step 7: Commit**

```bash
git add src/backend/FamilyTree.Domain/FamilyLink.cs src/backend/FamilyTree.Domain/Person.cs src/backend/FamilyTree.Application/Dtos/ tests/unit/FamilyTree.UnitTests/
git commit -m "Add cross-family links to the person model"
```

---

### Task 4: The loader factory and the snapshot registry

**Files:**
- Create: `src/backend/FamilyTree.Infrastructure/FamilyDataLoaderFactory.cs`
- Create: `src/backend/FamilyTree.Infrastructure/FamilySnapshotRegistry.cs`
- Test: `tests/unit/FamilyTree.UnitTests/Infrastructure/FamilySnapshotRegistryTests.cs`

**Interfaces:**
- Consumes: `FamilyRegistry`, `IFamilyRegistryProvider` (Task 1); `IFamilyDataLoader`, `FamilySnapshotProvider` (existing).
- Produces:
  - `interface IFamilyDataLoaderFactory { IFamilyDataLoader Create(string source); }`
  - `sealed class FamilySnapshotRegistry` with
    `ValueTask<IFamilySnapshotProvider> ForAsync(string familyId, CancellationToken cancellationToken)` (throws `UnknownFamilyException` for an unregistered id),
    `IReadOnlyCollection<(string FamilyId, IFamilyDataHealthSource Health)> HealthSources`
  - `sealed class UnknownFamilyException(string familyId) : Exception`

- [ ] **Step 1: Write the failing tests**

Create `tests/unit/FamilyTree.UnitTests/Infrastructure/FamilySnapshotRegistryTests.cs`:

```csharp
using FamilyTree.Domain;
using FamilyTree.Infrastructure;
using Microsoft.Extensions.Logging.Abstractions;
using Microsoft.Extensions.Options;
using Moq;

namespace FamilyTree.UnitTests.Infrastructure;

public sealed class FamilySnapshotRegistryTests
{
    private static readonly FamilyRegistry Registry = new(
    [
        new FamilyRegistryEntry("perovsky", "family.json", new LocalizedText(), null),
        new FamilyRegistryEntry("kowalski", "kowalski.json", new LocalizedText(), null)
    ], "perovsky");

    private static FamilyGraph GraphWith(string id) =>
        new([new Person { Id = id, GivenName = new LocalizedText { En = "A" },
                          Surname = new LocalizedText { En = "B" }, Birth = new LifeEvent { Year = 1900 } }], []);

    private static FamilySnapshotRegistry Build(IFamilyDataLoaderFactory factory)
    {
        var registryProvider = new Mock<IFamilyRegistryProvider>();
        registryProvider.Setup(p => p.GetAsync(It.IsAny<CancellationToken>()))
            .Returns(ValueTask.FromResult(Registry));

        var overrides = new Mock<IPersonOverrideStore>();
        overrides.Setup(o => o.GetLatestBiographiesAsync(It.IsAny<string>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync(new Dictionary<string, LocalizedText>());
        overrides.Setup(o => o.GetLatestMediaMapAsync(It.IsAny<string>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync(new Dictionary<string, PersonMediaOverride>());
        overrides.Setup(o => o.GetLatestProfilesAsync(It.IsAny<string>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync(new Dictionary<string, PersonProfileOverride>());

        return new FamilySnapshotRegistry(
            registryProvider.Object,
            factory,
            overrides.Object,
            Options.Create(new FamilyDataOptions()),
            TimeProvider.System,
            NullLoggerFactory.Instance);
    }

    [Fact]
    public async Task ForAsync_WhenCalledTwiceForOneFamily_ShouldReturnTheSameProvider()
    {
        var factory = new StubLoaderFactory();
        var registry = Build(factory);

        var first = await registry.ForAsync("perovsky", CancellationToken.None);
        var second = await registry.ForAsync("perovsky", CancellationToken.None);

        second.Should().BeSameAs(first);
    }

    [Fact]
    public async Task ForAsync_WhenTwoFamiliesAreRequested_ShouldLoadEachFromItsOwnSource()
    {
        var factory = new StubLoaderFactory();
        var registry = Build(factory);

        var a = await (await registry.ForAsync("perovsky", CancellationToken.None)).GetAsync(CancellationToken.None);
        var b = await (await registry.ForAsync("kowalski", CancellationToken.None)).GetAsync(CancellationToken.None);

        a.People.Single().Id.Should().Be("family.json");
        b.People.Single().Id.Should().Be("kowalski.json");
    }

    [Fact]
    public async Task ForAsync_WhenFamilyIsNotRegistered_ShouldThrowUnknownFamily()
    {
        var registry = Build(new StubLoaderFactory());

        var act = async () => await registry.ForAsync("nowak", CancellationToken.None);

        await act.Should().ThrowAsync<UnknownFamilyException>();
    }

    [Fact]
    public async Task ForAsync_WhenOneFamilySourceFails_ShouldStillServeTheOtherFamily()
    {
        var factory = new StubLoaderFactory { FailingSource = "kowalski.json" };
        var registry = Build(factory);

        var failing = async () => await (await registry.ForAsync("kowalski", CancellationToken.None))
            .GetAsync(CancellationToken.None);
        await failing.Should().ThrowAsync<InvalidOperationException>();

        var healthy = await (await registry.ForAsync("perovsky", CancellationToken.None))
            .GetAsync(CancellationToken.None);
        healthy.People.Single().Id.Should().Be("family.json");
    }

    private sealed class StubLoaderFactory : IFamilyDataLoaderFactory
    {
        public string? FailingSource { get; init; }

        public IFamilyDataLoader Create(string source) => new StubLoader(source, FailingSource == source);
    }

    private sealed class StubLoader : IFamilyDataLoader
    {
        private readonly string _source;
        private readonly bool _fails;

        public StubLoader(string source, bool fails)
        {
            _source = source;
            _fails = fails;
        }

        public Task<FamilyGraph> LoadAsync(CancellationToken cancellationToken) =>
            _fails
                ? Task.FromException<FamilyGraph>(new InvalidOperationException("source down"))
                : Task.FromResult(GraphWith(_source));
    }
}
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `dotnet test tests/unit/FamilyTree.UnitTests --filter FamilySnapshotRegistryTests`
Expected: FAIL — `FamilySnapshotRegistry` and `IFamilyDataLoaderFactory` do not exist.

- [ ] **Step 3: Write the loader factory**

Create `src/backend/FamilyTree.Infrastructure/FamilyDataLoaderFactory.cs`:

```csharp
using Google.Cloud.Storage.V1;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;

namespace FamilyTree.Infrastructure;

/// <summary>Builds the right <see cref="IFamilyDataLoader"/> for a family's source URI —
/// the per-family form of the loader selection that <c>AddInfrastructure</c> used to do once.</summary>
public interface IFamilyDataLoaderFactory
{
    IFamilyDataLoader Create(string source);
}

public sealed class FamilyDataLoaderFactory : IFamilyDataLoaderFactory
{
    private readonly IServiceProvider _services;

    public FamilyDataLoaderFactory(IServiceProvider services)
    {
        _services = services;
    }

    public IFamilyDataLoader Create(string source)
    {
        var options = Options.Create(new FamilyDataOptions { Source = source });
        if (options.Value.IsGcsSource)
        {
            return new GcsFamilyDataLoader(_services.GetRequiredService<StorageClient>(), options);
        }

        return new JsonFamilyDataLoader(
            options,
            _services.GetRequiredService<IHostEnvironment>(),
            _services.GetRequiredService<ILogger<JsonFamilyDataLoader>>());
    }
}
```

Add `using Microsoft.Extensions.DependencyInjection;` if `GetRequiredService` is not already in `GlobalUsings.cs`.

- [ ] **Step 4: Write the snapshot registry**

Create `src/backend/FamilyTree.Infrastructure/FamilySnapshotRegistry.cs`:

```csharp
using System.Collections.Concurrent;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;

namespace FamilyTree.Infrastructure;

/// <summary>Thrown when a request names a family that is not in the registry.</summary>
public sealed class UnknownFamilyException : Exception
{
    public UnknownFamilyException(string familyId)
        : base($"Family '{familyId}' is not registered.")
    {
        FamilyId = familyId;
    }

    public string FamilyId { get; }
}

/// <summary>
/// Holds one <see cref="FamilySnapshotProvider"/> per registered family, created on first use.
/// Each provider keeps its own TTL, refresh lock and last-good fallback, so families refresh
/// independently and a broken seed degrades only its own tree.
/// </summary>
public sealed class FamilySnapshotRegistry
{
    private readonly IFamilyRegistryProvider _registry;
    private readonly IFamilyDataLoaderFactory _loaders;
    private readonly IPersonOverrideStore _overrides;
    private readonly IOptions<FamilyDataOptions> _options;
    private readonly TimeProvider _timeProvider;
    private readonly ILoggerFactory _loggerFactory;
    private readonly ConcurrentDictionary<string, FamilySnapshotProvider> _providers = new(StringComparer.Ordinal);

    public FamilySnapshotRegistry(
        IFamilyRegistryProvider registry,
        IFamilyDataLoaderFactory loaders,
        IPersonOverrideStore overrides,
        IOptions<FamilyDataOptions> options,
        TimeProvider timeProvider,
        ILoggerFactory loggerFactory)
    {
        _registry = registry;
        _loaders = loaders;
        _overrides = overrides;
        _options = options;
        _timeProvider = timeProvider;
        _loggerFactory = loggerFactory;
    }

    /// <summary>Returns the provider for a family, creating it on first use.</summary>
    /// <exception cref="UnknownFamilyException">The family is not in the registry.</exception>
    public async ValueTask<IFamilySnapshotProvider> ForAsync(string familyId, CancellationToken cancellationToken)
    {
        return await ProviderForAsync(familyId, cancellationToken);
    }

    /// <summary>The health source of every family whose provider has been created.</summary>
    public IReadOnlyCollection<(string FamilyId, IFamilyDataHealthSource Health)> HealthSources =>
        [.. _providers.Select(pair => (pair.Key, (IFamilyDataHealthSource)pair.Value))];

    private async ValueTask<FamilySnapshotProvider> ProviderForAsync(string familyId, CancellationToken cancellationToken)
    {
        if (_providers.TryGetValue(familyId, out var existing))
        {
            return existing;
        }

        var registry = await _registry.GetAsync(cancellationToken);
        var entry = registry.Find(familyId) ?? throw new UnknownFamilyException(familyId);

        return _providers.GetOrAdd(familyId, _ => new FamilySnapshotProvider(
            _loaders.Create(entry.Source),
            _overrides,
            _options,
            _timeProvider,
            _loggerFactory.CreateLogger<FamilySnapshotProvider>(),
            registry,
            familyId));
    }
}
```

Note: the two trailing `FamilySnapshotProvider` constructor parameters (`registry`, `familyId`) are added in Task 5. Until then this file will not compile — Task 4 and Task 5 are committed together at the end of Task 5. Complete Task 5 before running the full suite.

- [ ] **Step 5: Commit the work in progress**

```bash
git add src/backend/FamilyTree.Infrastructure/FamilyDataLoaderFactory.cs src/backend/FamilyTree.Infrastructure/FamilySnapshotRegistry.cs tests/unit/FamilyTree.UnitTests/Infrastructure/FamilySnapshotRegistryTests.cs
git commit -m "Add the family snapshot registry and loader factory (compiles with task 5)"
```

---

### Task 5: Family-aware snapshot provider — scoped overrides and media expansion

**Files:**
- Modify: `src/backend/FamilyTree.Infrastructure/FamilySnapshotProvider.cs` (constructor, override lookups, media expansion, link filtering only)
- Modify: `src/backend/FamilyTree.Domain/IPersonOverrideStore.cs`
- Modify: `src/backend/FamilyTree.Infrastructure/FirestorePersonOverrideStore.cs`, `src/backend/FamilyTree.Infrastructure/InMemoryPersonOverrideStore.cs`
- Test: `tests/unit/FamilyTree.UnitTests/Infrastructure/FamilySnapshotProviderFamilyTests.cs`
- Test: existing `tests/unit/FamilyTree.UnitTests/Infrastructure/` override-store and snapshot tests (update call sites)

**Interfaces:**
- Consumes: `StorageKeys` (Task 2), `FamilyLink` (Task 3), `FamilyRegistry` (Task 1).
- Produces: every `IPersonOverrideStore` method gains a leading `string familyId` parameter; map getters return **person-id-keyed** maps for that family only. `FamilySnapshotProvider`'s constructor gains `FamilyRegistry registry, string familyId` as its last two parameters.

- [ ] **Step 1: Write the failing tests**

Create `tests/unit/FamilyTree.UnitTests/Infrastructure/FamilySnapshotProviderFamilyTests.cs`:

```csharp
using FamilyTree.Domain;
using FamilyTree.Infrastructure;
using Microsoft.Extensions.Logging.Abstractions;
using Microsoft.Extensions.Options;
using Moq;

namespace FamilyTree.UnitTests.Infrastructure;

public sealed class FamilySnapshotProviderFamilyTests
{
    private static readonly FamilyRegistry Registry = new(
    [
        new FamilyRegistryEntry("perovsky", "family.json", new LocalizedText(), null),
        new FamilyRegistryEntry("kowalski", "kowalski.json", new LocalizedText(), null)
    ], "perovsky");

    private static Person PersonWith(string id, string? portrait = null, IReadOnlyList<FamilyLink>? links = null) =>
        new()
        {
            Id = id,
            GivenName = new LocalizedText { En = "A" },
            Surname = new LocalizedText { En = "B" },
            Birth = new LifeEvent { Year = 1900 },
            Portrait = portrait,
            FamilyLinks = links ?? []
        };

    private static FamilySnapshotProvider Build(FamilyGraph seed, string familyId)
    {
        var loader = new Mock<IFamilyDataLoader>();
        loader.Setup(l => l.LoadAsync(It.IsAny<CancellationToken>())).ReturnsAsync(seed);

        var overrides = new Mock<IPersonOverrideStore>();
        overrides.Setup(o => o.GetLatestBiographiesAsync(It.IsAny<string>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync(new Dictionary<string, LocalizedText>());
        overrides.Setup(o => o.GetLatestMediaMapAsync(It.IsAny<string>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync(new Dictionary<string, PersonMediaOverride>());
        overrides.Setup(o => o.GetLatestProfilesAsync(It.IsAny<string>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync(new Dictionary<string, PersonProfileOverride>());

        return new FamilySnapshotProvider(
            loader.Object, overrides.Object, Options.Create(new FamilyDataOptions()),
            TimeProvider.System, NullLogger<FamilySnapshotProvider>.Instance, Registry, familyId);
    }

    [Fact]
    public async Task GetAsync_WhenFamilyIsNotTheDefault_ShouldExpandBareSeedPortraitsToPrefixedKeys()
    {
        var provider = Build(new FamilyGraph([PersonWith("p-1", "p-1.jpg")], []), "kowalski");

        var graph = await provider.GetAsync(CancellationToken.None);

        graph.People.Single().Portrait.Should().Be("portraits/kowalski/p-1.jpg");
    }

    [Fact]
    public async Task GetAsync_WhenFamilyIsTheDefault_ShouldLeaveSeedPortraitsBare()
    {
        var provider = Build(new FamilyGraph([PersonWith("p-1", "p-1.jpg")], []), "perovsky");

        var graph = await provider.GetAsync(CancellationToken.None);

        graph.People.Single().Portrait.Should().Be("p-1.jpg");
    }

    [Fact]
    public async Task GetAsync_WhenALinkNamesAnUnregisteredFamily_ShouldDropThatLink()
    {
        var links = new[]
        {
            new FamilyLink("kowalski", "p-42", FamilyLinkRelation.Origin),
            new FamilyLink("nowak", null, FamilyLinkRelation.Joined)
        };
        var provider = Build(new FamilyGraph([PersonWith("p-1", links: links)], []), "perovsky");

        var graph = await provider.GetAsync(CancellationToken.None);

        graph.People.Single().FamilyLinks.Should().ContainSingle()
            .Which.Family.Should().Be("kowalski");
    }

    [Fact]
    public async Task GetAsync_WhenBuildingASnapshot_ShouldReadOverridesForItsOwnFamilyOnly()
    {
        var overrides = new Mock<IPersonOverrideStore>();
        overrides.Setup(o => o.GetLatestBiographiesAsync("kowalski", It.IsAny<CancellationToken>()))
            .ReturnsAsync(new Dictionary<string, LocalizedText> { ["p-1"] = new() { En = "edited" } });
        overrides.Setup(o => o.GetLatestMediaMapAsync(It.IsAny<string>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync(new Dictionary<string, PersonMediaOverride>());
        overrides.Setup(o => o.GetLatestProfilesAsync(It.IsAny<string>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync(new Dictionary<string, PersonProfileOverride>());
        var loader = new Mock<IFamilyDataLoader>();
        loader.Setup(l => l.LoadAsync(It.IsAny<CancellationToken>()))
            .ReturnsAsync(new FamilyGraph([PersonWith("p-1")], []));

        var provider = new FamilySnapshotProvider(
            loader.Object, overrides.Object, Options.Create(new FamilyDataOptions()),
            TimeProvider.System, NullLogger<FamilySnapshotProvider>.Instance, Registry, "kowalski");

        var graph = await provider.GetAsync(CancellationToken.None);

        graph.People.Single().Biography!.En.Should().Be("edited");
        overrides.Verify(o => o.GetLatestBiographiesAsync("kowalski", It.IsAny<CancellationToken>()), Times.Once);
    }
}
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `dotnet test tests/unit/FamilyTree.UnitTests --filter FamilySnapshotProviderFamilyTests`
Expected: FAIL — the constructor does not take a registry/familyId and `IPersonOverrideStore` has no family parameter.

- [ ] **Step 3: Add the family parameter to the override store interface**

In `src/backend/FamilyTree.Domain/IPersonOverrideStore.cs`, prefix every method with `string familyId`:

```csharp
namespace FamilyTree.Domain;

/// <summary>
/// Append-only store of per-person overrides layered over the JSON seed, scoped to one family.
/// Keys are family-scoped via <see cref="StorageKeys.OverrideKey"/>; the map getters return
/// person-id-keyed maps holding only the named family's entries.
/// </summary>
public interface IPersonOverrideStore
{
    Task AppendBiographyAsync(string familyId, string personId, LocalizedText biography, string editorEmail, CancellationToken cancellationToken);
    Task<LocalizedText?> GetLatestBiographyAsync(string familyId, string personId, CancellationToken cancellationToken);
    Task<IReadOnlyDictionary<string, LocalizedText>> GetLatestBiographiesAsync(string familyId, CancellationToken cancellationToken);

    Task AppendMediaAsync(string familyId, string personId, PersonMediaOverride media, string editorEmail, CancellationToken cancellationToken);
    Task<PersonMediaOverride?> GetLatestMediaAsync(string familyId, string personId, CancellationToken cancellationToken);
    Task<IReadOnlyDictionary<string, PersonMediaOverride>> GetLatestMediaMapAsync(string familyId, CancellationToken cancellationToken);

    Task AppendProfileAsync(string familyId, string personId, PersonProfileOverride profile, string editorEmail, CancellationToken cancellationToken);
    Task<PersonProfileOverride?> GetLatestProfileAsync(string familyId, string personId, CancellationToken cancellationToken);
    Task<IReadOnlyDictionary<string, PersonProfileOverride>> GetLatestProfilesAsync(string familyId, CancellationToken cancellationToken);
}
```

Both implementations need a `FamilyRegistry` to apply `StorageKeys.OverrideKey`. Inject `IFamilyRegistryProvider` into each store and resolve the registry at the top of each method:

```csharp
    private async Task<string> KeyAsync(string familyId, string personId, CancellationToken cancellationToken)
    {
        var registry = await _registry.GetAsync(cancellationToken);
        return StorageKeys.OverrideKey(registry, familyId, personId);
    }
```

Single-document reads and appends use `KeyAsync` in place of the bare `personId` when calling `_overrides.Document(...)`, `_mediaOverrides.Document(...)`, and `_profileOverrides.Document(...)`.

The map getters filter the collection to one family and strip the prefix. Add this shared helper to both stores:

```csharp
    /// <summary>Keeps only the entries belonging to <paramref name="familyId"/> and re-keys them by
    /// bare person id. The default family owns every key with no '/'; another family owns the keys
    /// under its own prefix.</summary>
    private static Dictionary<string, T> ScopeToFamily<T>(
        IEnumerable<KeyValuePair<string, T>> all, FamilyRegistry registry, string familyId)
    {
        if (registry.IsDefault(familyId))
        {
            return all.Where(pair => !pair.Key.Contains('/'))
                      .ToDictionary(pair => pair.Key, pair => pair.Value, StringComparer.Ordinal);
        }

        var prefix = $"{familyId}/";
        return all.Where(pair => pair.Key.StartsWith(prefix, StringComparison.Ordinal))
                  .ToDictionary(pair => pair.Key[prefix.Length..], pair => pair.Value, StringComparer.Ordinal);
    }
```

Apply it to the dictionary each map getter currently builds, immediately before returning.

- [ ] **Step 4: Make the snapshot provider family-aware**

In `src/backend/FamilyTree.Infrastructure/FamilySnapshotProvider.cs`:

Add two readonly fields and two constructor parameters (last position, after `logger`):

```csharp
    private readonly FamilyRegistry _registry;
    private readonly string _familyId;
```

```csharp
    public FamilySnapshotProvider(
        IFamilyDataLoader loader,
        IPersonOverrideStore overrides,
        IOptions<FamilyDataOptions> options,
        TimeProvider timeProvider,
        ILogger<FamilySnapshotProvider> logger,
        FamilyRegistry registry,
        string familyId)
    {
        _loader = loader;
        _overrides = overrides;
        _timeProvider = timeProvider;
        _logger = logger;
        _registry = registry;
        _familyId = familyId;
        _ttl = TimeSpan.FromMinutes(Math.Max(1, options.Value.SnapshotTtlMinutes));
    }
```

In `RebuildAsync`, pass the family to each override read:

```csharp
                seed = await _loader.LoadAsync(cancellationToken);
                latest = await _overrides.GetLatestBiographiesAsync(_familyId, cancellationToken);
                media = await _overrides.GetLatestMediaMapAsync(_familyId, cancellationToken);
                profiles = await _overrides.GetLatestProfilesAsync(_familyId, cancellationToken);
```

Normalise the seed immediately after it loads, before the merge, so both the merged snapshot and the cached `_seed` are normalised:

```csharp
            seed = Normalise(seed);
```

Add the two private helpers at the bottom of the class:

```csharp
    /// <summary>Applies the family-level seed rules: bare media names expand to this family's
    /// media prefix, and links to unregistered families are dropped so the UI never offers a
    /// switch that cannot resolve.</summary>
    private FamilyGraph Normalise(FamilyGraph seed)
    {
        var people = seed.People.Select(person => person with
        {
            Portrait = ExpandMedia(person.Portrait),
            PortraitThumb = ExpandMedia(person.PortraitThumb),
            PortraitVideo = ExpandMedia(person.PortraitVideo),
            Gallery = [.. person.Gallery.Select(photo => photo with
            {
                Full = ExpandMedia(photo.Full) ?? photo.Full,
                Thumb = ExpandMedia(photo.Thumb) ?? photo.Thumb
            })],
            FamilyLinks = KnownLinks(person)
        }).ToList();

        return new FamilyGraph(people, seed.Unions);
    }

    private string? ExpandMedia(string? reference) =>
        reference is null ? null : StorageKeys.ExpandSeedMedia(_registry, _familyId, reference);

    private IReadOnlyList<FamilyLink> KnownLinks(Person person)
    {
        if (person.FamilyLinks.Count == 0)
        {
            return person.FamilyLinks;
        }

        var known = person.FamilyLinks.Where(link => _registry.Contains(link.Family)).ToList();
        if (known.Count != person.FamilyLinks.Count)
        {
            _logger.LogWarning(
                "Dropped {DroppedCount} family link(s) on person {PersonId} in family {FamilyId} naming an unregistered family.",
                person.FamilyLinks.Count - known.Count, person.Id, _familyId);
        }

        return known;
    }
```

- [ ] **Step 5: Update existing call sites**

Every existing caller of `IPersonOverrideStore` (the biography, profile, and photo handlers) and every existing `new FamilySnapshotProvider(...)` in tests now needs the family argument. In handlers, take it from `IFamilyContext` (Task 6) — for this task, pass `registry.DefaultFamilyId` and mark the spot:

```csharp
// Family comes from IFamilyContext in task 6.
```

Run: `dotnet build`
Fix every compile error until the build is clean.

- [ ] **Step 6: Run the tests to verify they pass**

Run: `dotnet test tests/unit/FamilyTree.UnitTests --filter "FamilySnapshotProviderFamilyTests|FamilySnapshotRegistryTests"`
Expected: PASS (8 tests).

Run: `dotnet test`
Expected: PASS — the whole suite, with existing tests updated to the new signatures.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "Scope snapshots, overrides and seed media to a family"
```

---

### Task 6: The request family context and DI wiring

**Files:**
- Create: `src/backend/FamilyTree.Domain/IFamilyContext.cs`
- Create: `src/backend/FamilyTree.Api/Family/FamilyContextMiddleware.cs`
- Modify: `src/backend/FamilyTree.Infrastructure/InfrastructureServiceCollectionExtensions.cs`
- Modify: `src/backend/FamilyTree.Api/Program.cs`
- Modify: the biography / profile / photo handlers to read `IFamilyContext`
- Test: `tests/unit/FamilyTree.UnitTests/Api/FamilyContextMiddlewareTests.cs`

**Interfaces:**
- Consumes: `FamilySnapshotRegistry` (Task 4), `FamilyRegistry` (Task 1).
- Produces: `interface IFamilyContext { string FamilyId { get; } }`, `sealed class FamilyContext : IFamilyContext { public string FamilyId { get; set; } }` (scoped), and a scoped `IFamilySnapshotProvider` resolved per request from the context.

- [ ] **Step 1: Write the failing test**

Create `tests/unit/FamilyTree.UnitTests/Api/FamilyContextMiddlewareTests.cs`:

```csharp
using FamilyTree.Api.Family;
using FamilyTree.Domain;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;

namespace FamilyTree.UnitTests.Api;

public sealed class FamilyContextMiddlewareTests
{
    private static readonly FamilyRegistry Registry = new(
    [
        new FamilyRegistryEntry("perovsky", "family.json", new LocalizedText(), null),
        new FamilyRegistryEntry("kowalski", "kowalski.json", new LocalizedText(), null)
    ], "perovsky");

    private static HttpContext ContextWith(string? familyId, FamilyContext context)
    {
        var http = new DefaultHttpContext();
        http.RequestServices = new StubServices(context);
        if (familyId is not null)
        {
            http.Request.RouteValues["familyId"] = familyId;
        }
        return http;
    }

    [Fact]
    public async Task Invoke_WhenRouteNamesAFamily_ShouldSetThatFamilyOnTheContext()
    {
        var context = new FamilyContext();
        var middleware = new FamilyContextMiddleware(_ => Task.CompletedTask);

        await middleware.InvokeAsync(ContextWith("kowalski", context), Registry);

        context.FamilyId.Should().Be("kowalski");
    }

    [Fact]
    public async Task Invoke_WhenRouteNamesNoFamily_ShouldFallBackToTheDefaultFamily()
    {
        var context = new FamilyContext();
        var middleware = new FamilyContextMiddleware(_ => Task.CompletedTask);

        await middleware.InvokeAsync(ContextWith(null, context), Registry);

        context.FamilyId.Should().Be("perovsky");
    }

    [Fact]
    public async Task Invoke_WhenRouteNamesAnUnregisteredFamily_ShouldRespondNotFoundAndNotCallNext()
    {
        var called = false;
        var context = new FamilyContext();
        var middleware = new FamilyContextMiddleware(_ => { called = true; return Task.CompletedTask; });
        var http = ContextWith("nowak", context);

        await middleware.InvokeAsync(http, Registry);

        http.Response.StatusCode.Should().Be(StatusCodes.Status404NotFound);
        called.Should().BeFalse();
    }

    private sealed class StubServices : IServiceProvider
    {
        private readonly FamilyContext _context;
        public StubServices(FamilyContext context) => _context = context;
        public object? GetService(Type serviceType) =>
            serviceType == typeof(IFamilyContext) || serviceType == typeof(FamilyContext) ? _context : null;
    }
}
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `dotnet test tests/unit/FamilyTree.UnitTests --filter FamilyContextMiddlewareTests`
Expected: FAIL — `IFamilyContext` and `FamilyContextMiddleware` do not exist.

- [ ] **Step 3: Write the context and middleware**

Create `src/backend/FamilyTree.Domain/IFamilyContext.cs`:

```csharp
namespace FamilyTree.Domain;

/// <summary>Which family tree the current request is about. Scoped: set once per request from
/// the route, then read by the snapshot provider registration and the editing handlers.</summary>
public interface IFamilyContext
{
    string FamilyId { get; }
}

/// <summary>The mutable scoped implementation the request pipeline fills in.</summary>
public sealed class FamilyContext : IFamilyContext
{
    public string FamilyId { get; set; } = "";
}
```

Create `src/backend/FamilyTree.Api/Family/FamilyContextMiddleware.cs`:

```csharp
using FamilyTree.Domain;

namespace FamilyTree.Api.Family;

/// <summary>Resolves the request's family from the <c>familyId</c> route value, falling back to
/// the default family for the unprefixed alias routes. An unregistered id short-circuits with a
/// 404 before any seed is loaded.</summary>
public sealed class FamilyContextMiddleware
{
    private readonly RequestDelegate _next;

    public FamilyContextMiddleware(RequestDelegate next)
    {
        _next = next;
    }

    public async Task InvokeAsync(HttpContext httpContext, FamilyRegistry registry)
    {
        var routeValue = httpContext.Request.RouteValues.TryGetValue("familyId", out var value)
            ? value?.ToString()
            : null;
        var familyId = string.IsNullOrWhiteSpace(routeValue) ? registry.DefaultFamilyId : routeValue;

        if (!registry.Contains(familyId))
        {
            httpContext.Response.StatusCode = StatusCodes.Status404NotFound;
            return;
        }

        var context = httpContext.RequestServices.GetRequiredService<FamilyContext>();
        context.FamilyId = familyId;
        await _next(httpContext);
    }
}
```

- [ ] **Step 4: Rewire DI**

In `InfrastructureServiceCollectionExtensions.AddInfrastructure`, replace the three `FamilySnapshotProvider` singleton registrations with:

```csharp
        services.AddSingleton<IRegistryFileReader, LocalRegistryFileReader>();
        services.AddSingleton<IFamilyRegistryProvider, FamilyRegistryLoader>();
        services.AddSingleton<IFamilyDataLoaderFactory, FamilyDataLoaderFactory>();
        services.AddSingleton<FamilySnapshotRegistry>();

        // The family travels through the request as a scoped context, so repositories,
        // the query service and every handler stay family-agnostic.
        services.AddScoped<FamilyContext>();
        services.AddScoped<IFamilyContext>(sp => sp.GetRequiredService<FamilyContext>());
        services.AddScoped<IFamilySnapshotProvider>(sp =>
        {
            var context = sp.GetRequiredService<IFamilyContext>();
            var registry = sp.GetRequiredService<FamilySnapshotRegistry>();
            return registry.ForAsync(context.FamilyId, CancellationToken.None).AsTask().GetAwaiter().GetResult();
        });
```

Keep the `IFamilyDataLoader` registration for the GCS/JSON choice (the health check and existing seed reads still resolve it), and keep `services.AddSingleton(_ => StorageClient.Create());` under `familyData.IsGcsSource`.

In `Program.cs`:

- Pass the registry setting through to the options:

```csharp
builder.Services.AddInfrastructure(
    new FamilyDataOptions
    {
        Source = appSettings.FamilyData.Source,
        Registry = appSettings.FamilyData.Registry,
        SnapshotTtlMinutes = appSettings.FamilyData.SnapshotTtlMinutes
    },
```

- Resolve the registry once at startup (fail fast on a bad registry) and register it for the middleware:

```csharp
// Fail fast: a malformed registry must not start a half-working site.
var familyRegistry = await app.Services.GetRequiredService<IFamilyRegistryProvider>()
    .GetAsync(CancellationToken.None);
app.Services.GetRequiredService<ILogger<Program>>()
    .LogInformation("Serving {FamilyCount} family tree(s).", familyRegistry.Families.Count);
```

If `Program.cs` is not already in a top-level-await context, use `.GetAwaiter().GetResult()`.

- Register the middleware **after** `UseRouting` (route values must be populated) and before `MapControllers`:

```csharp
app.UseMiddleware<FamilyContextMiddleware>(familyRegistry);
```

- [ ] **Step 5: Read the family in the editing handlers**

In `AddPersonPhotoHandler`, `UpdatePersonBiographyHandler`, `UpdatePersonProfileHandler`, and any other handler touching `IPersonOverrideStore`, inject `IFamilyContext` as a constructor parameter (after the existing services, before `ILogger`), store it in `_familyContext`, and replace the Task 5 placeholder with `_familyContext.FamilyId`. Remove the `// Family comes from IFamilyContext in task 6.` comments.

- [ ] **Step 6: Run the tests to verify they pass**

Run: `dotnet test tests/unit/FamilyTree.UnitTests --filter FamilyContextMiddlewareTests`
Expected: PASS (3 tests).

Run: `dotnet test`
Expected: PASS — the whole suite. Existing handler tests need an `IFamilyContext` stub returning the default family id.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "Resolve the request's family through a scoped family context"
```

---

### Task 7: Family-scoped API routes

**Files:**
- Create: `src/backend/FamilyTree.Api/Controllers/FamiliesController.cs`
- Modify: `src/backend/FamilyTree.Api/Controllers/FamilyController.cs`, `src/backend/FamilyTree.Api/Controllers/PeopleController.cs`
- Create: `src/backend/FamilyTree.Application/Families/GetFamiliesQuery.cs` + `GetFamiliesHandler.cs` + `FamilySummaryDto.cs`
- Test: `tests/integration/FamilyTree.IntegrationTests/FamilyRoutesTests.cs`

**Interfaces:**
- Consumes: `IFamilyRegistryProvider` (Task 1), `FamilyContextMiddleware` (Task 6).
- Produces: `sealed record FamilySummaryDto(string Id, LocalizedTextDto Name, bool IsDefault)`; routes `GET /api/families`, `GET /api/families/{familyId}/graph`, and `/api/families/{familyId}/people/…` mirroring every existing `PeopleController` action.

- [ ] **Step 1: Write the failing integration test**

Create `tests/integration/FamilyTree.IntegrationTests/FamilyRoutesTests.cs`, following the existing integration-test fixture pattern in that project:

```csharp
using System.Net;
using System.Net.Http.Json;
using FamilyTree.Application.Dtos;

namespace FamilyTree.IntegrationTests;

public sealed class FamilyRoutesTests : IClassFixture<FamilyTreeApiFactory>
{
    private readonly FamilyTreeApiFactory _factory;

    public FamilyRoutesTests(FamilyTreeApiFactory factory)
    {
        _factory = factory;
    }

    [Fact]
    public async Task GetFamilies_WhenNoRegistryIsConfigured_ShouldListTheSynthesizedDefaultFamily()
    {
        var client = _factory.CreateClient();

        var families = await client.GetFromJsonAsync<IReadOnlyList<FamilySummaryDto>>("/api/families");

        families.Should().ContainSingle();
        families!.Single().IsDefault.Should().BeTrue();
    }

    [Fact]
    public async Task GetGraph_WhenCalledThroughTheAliasAndTheFamilyRoute_ShouldReturnTheSamePeople()
    {
        var client = _factory.CreateClient();
        var families = await client.GetFromJsonAsync<IReadOnlyList<FamilySummaryDto>>("/api/families");
        var id = families!.Single().Id;

        var alias = await client.GetFromJsonAsync<FamilyGraphDto>("/api/family/graph");
        var scoped = await client.GetFromJsonAsync<FamilyGraphDto>($"/api/families/{id}/graph");

        scoped!.People.Select(p => p.Id).Should().Equal(alias!.People.Select(p => p.Id));
    }

    [Fact]
    public async Task GetGraph_WhenFamilyIsNotRegistered_ShouldReturnNotFound()
    {
        var client = _factory.CreateClient();

        var response = await client.GetAsync("/api/families/nowak/graph");

        response.StatusCode.Should().Be(HttpStatusCode.NotFound);
    }

    [Fact]
    public async Task GetPerson_WhenCalledThroughTheAliasAndTheFamilyRoute_ShouldReturnTheSamePerson()
    {
        var client = _factory.CreateClient();
        var families = await client.GetFromJsonAsync<IReadOnlyList<FamilySummaryDto>>("/api/families");
        var id = families!.Single().Id;
        var graph = await client.GetFromJsonAsync<FamilyGraphDto>("/api/family/graph");
        var personId = graph!.People.First().Id;

        var alias = await client.GetFromJsonAsync<PersonDto>($"/api/people/{personId}");
        var scoped = await client.GetFromJsonAsync<PersonDto>($"/api/families/{id}/people/{personId}");

        scoped!.Id.Should().Be(alias!.Id);
    }
}
```

If the integration project's factory class has a different name, use that name; do not create a second factory.

- [ ] **Step 2: Run the test to verify it fails**

Run: `dotnet test tests/integration/FamilyTree.IntegrationTests --filter FamilyRoutesTests`
Expected: FAIL — `/api/families` returns 404.

- [ ] **Step 3: Add the families query**

Create `src/backend/FamilyTree.Application/Families/FamilySummaryDto.cs`:

```csharp
using FamilyTree.Application.Dtos;

namespace FamilyTree.Application.Families;

public sealed record FamilySummaryDto(string Id, LocalizedTextDto Name, bool IsDefault);
```

Create `src/backend/FamilyTree.Application/Families/GetFamiliesQuery.cs`:

```csharp
namespace FamilyTree.Application.Families;

public sealed record GetFamiliesQuery : IRequest<IReadOnlyList<FamilySummaryDto>>;
```

Create `src/backend/FamilyTree.Application/Families/GetFamiliesHandler.cs`:

```csharp
namespace FamilyTree.Application.Families;

public sealed class GetFamiliesHandler : IRequestHandler<GetFamiliesQuery, IReadOnlyList<FamilySummaryDto>>
{
    private readonly IFamilyRegistryProvider _registry;
    private readonly IMapper _mapper;

    public GetFamiliesHandler(IFamilyRegistryProvider registry, IMapper mapper)
    {
        _registry = registry;
        _mapper = mapper;
    }

    public async Task<IReadOnlyList<FamilySummaryDto>> Handle(GetFamiliesQuery request, CancellationToken cancellationToken)
    {
        var registry = await _registry.GetAsync(cancellationToken);
        return [.. registry.Families.Select(family => new FamilySummaryDto(
            family.Id,
            _mapper.Map<LocalizedTextDto>(family.Name),
            registry.IsDefault(family.Id)))];
    }
}
```

- [ ] **Step 4: Add the controller**

Create `src/backend/FamilyTree.Api/Controllers/FamiliesController.cs`:

```csharp
using FamilyTree.Application.Families;
using FamilyTree.Application.Family;

namespace FamilyTree.Api.Controllers;

/// <summary>The registry of available family trees, and the family-scoped graph route.
/// Person routes for a family live on <see cref="PeopleController"/>'s second route template.</summary>
[ApiController]
[Route("api/families")]
public sealed class FamiliesController : ControllerBase
{
    private readonly ISender _sender;

    public FamiliesController(ISender sender)
    {
        _sender = sender;
    }

    [HttpGet]
    public async Task<ActionResult<IReadOnlyList<FamilySummaryDto>>> GetFamilies(CancellationToken cancellationToken)
    {
        return Ok(await _sender.Send(new GetFamiliesQuery(), cancellationToken));
    }

    [HttpGet("{familyId}/graph")]
    public async Task<ActionResult<FamilyGraphDto>> GetGraph(string familyId, CancellationToken cancellationToken)
    {
        // familyId is consumed by FamilyContextMiddleware; the handler reads it from IFamilyContext.
        return Ok(await _sender.Send(new GetFamilyGraphQuery(), cancellationToken));
    }
}
```

Give `PeopleController` a second route template so every existing action is reachable under a family, by adding above the existing `[Route("api/people")]`:

```csharp
[Route("api/people")]
[Route("api/families/{familyId}/people")]
```

Attribute routing matches both templates against the same actions, and the middleware picks the family out of the route values, so no action signature changes.

- [ ] **Step 5: Run the tests to verify they pass**

Run: `dotnet test tests/integration/FamilyTree.IntegrationTests --filter FamilyRoutesTests`
Expected: PASS (4 tests).

Run: `dotnet test`
Expected: PASS — whole suite.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "Serve the family registry and family-scoped API routes"
```

---

### Task 8: Family-scoped uploads and the health roll-up

**Files:**
- Modify: `src/backend/FamilyTree.Domain/MediaKeyGenerator.cs`
- Modify: `src/backend/FamilyTree.Application/People/AddPersonPhotoHandler.cs:55`
- Modify: `src/backend/FamilyTree.Api/Health/FamilyDataHealthCheck.cs`
- Test: `tests/unit/FamilyTree.UnitTests/Domain/MediaKeyGeneratorTests.cs`
- Test: `tests/unit/FamilyTree.UnitTests/Api/FamilyDataHealthCheckTests.cs` (existing file if present)

**Interfaces:**
- Consumes: `StorageKeys` (Task 2), `IFamilyContext` (Task 6), `FamilySnapshotRegistry.HealthSources` (Task 4).
- Produces: `MediaKeyGenerator.ForPerson(FamilyRegistry registry, string familyId, string personId, ReadOnlySpan<byte> fullBytes)`.

- [ ] **Step 1: Write the failing tests**

Add to `tests/unit/FamilyTree.UnitTests/Domain/MediaKeyGeneratorTests.cs`:

```csharp
    private static readonly FamilyRegistry TwoFamilies = new(
    [
        new FamilyRegistryEntry("perovsky", "family.json", new LocalizedText(), null),
        new FamilyRegistryEntry("kowalski", "kowalski.json", new LocalizedText(), null)
    ], "perovsky");

    [Fact]
    public void ForPerson_WhenFamilyIsTheDefault_ShouldKeepTheHistoricalKeyLayout()
    {
        var (_, fullKey, thumbKey) = MediaKeyGenerator.ForPerson(TwoFamilies, "perovsky", "p-0001", new byte[] { 1 });

        fullKey.Should().StartWith("uploads/p-0001/");
        thumbKey.Should().EndWith(".thumb.webp");
    }

    [Fact]
    public void ForPerson_WhenFamilyIsNotTheDefault_ShouldInsertTheFamilySegment()
    {
        var (_, fullKey, _) = MediaKeyGenerator.ForPerson(TwoFamilies, "kowalski", "p-0001", new byte[] { 1 });

        fullKey.Should().StartWith("uploads/kowalski/p-0001/");
    }

    [Fact]
    public void ForPerson_WhenTheSameBytesAreUploadedToTwoFamilies_ShouldProduceTheSameIdButDifferentKeys()
    {
        var a = MediaKeyGenerator.ForPerson(TwoFamilies, "perovsky", "p-0001", new byte[] { 1 });
        var b = MediaKeyGenerator.ForPerson(TwoFamilies, "kowalski", "p-0001", new byte[] { 1 });

        b.Id.Should().Be(a.Id);
        b.FullKey.Should().NotBe(a.FullKey);
    }
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `dotnet test tests/unit/FamilyTree.UnitTests --filter MediaKeyGeneratorTests`
Expected: FAIL — no overload takes a registry.

- [ ] **Step 3: Change the generator**

Replace the body of `MediaKeyGenerator.ForPerson` in `src/backend/FamilyTree.Domain/MediaKeyGenerator.cs`:

```csharp
    /// <summary>Computes a stable key tuple for a person in a family from the SHA-256 of
    /// <paramref name="fullBytes"/>. The default family keeps the historical
    /// <c>uploads/{personId}/…</c> layout; other families are prefixed with their id.</summary>
    public static (string Id, string FullKey, string ThumbKey) ForPerson(
        FamilyRegistry registry, string familyId, string personId, ReadOnlySpan<byte> fullBytes)
    {
        var hash = SHA256.HashData(fullBytes);
        var id = Convert.ToHexStringLower(hash)[..20];
        var prefix = StorageKeys.UploadPrefix(registry, familyId, personId);
        return (id, $"{prefix}/{id}.webp", $"{prefix}/{id}.thumb.webp");
    }
```

In `AddPersonPhotoHandler`, resolve the registry (inject `IFamilyRegistryProvider`) and call:

```csharp
        var registry = await _registryProvider.GetAsync(cancellationToken);
        var (id, fullKey, thumbKey) = MediaKeyGenerator.ForPerson(
            registry, _familyContext.FamilyId, request.Id, processed.Full);
```

- [ ] **Step 4: Add the health roll-up**

In `src/backend/FamilyTree.Api/Health/FamilyDataHealthCheck.cs`, keep the existing default-family verdict and add per-family data. Inject `FamilySnapshotRegistry` and add to the returned health data:

```csharp
        // Per-family roll-up: a degraded secondary family is visible in the payload without
        // failing the check that gates deploys, which tracks the default family only.
        var degraded = registry.HealthSources
            .Where(source => source.Health.IsDataSourceDegraded)
            .Select(source => source.FamilyId)
            .ToList();
        data["degradedFamilies"] = degraded;
```

Use the health-check's existing data-dictionary construction; if it currently returns `HealthCheckResult.Healthy(description)` with no data, add a `new Dictionary<string, object>` and pass it through both the healthy and degraded results.

- [ ] **Step 5: Run the tests to verify they pass**

Run: `dotnet test`
Expected: PASS — whole suite, including the updated `AddPersonPhotoHandlerTests` call sites.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "Scope uploaded media keys to the family and roll family health into /health"
```

---

## Phase B — Frontend

### Task 9: The families store and API client

**Files:**
- Create: `src/frontend/src/api/familiesApi.ts`
- Create: `src/frontend/src/stores/familiesStore.ts`
- Modify: `src/frontend/src/types/family.ts`
- Modify: `src/frontend/src/api/familyApi.ts`
- Test: `src/frontend/src/api/familiesApi.spec.ts`, `src/frontend/src/stores/familiesStore.spec.ts`

**Interfaces:**
- Consumes: `GET /api/families` (Task 7).
- Produces:
  - `interface FamilySummary { id: string; name: LocalizedText; isDefault: boolean }`
  - `interface FamilyLinkRef { family: string; personId: string | null; relation: 'origin' | 'joined' }` and `PersonSummary.familyLinks` / `PersonDetail.familyLinks`
  - `fetchFamilies(baseUrl?: string): Promise<FamilySummary[]>`
  - `useFamiliesStore()` with state `{ families, activeFamilyId, loaded }`, getters `defaultFamilyId`, `hasMultiple`, `familyById(id)`, `isKnown(id)`, action `load()`, `setActive(id)`
  - `fetchFamilyGraph(familyId, baseUrl?)` and `fetchPerson(familyId, id, baseUrl?)` — family-first parameter

- [ ] **Step 1: Write the failing tests**

Create `src/frontend/src/api/familiesApi.spec.ts`:

```ts
import { describe, it, expect, vi, afterEach } from 'vitest';
import { fetchFamilies } from './familiesApi';

afterEach(() => vi.unstubAllGlobals());

describe('fetchFamilies', () => {
  it('returns the registry', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => [{ id: 'perovsky', name: { ru: null, be: null, en: 'Perovsky' }, isDefault: true }]
    }));

    await expect(fetchFamilies()).resolves.toEqual([
      { id: 'perovsky', name: { ru: null, be: null, en: 'Perovsky' }, isDefault: true }
    ]);
  });

  it('throws on a failed response', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 500 }));

    await expect(fetchFamilies()).rejects.toThrow('500');
  });
});
```

Create `src/frontend/src/stores/familiesStore.spec.ts`:

```ts
import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { setActivePinia, createPinia } from 'pinia';
import { useFamiliesStore } from './familiesStore';

const two = [
  { id: 'perovsky', name: { ru: 'Перовские', be: null, en: 'Perovsky' }, isDefault: true },
  { id: 'kowalski', name: { ru: 'Ковальские', be: null, en: 'Kowalski' }, isDefault: false }
];

beforeEach(() => setActivePinia(createPinia()));
afterEach(() => vi.unstubAllGlobals());

function stubFetch(families: unknown) {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => families }));
}

describe('familiesStore', () => {
  it('loads the registry and adopts the default family as active', async () => {
    stubFetch(two);
    const store = useFamiliesStore();

    await store.load();

    expect(store.families).toHaveLength(2);
    expect(store.defaultFamilyId).toBe('perovsky');
    expect(store.activeFamilyId).toBe('perovsky');
    expect(store.hasMultiple).toBe(true);
  });

  it('reports a single-family registry as not switchable', async () => {
    stubFetch([two[0]]);
    const store = useFamiliesStore();

    await store.load();

    expect(store.hasMultiple).toBe(false);
  });

  it('only knows registered families', async () => {
    stubFetch(two);
    const store = useFamiliesStore();

    await store.load();

    expect(store.isKnown('kowalski')).toBe(true);
    expect(store.isKnown('nowak')).toBe(false);
  });

  it('loads the registry only once', async () => {
    stubFetch(two);
    const store = useFamiliesStore();

    await store.load();
    await store.load();

    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('falls back to an empty registry when the request fails', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')));
    const store = useFamiliesStore();

    await store.load();

    expect(store.families).toEqual([]);
    expect(store.hasMultiple).toBe(false);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm --prefix src/frontend test -- run src/api/familiesApi.spec.ts src/stores/familiesStore.spec.ts`
Expected: FAIL — modules not found.

- [ ] **Step 3: Add the types**

In `src/frontend/src/types/family.ts`:

```ts
export type FamilyLinkRelation = 'origin' | 'joined';

export interface FamilyLinkRef {
  family: string;
  personId: string | null;
  relation: FamilyLinkRelation;
}

export interface FamilySummary {
  id: string;
  name: LocalizedText;
  isDefault: boolean;
}
```

Add `familyLinks: FamilyLinkRef[];` to both `PersonSummary` and `PersonDetail`.

- [ ] **Step 4: Write the API client and the store**

Create `src/frontend/src/api/familiesApi.ts`:

```ts
import type { FamilySummary } from '../types/family';

export async function fetchFamilies(baseUrl = ''): Promise<FamilySummary[]> {
  const response = await fetch(`${baseUrl}/api/families`);
  if (!response.ok) {
    throw new Error(`Failed to load families: ${response.status}`);
  }
  return (await response.json()) as FamilySummary[];
}
```

Create `src/frontend/src/stores/familiesStore.ts`:

```ts
import { defineStore } from 'pinia';
import type { FamilySummary } from '../types/family';
import { fetchFamilies } from '../api/familiesApi';

interface FamiliesState {
  families: FamilySummary[];
  activeFamilyId: string | null;
  loaded: boolean;
}

export const useFamiliesStore = defineStore('families', {
  state: (): FamiliesState => ({ families: [], activeFamilyId: null, loaded: false }),
  getters: {
    defaultFamilyId(state): string | null {
      return state.families.find(family => family.isDefault)?.id ?? state.families[0]?.id ?? null;
    },
    hasMultiple(state): boolean {
      return state.families.length > 1;
    },
    familyById(state) {
      return (id: string): FamilySummary | undefined => state.families.find(family => family.id === id);
    },
    isKnown(state) {
      return (id: string): boolean => state.families.some(family => family.id === id);
    }
  },
  actions: {
    /** Loads the registry once per session. Failure leaves an empty registry, which
     *  renders as a single-family app rather than an error — the graph itself still loads. */
    async load(): Promise<void> {
      if (this.loaded) {
        return;
      }
      try {
        this.families = await fetchFamilies();
      } catch {
        this.families = [];
      }
      this.loaded = true;
      this.activeFamilyId ??= this.defaultFamilyId;
    },
    setActive(id: string): void {
      this.activeFamilyId = id;
    }
  }
});
```

- [ ] **Step 5: Make the family API client family-aware**

In `src/frontend/src/api/familyApi.ts`:

```ts
import type { FamilyGraph, PersonDetail } from '../types/family';

/** Family-scoped API root. A null family (registry not loaded) uses the unprefixed alias
 *  routes, which the API resolves to the default family. */
export function familyRoot(familyId: string | null, baseUrl = ''): string {
  return familyId ? `${baseUrl}/api/families/${encodeURIComponent(familyId)}` : `${baseUrl}/api`;
}

export async function fetchFamilyGraph(familyId: string | null, baseUrl = ''): Promise<FamilyGraph> {
  const root = familyRoot(familyId, baseUrl);
  const url = familyId ? `${root}/graph` : `${root}/family/graph`;
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to load family graph: ${response.status}`);
  }
  return (await response.json()) as FamilyGraph;
}

export async function fetchPerson(familyId: string | null, id: string, baseUrl = ''): Promise<PersonDetail> {
  const response = await fetch(`${familyRoot(familyId, baseUrl)}/people/${id}`);
  if (!response.ok) {
    throw new Error(`Failed to load person ${id}: ${response.status}`);
  }
  return (await response.json()) as PersonDetail;
}
```

Update `src/frontend/src/api/familyApi.spec.ts` for the new first parameter, adding a case for each branch:

```ts
it('uses the alias route when no family is given', async () => {
  const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ people: [], unions: [] }) });
  vi.stubGlobal('fetch', fetchMock);

  await fetchFamilyGraph(null);

  expect(fetchMock).toHaveBeenCalledWith('/api/family/graph');
});

it('uses the family-scoped route when a family is given', async () => {
  const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ people: [], unions: [] }) });
  vi.stubGlobal('fetch', fetchMock);

  await fetchFamilyGraph('kowalski');

  expect(fetchMock).toHaveBeenCalledWith('/api/families/kowalski/graph');
});
```

- [ ] **Step 6: Run the tests to verify they pass**

Run: `npm --prefix src/frontend test -- run src/api src/stores/familiesStore.spec.ts`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/frontend/src/api src/frontend/src/stores/familiesStore.ts src/frontend/src/stores/familiesStore.spec.ts src/frontend/src/types/family.ts
git commit -m "Add the families store and family-scoped API client"
```

---

### Task 10: Routing and the family-aware family store

**Files:**
- Create: `src/frontend/src/router/familyRoutes.ts`
- Modify: `src/frontend/src/router/index.ts`, `src/frontend/src/router/firstVisit.ts`
- Modify: `src/frontend/src/stores/familyStore.ts`, `src/frontend/src/stores/selectionStore.ts`
- Modify: `src/frontend/src/views/TreeView.vue:49`, `src/frontend/src/views/ChronicleView.vue:17`, `src/frontend/src/views/MembersView.vue:27`, `src/frontend/src/components/MemberDetail.vue:183`
- Test: `src/frontend/src/router/familyRoutes.spec.ts`, `src/frontend/src/stores/familyStore.spec.ts`

**Interfaces:**
- Consumes: `useFamiliesStore` (Task 9).
- Produces:
  - `buildRoutes(components): RouteRecordRaw[]` — bare + `/f/:familyId` pairs, route names `tree|chronicle|members|person` and `family-tree|family-chronicle|family-members|family-person`
  - `activeFamilyId(route): string | null` — the route's `familyId` param, else null
  - `familyStore.load(familyId: string | null)` and `familyStore.reset()`
  - `selectionStore.reset()`

- [ ] **Step 1: Write the failing tests**

Create `src/frontend/src/router/familyRoutes.spec.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { createRouter, createMemoryHistory } from 'vue-router';
import { buildRoutes, activeFamilyId } from './familyRoutes';

const Stub = { template: '<div />' };
const components = { tree: Stub, chronicle: Stub, members: Stub };

function makeRouter() {
  return createRouter({ history: createMemoryHistory(), routes: buildRoutes(components) });
}

describe('family routes', () => {
  it('keeps the unprefixed routes working', async () => {
    const router = makeRouter();

    await router.push('/person/anna-1900-p-7');

    expect(router.currentRoute.value.name).toBe('person');
    expect(activeFamilyId(router.currentRoute.value)).toBeNull();
  });

  it('resolves the family from a prefixed route', async () => {
    const router = makeRouter();

    await router.push('/f/kowalski/person/anna-1900-p-7');

    expect(router.currentRoute.value.name).toBe('family-person');
    expect(activeFamilyId(router.currentRoute.value)).toBe('kowalski');
  });

  it('routes a prefixed root to the tree', async () => {
    const router = makeRouter();

    await router.push('/f/kowalski');

    expect(router.currentRoute.value.name).toBe('family-tree');
    expect(activeFamilyId(router.currentRoute.value)).toBe('kowalski');
  });

  it('routes a prefixed members page with no slug', async () => {
    const router = makeRouter();

    await router.push('/f/kowalski/members');

    expect(router.currentRoute.value.name).toBe('family-members');
  });
});
```

Add to `src/frontend/src/router/firstVisit.spec.ts`:

```ts
it('redirects the first load of a prefixed root to that family chronicle', async () => {
  const router = makeRouter();
  await router.push('/f/kowalski');
  expect(router.currentRoute.value.name).toBe('family-chronicle');
  expect(router.currentRoute.value.params.familyId).toBe('kowalski');
});
```

and extend that spec's `makeRouter` with the prefixed routes:

```ts
      { path: '/f/:familyId', name: 'family-tree', component: Stub },
      { path: '/f/:familyId/chronicle', name: 'family-chronicle', component: Stub },
      { path: '/f/:familyId/person/:slug', name: 'family-person', component: Stub }
```

Add to `src/frontend/src/stores/familyStore.spec.ts`:

```ts
it('passes the family to the graph request', async () => {
  const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ people: [], unions: [] }) });
  vi.stubGlobal('fetch', fetchMock);
  const store = useFamilyStore();

  await store.load('kowalski');

  expect(fetchMock).toHaveBeenCalledWith('/api/families/kowalski/graph');
});

it('drops the previous family people and focus on reset', async () => {
  const store = useFamilyStore();
  store.people = [{ id: 'p-1' } as never];
  store.unions = [{ id: 'u-1' } as never];
  store.focusId = 'p-1';

  store.reset();

  expect(store.people).toEqual([]);
  expect(store.unions).toEqual([]);
  expect(store.focusId).toBeNull();
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm --prefix src/frontend test -- run src/router src/stores/familyStore.spec.ts`
Expected: FAIL — `familyRoutes` module missing, `reset` undefined.

- [ ] **Step 3: Write the route builder**

Create `src/frontend/src/router/familyRoutes.ts`:

```ts
import type { RouteLocationNormalizedLoaded, RouteRecordRaw } from 'vue-router';
import type { Component } from 'vue';

export interface ViewComponents {
  tree: Component;
  chronicle: Component;
  members: Component;
}

/**
 * Every view exists twice: unprefixed for the default family (so existing links keep
 * working) and under /f/:familyId for the rest. Both shapes share one component.
 */
export function buildRoutes(views: ViewComponents): RouteRecordRaw[] {
  return [
    { path: '/', name: 'tree', component: views.tree },
    { path: '/chronicle', name: 'chronicle', component: views.chronicle },
    { path: '/members/:slug?', name: 'members', component: views.members },
    { path: '/person/:slug', name: 'person', component: views.tree },
    { path: '/f/:familyId', name: 'family-tree', component: views.tree },
    { path: '/f/:familyId/chronicle', name: 'family-chronicle', component: views.chronicle },
    { path: '/f/:familyId/members/:slug?', name: 'family-members', component: views.members },
    { path: '/f/:familyId/person/:slug', name: 'family-person', component: views.tree }
  ];
}

/** The family named by the route, or null on the unprefixed routes (the default family). */
export function activeFamilyId(route: RouteLocationNormalizedLoaded): string | null {
  const value = route.params.familyId;
  const id = Array.isArray(value) ? value[0] : value;
  return id ? id : null;
}

/** The route name for a view in a family: prefixed when a family is named, bare otherwise. */
export function routeNameFor(view: 'tree' | 'chronicle' | 'members' | 'person', familyId: string | null): string {
  return familyId ? `family-${view}` : view;
}
```

In `src/frontend/src/router/index.ts`:

```ts
import { createRouter, createWebHistory } from 'vue-router';
import TreeView from '../views/TreeView.vue';
import ChronicleView from '../views/ChronicleView.vue';
import MembersView from '../views/MembersView.vue';
import { buildRoutes } from './familyRoutes';
import { installFirstVisitRedirect } from './firstVisit';

export const router = createRouter({
  history: createWebHistory(),
  routes: buildRoutes({ tree: TreeView, chronicle: ChronicleView, members: MembersView })
});

installFirstVisitRedirect(router);
```

In `src/frontend/src/router/firstVisit.ts`, make the redirect family-aware:

```ts
export function installFirstVisitRedirect(router: Router): void {
  router.beforeEach((to, from) => {
    if (from === START_LOCATION && !hasExplored()) {
      if (to.name === 'tree') {
        return { name: 'chronicle', replace: true };
      }
      if (to.name === 'family-tree') {
        return { name: 'family-chronicle', params: { familyId: to.params.familyId }, replace: true };
      }
    }
  });
  router.afterEach(to => {
    if (to.name !== 'chronicle' && to.name !== 'family-chronicle') {
      markExplored();
    }
  });
}
```

- [ ] **Step 4: Make the stores family-aware**

In `src/frontend/src/stores/familyStore.ts`, add `familyId` to state, take it in `load`, and add `reset`:

```ts
    async load(familyId: string | null = null): Promise<void> {
      this.loading = true;
      this.error = null;
      try {
        const graph = await fetchFamilyGraph(familyId);
        this.people = graph.people;
        this.unions = graph.unions;
        this.familyId = familyId;
        this.focusId = this.defaultRootId;
      } catch (cause) {
        this.error = cause instanceof Error ? cause.message : 'Failed to load family';
      } finally {
        this.loading = false;
      }
    },
    /** Drops the loaded family so a switch never shows the previous tree's people. */
    reset(): void {
      this.people = [];
      this.unions = [];
      this.focusId = null;
      this.familyId = null;
      this.error = null;
    },
```

In `src/frontend/src/stores/selectionStore.ts`, add:

```ts
    /** Clears the selection and its per-person cache — person ids are only unique
     *  within one family, so the cache must not survive a switch. */
    reset(): void {
      this.selectedId = null;
      this.detail = null;
      this.loading = false;
      this.error = null;
      this.cache = {};
    },
```

and pass the family into its `fetchPerson(...)` call:

```ts
        const detail = await fetchPerson(useFamilyStore().familyId, id);
```

- [ ] **Step 5: Load the right family in the views**

In `TreeView.vue`, `ChronicleView.vue`, `MembersView.vue`, and `MemberDetail.vue`, replace `store.load()` with a family-aware load, and re-load when the route's family changes:

```ts
import { watch } from 'vue';
import { useRoute } from 'vue-router';
import { activeFamilyId } from '../router/familyRoutes';
import { useSelectionStore } from '../stores/selectionStore';

const route = useRoute();
const selection = useSelectionStore();

function loadActiveFamily(): void {
  void store.load(activeFamilyId(route));
}

watch(() => activeFamilyId(route), () => {
  store.reset();
  selection.reset();
  loadActiveFamily();
});
```

and call `loadActiveFamily()` where `store.load()` was called. In `MemberDetail.vue:183` (a post-save refetch), use `store.load(store.familyId)`.

- [ ] **Step 6: Run the tests to verify they pass**

Run: `npm --prefix src/frontend test -- run src/router src/stores src/views`
Expected: PASS.

Run: `npm --prefix src/frontend test`
Expected: PASS — the whole frontend suite.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "Route and load per family, resetting state on a switch"
```

---

### Task 11: The cross-family button on the member card

**Files:**
- Modify: `src/frontend/src/components/PersonHeader.vue:121-124`
- Modify: `src/frontend/src/i18n/messages/{ru,be,en}.ts`
- Test: `src/frontend/src/components/PersonHeader.spec.ts`

**Interfaces:**
- Consumes: `useFamiliesStore` (Task 9), `routeNameFor` (Task 10), `PersonDetail.familyLinks` (Task 9), `localize` (existing i18n helper).
- Produces: `data-test="open-family-link"` buttons, one per resolvable link.

- [ ] **Step 1: Write the failing tests**

Add to `src/frontend/src/components/PersonHeader.spec.ts` (following its existing mount helper and Pinia setup):

```ts
const twoFamilies = [
  { id: 'perovsky', name: { ru: 'Перовские', be: null, en: 'Perovsky' }, isDefault: true },
  { id: 'kowalski', name: { ru: 'Ковальские', be: null, en: 'Kowalski' }, isDefault: false }
];

function withRegistry(families = twoFamilies) {
  const store = useFamiliesStore();
  store.families = families;
  store.loaded = true;
  return store;
}

it('offers a switch to the family a person came from', async () => {
  withRegistry();
  const wrapper = mountHeader({
    detail: { ...detailFixture, familyLinks: [{ family: 'kowalski', personId: 'p-42', relation: 'origin' }] }
  });

  const button = wrapper.get('[data-test="open-family-link"]');
  expect(button.text()).toContain('Kowalski');
});

it('routes to the linked person in the other family', async () => {
  withRegistry();
  const push = vi.fn();
  const wrapper = mountHeader({
    detail: { ...detailFixture, familyLinks: [{ family: 'kowalski', personId: 'p-42', relation: 'origin' }] },
    push
  });

  await wrapper.get('[data-test="open-family-link"]').trigger('click');

  expect(push).toHaveBeenCalledWith({
    name: 'family-person',
    params: { familyId: 'kowalski', slug: 'p-42' }
  });
});

it('routes to the other family root when the link names no counterpart', async () => {
  withRegistry();
  const push = vi.fn();
  const wrapper = mountHeader({
    detail: { ...detailFixture, familyLinks: [{ family: 'kowalski', personId: null, relation: 'joined' }] },
    push
  });

  await wrapper.get('[data-test="open-family-link"]').trigger('click');

  expect(push).toHaveBeenCalledWith({ name: 'family-tree', params: { familyId: 'kowalski' } });
});

it('hides a link to a family that is not registered', () => {
  withRegistry();
  const wrapper = mountHeader({
    detail: { ...detailFixture, familyLinks: [{ family: 'nowak', personId: 'p-1', relation: 'origin' }] }
  });

  expect(wrapper.find('[data-test="open-family-link"]').exists()).toBe(false);
});

it('renders no button when the person has no family links', () => {
  withRegistry();
  const wrapper = mountHeader({ detail: { ...detailFixture, familyLinks: [] } });

  expect(wrapper.find('[data-test="open-family-link"]').exists()).toBe(false);
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm --prefix src/frontend test -- run src/components/PersonHeader.spec.ts`
Expected: FAIL — no `open-family-link` element.

- [ ] **Step 3: Add the i18n strings**

In `src/frontend/src/i18n/messages/en.ts`, add a `family` group:

```ts
  family: {
    label: 'Family tree',
    openOrigin: '{name} family tree',
    openJoined: 'Family they joined: {name}',
    switchTo: 'Switch to {name}'
  },
```

`ru.ts`:

```ts
  family: {
    label: 'Родовое древо',
    openOrigin: 'Родовое древо: {name}',
    openJoined: 'Перешёл(ла) в семью: {name}',
    switchTo: 'Перейти к {name}'
  },
```

`be.ts`:

```ts
  family: {
    label: 'Радавое дрэва',
    openOrigin: 'Радавое дрэва: {name}',
    openJoined: 'Перайшоў(ла) у сям\'ю: {name}',
    switchTo: 'Перайсці да {name}'
  },
```

- [ ] **Step 4: Render the buttons**

In `PersonHeader.vue`'s `<script setup>`:

```ts
import { useFamiliesStore } from '../stores/familiesStore';
import { routeNameFor } from '../router/familyRoutes';
import type { FamilyLinkRef } from '../types/family';

const families = useFamiliesStore();

/** Only links whose family is actually registered — a button that cannot resolve
 *  is worse than no button. */
const resolvableLinks = computed(() =>
  (props.detail.familyLinks ?? []).filter(link => families.isKnown(link.family)));

function familyLinkLabel(link: FamilyLinkRef): string {
  const name = localize(families.familyById(link.family)!.name, locale.value);
  return link.relation === 'origin'
    ? t('family.openOrigin', { name })
    : t('family.openJoined', { name });
}

/** The counterpart id is a valid slug on its own (extractPersonId matches `p-<digits>$`),
 *  so the target view can resolve the person before its graph has loaded and then
 *  canonicalise the URL to the friendly slug. */
function openFamilyLink(link: FamilyLinkRef): void {
  if (link.personId) {
    void router.push({
      name: routeNameFor('person', link.family),
      params: { familyId: link.family, slug: link.personId }
    });
    return;
  }
  void router.push({ name: routeNameFor('tree', link.family), params: { familyId: link.family } });
}
```

Use the component's existing `locale` from `useI18n` and its existing `localize` import; add them if absent.

In the template, inside the existing `header__vocrow` div, after the "Open in members" button:

```html
        <button
          v-for="link in resolvableLinks"
          :key="`${link.family}-${link.relation}`"
          type="button"
          class="header__members"
          data-test="open-family-link"
          @click="openFamilyLink(link)"
        >
          {{ familyLinkLabel(link) }}
        </button>
```

- [ ] **Step 5: Canonicalise a bare-id slug after the graph loads**

In `TreeView.vue`, after the graph has loaded and the person is resolved from the slug, replace a bare-id URL with the friendly slug without adding a history entry:

```ts
// A cross-family jump arrives with the bare person id as the slug; once the graph is
// loaded, swap in the friendly slug so the address bar matches an in-app navigation.
watch(() => [family.people.length, route.params.slug] as const, () => {
  const slug = String(route.params.slug ?? '');
  if (!slug || family.people.length === 0) {
    return;
  }
  const id = extractPersonId(slug);
  const person = id ? family.personById(id) : undefined;
  if (person && slug !== personSlug(person)) {
    void router.replace({
      name: route.name as string,
      params: { ...route.params, slug: personSlug(person) }
    });
  }
});
```

Add a test in `src/frontend/src/views/TreeView.spec.ts` following its existing mount helper:

```ts
it('replaces a bare person id in the URL with the friendly slug once the graph loads', async () => {
  const replace = vi.fn();
  await mountTreeAt('/f/kowalski/person/p-42', { replace, people: [{ id: 'p-42', givenName: { en: 'Anna' }, surname: { en: 'Nowak' }, birthYear: 1900 }] });

  expect(replace).toHaveBeenCalledWith(expect.objectContaining({
    params: expect.objectContaining({ slug: 'anna-nowak-1900-p-42' })
  }));
});
```

- [ ] **Step 6: Run the tests to verify they pass**

Run: `npm --prefix src/frontend test -- run src/components/PersonHeader.spec.ts src/views/TreeView.spec.ts src/i18n`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "Offer a switch to a member's other family tree"
```

---

### Task 12: The family switcher in settings

**Files:**
- Create: `src/frontend/src/components/FamilySwitcher.vue`
- Modify: `src/frontend/src/components/SettingsPanel.vue`
- Modify: `src/frontend/src/App.vue`
- Test: `src/frontend/src/components/FamilySwitcher.spec.ts`

**Interfaces:**
- Consumes: `useFamiliesStore` (Task 9), `routeNameFor` / `activeFamilyId` (Task 10).
- Produces: `data-test="family-switcher"`, `data-test="family-switcher-option"`.

- [ ] **Step 1: Write the failing tests**

Create `src/frontend/src/components/FamilySwitcher.spec.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { createI18n } from 'vue-i18n';
import FamilySwitcher from './FamilySwitcher.vue';
import { useFamiliesStore } from '../stores/familiesStore';
import { en } from '../i18n/messages/en';

const two = [
  { id: 'perovsky', name: { ru: null, be: null, en: 'Perovsky' }, isDefault: true },
  { id: 'kowalski', name: { ru: null, be: null, en: 'Kowalski' }, isDefault: false }
];

const push = vi.fn();

function mountSwitcher(families = two, familyId: string | null = null) {
  const store = useFamiliesStore();
  store.families = families;
  store.loaded = true;
  store.activeFamilyId = familyId ?? 'perovsky';

  return mount(FamilySwitcher, {
    global: {
      plugins: [createI18n({ legacy: false, locale: 'en', messages: { en } })],
      mocks: { $route: { params: familyId ? { familyId } : {} } },
      stubs: {},
      provide: {}
    }
  });
}

beforeEach(() => {
  setActivePinia(createPinia());
  push.mockClear();
  vi.mock('vue-router', () => ({
    useRouter: () => ({ push }),
    useRoute: () => ({ params: {}, name: 'tree' })
  }));
});

describe('FamilySwitcher', () => {
  it('lists every registered family', () => {
    const wrapper = mountSwitcher();

    expect(wrapper.findAll('[data-test="family-switcher-option"]')).toHaveLength(2);
  });

  it('marks the active family', () => {
    const wrapper = mountSwitcher();

    const active = wrapper.findAll('[data-test="family-switcher-option"]')
      .filter(option => option.attributes('aria-checked') === 'true');
    expect(active).toHaveLength(1);
    expect(active[0].text()).toContain('Perovsky');
  });

  it('renders nothing when only one family is registered', () => {
    const wrapper = mountSwitcher([two[0]]);

    expect(wrapper.find('[data-test="family-switcher"]').exists()).toBe(false);
  });

  it('navigates to the default family with an unprefixed route', async () => {
    const wrapper = mountSwitcher(two, 'kowalski');

    await wrapper.findAll('[data-test="family-switcher-option"]')[0].trigger('click');

    expect(push).toHaveBeenCalledWith({ name: 'tree', params: {} });
  });

  it('navigates to another family with a prefixed route', async () => {
    const wrapper = mountSwitcher();

    await wrapper.findAll('[data-test="family-switcher-option"]')[1].trigger('click');

    expect(push).toHaveBeenCalledWith({ name: 'family-tree', params: { familyId: 'kowalski' } });
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm --prefix src/frontend test -- run src/components/FamilySwitcher.spec.ts`
Expected: FAIL — component missing.

- [ ] **Step 3: Write the component**

Create `src/frontend/src/components/FamilySwitcher.vue`, matching `SettingsPanel`'s existing row/label markup and token-based styling (never hardcode gilt colours — use `var(--gilt)` etc. so both themes hold):

```vue
<script setup lang="ts">
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRouter } from 'vue-router';
import { useFamiliesStore } from '../stores/familiesStore';
import { routeNameFor } from '../router/familyRoutes';
import { localize } from '../i18n/localize';
import type { FamilySummary } from '../types/family';

const { t, locale } = useI18n({ useScope: 'global' });
const families = useFamiliesStore();
const router = useRouter();

const options = computed(() => families.families);

function label(family: FamilySummary): string {
  return localize(family.name, locale.value) || family.id;
}

// The default family owns the unprefixed routes, so switching to it drops the /f/ segment.
function switchTo(family: FamilySummary): void {
  families.setActive(family.id);
  void router.push(family.isDefault
    ? { name: routeNameFor('tree', null), params: {} }
    : { name: routeNameFor('tree', family.id), params: { familyId: family.id } });
}
</script>

<template>
  <div v-if="families.hasMultiple" class="family-switcher" data-test="family-switcher">
    <span class="family-switcher__label">{{ t('family.label') }}</span>
    <ul class="family-switcher__list" role="radiogroup" :aria-label="t('family.label')">
      <li v-for="family in options" :key="family.id">
        <button
          type="button"
          class="family-switcher__option"
          :class="{ 'family-switcher__option--on': family.id === families.activeFamilyId }"
          role="radio"
          :aria-checked="family.id === families.activeFamilyId"
          :aria-label="t('family.switchTo', { name: label(family) })"
          data-test="family-switcher-option"
          @click="switchTo(family)"
        >
          {{ label(family) }}
        </button>
      </li>
    </ul>
  </div>
</template>

<style scoped lang="scss">
.family-switcher { display: flex; flex-direction: column; gap: 6px; }
.family-switcher__label { font-family: var(--font-body); font-size: 12px; color: var(--ink-soft); }
.family-switcher__list { display: flex; flex-wrap: wrap; gap: 6px; list-style: none; margin: 0; padding: 0; }
.family-switcher__option {
  font-family: var(--font-body); font-size: 13px; color: var(--ink);
  background: var(--control); border: 1px solid var(--glass-border); border-radius: 4px;
  padding: 4px 10px; cursor: pointer;

  &:hover:not(&--on) { background: var(--control-hover); }
  &--on { border-color: var(--gilt); color: var(--gilt-deep); }
}
</style>
```

If any of `--control`, `--control-hover`, `--ink-soft` are not defined in `src/styles/tokens.scss`, use the tokens `SettingsPanel.vue` already uses for its own options.

Add to `SettingsPanel.vue`'s template, as the first section (above the language row):

```html
    <FamilySwitcher />
```

with `import FamilySwitcher from './FamilySwitcher.vue';` in its script block.

- [ ] **Step 4: Load the registry at boot**

In `App.vue`:

```ts
import { useFamiliesStore } from './stores/familiesStore';

const familiesStore = useFamiliesStore();
onMounted(() => {
  ui.init();
  void auth.fetchMe();
  // Error-tolerant: a failed registry load leaves a single-family app.
  void familiesStore.load();
});
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npm --prefix src/frontend test -- run src/components/FamilySwitcher.spec.ts src/components/SettingsPanel.spec.ts src/App.spec.ts`
Expected: PASS.

Run: `npm --prefix src/frontend test`
Expected: PASS — whole frontend suite.

Run: `npm --prefix src/frontend run build`
Expected: PASS — `vue-tsc` clean.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "Add a family switcher to the settings panel"
```

---

### Task 13: Fixtures, end-to-end check, and documentation

**Files:**
- Create: `src/backend/FamilyTree.Api/Data/families.json` (dev-only, two families)
- Create: `src/backend/FamilyTree.Api/Data/kowalski.json` (small second seed)
- Modify: `src/backend/FamilyTree.Api/Data/family.json` (add one `familyLinks` entry)
- Modify: `docs/reference/` (the endpoint and data-format pages)
- Modify: `README.md`, `CLAUDE.md` (project overview)

**Interfaces:**
- Consumes: everything above.

- [ ] **Step 1: Add the dev fixtures**

Create `src/backend/FamilyTree.Api/Data/kowalski.json` with three people and one union, ids `k-0001`…`k-0003`, one of them the default root, and one carrying the reciprocal link back:

```json
{
  "people": [
    { "id": "k-0001", "givenName": { "ru": "Мацей", "en": "Maciej" },
      "surname": { "ru": "Ковальский", "en": "Kowalski" }, "sex": "male",
      "birth": { "year": 1840, "approx": true }, "isDefaultRoot": true },
    { "id": "k-0002", "givenName": { "ru": "Ядвига", "en": "Jadwiga" },
      "surname": { "ru": "Ковальская", "en": "Kowalska" }, "sex": "female",
      "birth": { "year": 1845, "approx": true }, "marriedIntoFamily": true },
    { "id": "k-0003", "givenName": { "ru": "Анна", "en": "Anna" },
      "surname": { "ru": "Ковальская", "en": "Kowalska" }, "sex": "female",
      "birth": { "year": 1870 }, "parents": { "fatherId": "k-0001", "motherId": "k-0002" },
      "familyLinks": [ { "family": "default", "personId": "p-0002", "relation": "joined" } ] }
  ],
  "unions": [
    { "id": "k-u1", "partnerIds": ["k-0001", "k-0002"], "marriageYear": 1868, "childIds": ["k-0003"] }
  ]
}
```

Create `src/backend/FamilyTree.Api/Data/families.json`:

```json
{
  "defaultFamily": "default",
  "families": [
    { "id": "default", "source": "Data/family.json",
      "name": { "ru": "Перовские", "be": "Пяроўскія", "en": "Perovsky" } },
    { "id": "kowalski", "source": "Data/kowalski.json",
      "name": { "ru": "Ковальские", "be": "Кавальскія", "en": "Kowalski" } }
  ]
}
```

Add the reciprocal link to one married-in person in `family.json` (pick a person with `marriedIntoFamily: true`):

```json
      "familyLinks": [ { "family": "kowalski", "personId": "k-0003", "relation": "origin" } ]
```

Leave `FamilyData:Registry` **unset** in `appsettings.json` so the default single-family path stays the tested default; document the opt-in in Step 3.

- [ ] **Step 2: Verify end to end in the browser**

Start the app on non-default ports (another session usually owns 5037/5173):

```bash
node scripts/dev.mjs --instance 4
```

Then, with the API's `FamilyData__Registry=Data/families.json` set for that run, use the Browser pane to confirm:
1. `/` still loads the main tree, and `/api/families` lists two families.
2. The settings panel shows the "Family tree" group with both families; picking Kowalski navigates to `/f/kowalski` and renders that tree.
3. Opening the married-in person's card shows the origin button; clicking it lands on `/f/kowalski/person/k-0003` and the URL becomes the friendly slug.
4. The reciprocal button on `k-0003` returns to the main tree.
5. Browser Back returns to the previous tree.
6. No console errors; `/health` reports `degradedFamilies: []`.

Capture a screenshot of the switched tree and the member card button.

- [ ] **Step 3: Update the documentation**

Run the `update-docs-for-pr` skill against the branch diff. It must cover, in `docs/reference/`:
- `GET /api/families`, `GET /api/families/{familyId}/graph`, and the family-scoped people routes, plus the note that the unprefixed routes are default-family aliases.
- The `families.json` format (`defaultFamily`, `id`, `source`, `name`, `mediaPrefix`) and the no-registry single-family fallback.
- The `familyLinks` seed field, its two relations, and that a link to an unregistered family is dropped.
- The media key layout table (default bare, others family-prefixed) and the `FamilyData:Registry` setting.
- The `/f/:familyId` URL shapes.

In `README.md` and `CLAUDE.md`, update the project overview so it describes multiple family trees rather than one.

- [ ] **Step 4: Run the full gates**

```bash
dotnet build
dotnet test
npm --prefix src/frontend run build
npm --prefix src/frontend test
```

Expected: all four PASS.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "Add two-family dev fixtures and document multi-family support"
```

- [ ] **Step 6: Stop**

Do not open a PR. Report to the owner: what shipped, the screenshots from Step 2, and the four gate results.

---

## Self-Review Notes

Checked against the spec:

- **Registry file, validation, fallback** → Task 1. **Storage keys + documented default-key consequence** → Task 2. **`familyLinks` + DTOs** → Task 3. **`FamilySnapshotRegistry` + loader factory + per-family isolation** → Task 4. **Override scoping, media expansion, link filtering** → Task 5. **Unknown-family 404 + provider-per-request** → Task 6. **`/api/families`, family routes, aliases** → Task 7. **Upload keys + health roll-up** → Task 8. **Registry store/API** → Task 9. **Routes, first-visit, store reset** → Task 10. **Member-card buttons + slug canonicalisation** → Task 11. **Settings switcher** → Task 12. **Fixtures + docs** → Task 13.
- Spec items deliberately deferred to their natural task rather than a separate one: the Mapster relation mapping (Task 3, Step 6) and the `IFamilyContext` handler wiring (Task 6, Step 5), which Task 5 leaves marked.
- Naming is consistent across tasks: `OverrideKey` / `UploadPrefix` / `ExpandSeedMedia`, `ForAsync`, `activeFamilyId`, `routeNameFor`, `reset`, `hasMultiple`, `isKnown`.
