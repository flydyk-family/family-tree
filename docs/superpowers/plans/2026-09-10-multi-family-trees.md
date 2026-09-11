# Multi-Family Trees Implementation Plan (rev. 2)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a visitor switch between several family trees, and jump from a member card to the family tree that person came from or married into.

**Architecture:** Each family is its own seed file, listed in a `families.json` registry that is read once at startup. A `FamilySnapshotRegistry` hands out one `FamilySnapshotProvider` per family. The family travels through a request as a scoped `IFamilyContext`, and the scoped `IFamilySnapshotProvider` and `IPersonOverrideStore` registrations resolve from it, so repositories, the query service and every MediatR handler stay family-agnostic. API routes gain `/api/families/{familyId}/…` forms, with today's routes aliased to the default family. The SPA mirrors them with `/f/:familyId` routes and derives the active family from the route.

**Tech Stack:** .NET 10 (ASP.NET Core controllers, MediatR, Mapster, FluentValidation, xUnit + Moq + AwesomeAssertions); Vue 3 + TypeScript (Pinia, Vue Router, vue-i18n, Vitest).

**Spec:** [`docs/superpowers/specs/2026-09-10-multi-family-trees-design.md`](../specs/2026-09-10-multi-family-trees-design.md) (revised 2026-09-11)

**Revision 2** replaces the first plan after a code-verified review. It is organised as four PRs, keeps `IPersonOverrideStore` unchanged behind a wrapper, and fixes the defects the review found: the startup crash, middleware wiring, the `/health` gap, Firestore-invalid keys, seed recognition, the upload cap, GCS registry reads, the id format, family-blind navigation and family-blind loading.

## Global Constraints

- **Default family keeps bare storage keys forever.** `OverrideKey(default, "p-0001") == "p-0001"`; only non-default families are prefixed. No migration of existing Firestore or R2 data.
- **Override key format:** `{familyId}__{personId}` — never a `/` (Firestore document ids cannot contain one).
- **Seed rule:** a media reference is an upload if and only if it starts with `uploads/`; everything else is a seed.
- **Person ids** stay `^p-\d+$` in every family. Do not relax the four validators or `extractPersonId`.
- **Family id format:** `^[a-z0-9-]+$`.
- **Existing routes must not change behaviour:** `/api/family/graph`, `/api/people/…`, `/`, `/chronicle`, `/members/:slug?`, `/person/:slug`.
- **No `FamilyData:Registry` → single-family fallback** with synthesized id `default`.
- **`FamilySnapshotProvider`'s refresh logic is off-limits:** its lock, TTL, last-good fallback and failure counter are unchanged. Only its constructor, the seed normalisation step, and one comment change.
- **Never resolve a scoped service from the root provider.** `ValidateScopes` is on in Development and the integration tests.
- **C#:** file-scoped namespaces, `_camelCase` readonly fields, `Async` suffix, `CancellationToken` last, always brace, structured logging with named placeholders, no PII in logs.
- **C# test naming:** `<MethodName>_When<Conditions>_Should<ExpectedResult>`, ≤ 80 characters where possible, 100 max.
- **Frontend focused tests:** `npm --prefix src/frontend test -- run <path>` (from the repo root).
- **Theme tokens only:** never hardcode a colour; use `var(--gilt)`, `var(--gilt-deep)`, `var(--ink)`, `var(--control-hover)`, `var(--bark)`, `var(--on-accent)`, `var(--font-body)`, `var(--font-display)`. Check both Film and Classic themes.
- **Each PR carries its own docs** (`docs/reference/`, and the README/CLAUDE.md overview when the product description changes). Use the `update-docs-for-pr` skill before opening each PR.
- **Delivery:** open each PR and **stop**. The owner reviews and merges. Start the next PR only after the previous one is merged, on a new branch off updated `main`. Never self-merge.
- **Before every commit:** `git branch --show-current` must be the PR's branch.

## PR map

| PR | Branch | Tasks | Visible change |
|---|---|---|---|
| 1 | `claude/family-tree-switching-ee48f8` (current; already holds the spec and plan) | 1–6 | none |
| 2 | `claude/multi-family-2-api` | 7–9 | API only; registry opt-in |
| 3 | `claude/multi-family-3-spa` | 10–14 | switcher, only with 2+ families |
| 4 | `claude/multi-family-4-links` | 15–16 | member-card buttons |

---
## PR 1 — Backend foundation (no behaviour change)

**PR title:** "Serve family data through a per-family registry"

Everything in this PR is inert while `FamilyData:Registry` is unset: the synthesized one-family registry reproduces today's behaviour exactly, and the whole existing suite must stay green after every task.

### Task 1: The family registry, read once at startup

**Files:**
- Create: `src/backend/FamilyTree.Domain/FamilyRegistry.cs`
- Create: `src/backend/FamilyTree.Infrastructure/FamilyRegistryFile.cs`
- Create: `src/backend/FamilyTree.Infrastructure/FamilyRegistryLoader.cs`
- Create: `src/backend/FamilyTree.Infrastructure/IRegistryFileReader.cs`
- Create: `src/backend/FamilyTree.Infrastructure/LocalRegistryFileReader.cs`
- Create: `src/backend/FamilyTree.Infrastructure/GcsRegistryFileReader.cs`
- Modify: `src/backend/FamilyTree.Api/Configuration/FamilyDataSettings.cs`
- Modify: `src/backend/FamilyTree.Infrastructure/FamilyDataOptions.cs`
- Test: `tests/unit/FamilyTree.UnitTests/Infrastructure/FamilyRegistryLoaderTests.cs`

**Interfaces:**
- Consumes: `LocalizedText` (Domain). `GcsFamilyDataLoader.ParseGsUri` is private, so the GCS reader parses `gs://bucket/object` itself.
- Produces:
  - `sealed record FamilyRegistryEntry(string Id, string Source, LocalizedText Name, string? MediaPrefix)`
  - `sealed record FamilyRegistry(IReadOnlyList<FamilyRegistryEntry> Families, string DefaultFamilyId)`, with the members:
    - `const string SyntheticId = "default"`
    - `FamilyRegistryEntry Default`
    - `FamilyRegistryEntry? Find(string)`
    - `bool Contains(string)`
    - `bool IsDefault(string)`
    - `string MediaPrefixFor(string)`
    - `static FamilyRegistry Single(string source)`
  - `interface IRegistryFileReader { string Read(string location); }`
  - `sealed class FamilyRegistryLoader`, with the members:
    - `FamilyRegistry Load()`
    - `static FamilyRegistry Parse(string json, string registryLocation)`
    - `static string ResolveSource(string registryLocation, string source)`
  - `FamilyDataOptions.Registry` (string, default `""`) and `FamilyDataOptions.IsGcsRegistry`

- [ ] **Step 1: Write the failing tests**

Create `tests/unit/FamilyTree.UnitTests/Infrastructure/FamilyRegistryLoaderTests.cs`:

```csharp
using System.Text.Json;
using FamilyTree.Domain;
using FamilyTree.Infrastructure;
using Microsoft.Extensions.Logging.Abstractions;
using Microsoft.Extensions.Options;
using Moq;

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
        var registry = FamilyRegistryLoader.Parse(TwoFamilies, "Data/families.json");

        registry.Families.Should().HaveCount(2);
        registry.DefaultFamilyId.Should().Be("perovsky");
        registry.IsDefault("perovsky").Should().BeTrue();
        registry.IsDefault("kowalski").Should().BeFalse();
    }

    [Fact]
    public void Parse_WhenSourceIsRelative_ShouldResolveItBesideTheRegistry()
    {
        var registry = FamilyRegistryLoader.Parse(TwoFamilies, "Data/families.json");

        registry.Find("kowalski")!.Source.Should().Be("Data/kowalski.json");
    }

    [Fact]
    public void Parse_WhenRegistryIsInGcs_ShouldResolveSourcesInTheSameFolder()
    {
        var registry = FamilyRegistryLoader.Parse(TwoFamilies, "gs://seeds/prod/families.json");

        registry.Find("kowalski")!.Source.Should().Be("gs://seeds/prod/kowalski.json");
    }

    [Theory]
    [InlineData("gs://other/x.json")]
    [InlineData("/abs/x.json")]
    public void ResolveSource_WhenSourceIsAbsolute_ShouldKeepItUnchanged(string source)
    {
        FamilyRegistryLoader.ResolveSource("Data/families.json", source).Should().Be(source);
    }

    [Fact]
    public void MediaPrefixFor_WhenMediaPrefixIsConfigured_ShouldUseIt()
    {
        var registry = FamilyRegistryLoader.Parse(TwoFamilies, "Data/families.json");

        registry.MediaPrefixFor("kowalski").Should().Be("portraits/kw");
    }

    [Fact]
    public void MediaPrefixFor_WhenMediaPrefixIsOmitted_ShouldDeriveItFromTheId()
    {
        var registry = new FamilyRegistry(
        [
            new FamilyRegistryEntry("perovsky", "a.json", new LocalizedText(), null),
            new FamilyRegistryEntry("nowak", "b.json", new LocalizedText(), null)
        ], "perovsky");

        registry.MediaPrefixFor("perovsky").Should().Be("portraits");
        registry.MediaPrefixFor("nowak").Should().Be("portraits/nowak");
    }

    [Fact]
    public void Parse_WhenDefaultFamilyIsNotListed_ShouldThrow()
    {
        var json = """
        { "defaultFamily": "missing",
          "families": [ { "id": "perovsky", "source": "family.json", "name": { "en": "P" } } ] }
        """;

        var act = () => FamilyRegistryLoader.Parse(json, "families.json");

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

        var act = () => FamilyRegistryLoader.Parse(json, "families.json");

        act.Should().Throw<InvalidOperationException>().WithMessage("*duplicate*");
    }

    [Theory]
    [InlineData("Perovsky")]
    [InlineData("per_ovsky")]
    [InlineData("per/ovsky")]
    [InlineData("")]
    public void Parse_WhenFamilyIdIsNotSlugShaped_ShouldThrow(string id)
    {
        var json = JsonSerializer.Serialize(new
        {
            defaultFamily = id,
            families = new[] { new { id, source = "a.json", name = new { en = "A" } } }
        });

        var act = () => FamilyRegistryLoader.Parse(json, "families.json");

        act.Should().Throw<InvalidOperationException>();
    }

    [Fact]
    public void Parse_WhenFamilyHasNoSource_ShouldThrow()
    {
        var json = """{ "defaultFamily": "a", "families": [ { "id": "a", "name": { "en": "A" } } ] }""";

        var act = () => FamilyRegistryLoader.Parse(json, "families.json");

        act.Should().Throw<InvalidOperationException>().WithMessage("*source*");
    }

    [Fact]
    public void Parse_WhenRegistryListsNoFamilies_ShouldThrow()
    {
        var act = () => FamilyRegistryLoader.Parse("""{ "defaultFamily": "a", "families": [] }""", "families.json");

        act.Should().Throw<InvalidOperationException>().WithMessage("*no families*");
    }

    [Fact]
    public void Load_WhenNoRegistryIsConfigured_ShouldSynthesizeTheDefaultFamily()
    {
        var reader = new Mock<IRegistryFileReader>(MockBehavior.Strict);
        var loader = new FamilyRegistryLoader(
            Options.Create(new FamilyDataOptions { Source = "Data/family.json" }),
            reader.Object,
            NullLogger<FamilyRegistryLoader>.Instance);

        var registry = loader.Load();

        registry.DefaultFamilyId.Should().Be(FamilyRegistry.SyntheticId);
        registry.Default.Source.Should().Be("Data/family.json");
        registry.MediaPrefixFor(FamilyRegistry.SyntheticId).Should().Be("portraits");
    }

    [Fact]
    public void Load_WhenRegistryIsConfigured_ShouldReadAndParseIt()
    {
        var reader = new Mock<IRegistryFileReader>();
        reader.Setup(r => r.Read("Data/families.json")).Returns(TwoFamilies);
        var loader = new FamilyRegistryLoader(
            Options.Create(new FamilyDataOptions { Registry = "Data/families.json" }),
            reader.Object,
            NullLogger<FamilyRegistryLoader>.Instance);

        loader.Load().Families.Should().HaveCount(2);
    }
}
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `dotnet test tests/unit/FamilyTree.UnitTests --filter FamilyRegistryLoaderTests`
Expected: FAIL — the types don't exist yet, so the tests don't compile.

- [ ] **Step 3: Write the domain model**

Create `src/backend/FamilyTree.Domain/FamilyRegistry.cs`:

```csharp
namespace FamilyTree.Domain;

/// <summary>One family tree the app serves: its id, resolved seed source, display name and
/// optional media key prefix.</summary>
public sealed record FamilyRegistryEntry(string Id, string Source, LocalizedText Name, string? MediaPrefix);

/// <summary>The family trees the app serves and which one is the default. The default family is
/// the one whose URLs and storage keys carry no family segment.</summary>
public sealed record FamilyRegistry(IReadOnlyList<FamilyRegistryEntry> Families, string DefaultFamilyId)
{
    /// <summary>The id of the synthesized family used when no registry is configured.</summary>
    public const string SyntheticId = "default";

    private const string SeedMediaRoot = "portraits";

    public FamilyRegistryEntry Default =>
        Find(DefaultFamilyId) ?? throw new InvalidOperationException($"Default family '{DefaultFamilyId}' is not registered.");

    public FamilyRegistryEntry? Find(string familyId) => Families.FirstOrDefault(family => family.Id == familyId);

    public bool Contains(string familyId) => Find(familyId) is not null;

    public bool IsDefault(string familyId) => familyId == DefaultFamilyId;

    /// <summary>The media key prefix for a family's seed media. The default family keeps the
    /// historical bare <c>portraits</c> prefix.</summary>
    public string MediaPrefixFor(string familyId)
    {
        if (Find(familyId)?.MediaPrefix is { Length: > 0 } configured)
        {
            return configured;
        }

        return IsDefault(familyId) ? SeedMediaRoot : $"{SeedMediaRoot}/{familyId}";
    }

    /// <summary>The one-family registry used when no registry file is configured.</summary>
    public static FamilyRegistry Single(string source) =>
        new([new FamilyRegistryEntry(SyntheticId, source, new LocalizedText(), null)], SyntheticId);
}
```

- [ ] **Step 4: Write the readers and the loader**

Create `src/backend/FamilyTree.Infrastructure/IRegistryFileReader.cs`:

```csharp
namespace FamilyTree.Infrastructure;

/// <summary>Reads the registry document's text. Synchronous by design: it runs once, at startup,
/// inside a singleton factory.</summary>
public interface IRegistryFileReader
{
    string Read(string location);
}
```

Create `src/backend/FamilyTree.Infrastructure/LocalRegistryFileReader.cs`:

```csharp
using Microsoft.Extensions.Hosting;

namespace FamilyTree.Infrastructure;

public sealed class LocalRegistryFileReader : IRegistryFileReader
{
    private readonly IHostEnvironment _environment;

    public LocalRegistryFileReader(IHostEnvironment environment)
    {
        _environment = environment;
    }

    public string Read(string location)
    {
        var path = Path.IsPathRooted(location) ? location : Path.Combine(_environment.ContentRootPath, location);
        if (!File.Exists(path))
        {
            throw new FileNotFoundException($"Family registry file not found at '{path}'.", path);
        }

        return File.ReadAllText(path);
    }
}
```

Create `src/backend/FamilyTree.Infrastructure/GcsRegistryFileReader.cs`:

```csharp
using System.Diagnostics.CodeAnalysis;
using System.Text;
using Google.Cloud.Storage.V1;

namespace FamilyTree.Infrastructure;

/// <summary>Reads a <c>gs://bucket/object</c> registry via ADC. [ExcludeFromCodeCoverage]: a thin
/// SDK wrapper, same rationale as <see cref="GcsFamilyDataLoader"/>.</summary>
[ExcludeFromCodeCoverage]
public sealed class GcsRegistryFileReader : IRegistryFileReader
{
    private readonly StorageClient _client;

    public GcsRegistryFileReader(StorageClient client)
    {
        _client = client;
    }

    public string Read(string location)
    {
        var rest = location["gs://".Length..];
        var slash = rest.IndexOf('/');
        if (slash <= 0 || slash == rest.Length - 1)
        {
            throw new ArgumentException($"Registry '{location}' must be of the form gs://bucket/object.", nameof(location));
        }

        using var stream = new MemoryStream();
        _client.DownloadObject(rest[..slash], rest[(slash + 1)..], stream);
        return Encoding.UTF8.GetString(stream.ToArray());
    }
}
```

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
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;

namespace FamilyTree.Infrastructure;

/// <summary>Builds the <see cref="FamilyRegistry"/> once at startup: from <c>families.json</c> when
/// <see cref="FamilyDataOptions.Registry"/> is set, else a synthesized one-family registry.</summary>
public sealed partial class FamilyRegistryLoader
{
    private static readonly JsonSerializerOptions SerializerOptions = new(JsonSerializerDefaults.Web);

    private readonly FamilyDataOptions _options;
    private readonly IRegistryFileReader _reader;
    private readonly ILogger<FamilyRegistryLoader> _logger;

    public FamilyRegistryLoader(IOptions<FamilyDataOptions> options, IRegistryFileReader reader, ILogger<FamilyRegistryLoader> logger)
    {
        _options = options.Value;
        _reader = reader;
        _logger = logger;
    }

    public FamilyRegistry Load()
    {
        if (string.IsNullOrWhiteSpace(_options.Registry))
        {
            _logger.LogInformation("No family registry configured; serving one family from the seed source.");
            return FamilyRegistry.Single(_options.Source);
        }

        try
        {
            var registry = Parse(_reader.Read(_options.Registry), _options.Registry);
            _logger.LogInformation("Family registry loaded ({FamilyCount} families, default {DefaultFamily}).",
                registry.Families.Count, registry.DefaultFamilyId);
            return registry;
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Family registry at {Registry} could not be loaded.", _options.Registry);
            throw;
        }
    }

    /// <summary>Parses and validates registry JSON, resolving each relative <c>source</c> against
    /// <paramref name="registryLocation"/>. Throws <see cref="InvalidOperationException"/> on any
    /// malformed entry so a bad registry fails startup instead of serving half a site.</summary>
    public static FamilyRegistry Parse(string json, string registryLocation)
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
            if (!IdPattern().IsMatch(id))
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

            entries.Add(new FamilyRegistryEntry(
                id, ResolveSource(registryLocation, entry.Source), entry.Name ?? new LocalizedText(), entry.MediaPrefix));
        }

        var defaultId = file.DefaultFamily ?? "";
        if (!seen.Contains(defaultId))
        {
            throw new InvalidOperationException($"Default family '{defaultId}' is not listed in the registry.");
        }

        return new FamilyRegistry(entries, defaultId);
    }

    /// <summary>Resolves a family source against the registry's location: absolute paths and
    /// <c>gs://</c> URIs pass through; a relative source sits beside the registry.</summary>
    public static string ResolveSource(string registryLocation, string source)
    {
        if (source.StartsWith("gs://", StringComparison.OrdinalIgnoreCase) || Path.IsPathRooted(source))
        {
            return source;
        }

        var slash = registryLocation.LastIndexOfAny(['/', '\\']);
        return slash < 0 ? source : $"{registryLocation[..(slash + 1)]}{source}";
    }

    [GeneratedRegex("^[a-z0-9-]+$")]
    private static partial Regex IdPattern();
}
```

- [ ] **Step 5: Add the setting**

In `src/backend/FamilyTree.Api/Configuration/FamilyDataSettings.cs`, add below `Source`:

```csharp
    /// <summary>Optional path or gs:// URI of families.json. Empty means one family from <see cref="Source"/>.</summary>
    public string Registry { get; init; } = "";
```

In `src/backend/FamilyTree.Infrastructure/FamilyDataOptions.cs`, add:

```csharp
    /// <summary>Optional local path or "gs://" URI of the family registry. Empty means a single
    /// synthesized family reading <see cref="Source"/>.</summary>
    public string Registry { get; set; } = "";

    /// <summary>True when <see cref="Registry"/> is a "gs://" URI.</summary>
    public bool IsGcsRegistry => Registry.StartsWith("gs://", StringComparison.OrdinalIgnoreCase);
```

- [ ] **Step 6: Run the tests to verify they pass**

Run: `dotnet test tests/unit/FamilyTree.UnitTests --filter FamilyRegistryLoaderTests`
Expected: PASS (18 test cases).

- [ ] **Step 7: Commit**

```bash
git add src/backend/FamilyTree.Domain/FamilyRegistry.cs src/backend/FamilyTree.Infrastructure/FamilyRegistry*.cs src/backend/FamilyTree.Infrastructure/*RegistryFileReader.cs src/backend/FamilyTree.Api/Configuration/FamilyDataSettings.cs src/backend/FamilyTree.Infrastructure/FamilyDataOptions.cs tests/unit/FamilyTree.UnitTests/Infrastructure/FamilyRegistryLoaderTests.cs
git commit -m "Add the family registry and its startup loader"
```

---

### Task 2: Storage keys and the single seed rule

**Files:**
- Create: `src/backend/FamilyTree.Domain/StorageKeys.cs`
- Modify: `src/backend/FamilyTree.Application/People/PromotePersonPhotoHandler.cs:48`
- Modify: `src/backend/FamilyTree.Application/People/DeletePersonPhotoHandler.cs:80`
- Modify: `src/backend/FamilyTree.Application/People/SuppressSeedMediaHandler.cs:64-66`
- Modify: `src/backend/FamilyTree.Infrastructure/FamilySnapshotProvider.cs` (the `SeedTile` doc comment only)
- Test: `tests/unit/FamilyTree.UnitTests/Domain/StorageKeysTests.cs`
- Test: `tests/unit/FamilyTree.UnitTests/Application/{Promote,Delete}PersonPhotoHandlerTests.cs`, `SuppressSeedMediaHandlerTests.cs`

**Interfaces:**
- Consumes: `FamilyRegistry` (Task 1).
- Produces: `static class StorageKeys` with the methods:
  - `string OverrideKey(FamilyRegistry, string familyId, string personId)`
  - `string UploadPrefix(FamilyRegistry, string familyId, string personId)`
  - `string ExpandSeedMedia(FamilyRegistry, string familyId, string reference)`
  - `bool IsUploadKey(string reference)`
  - `const string OverrideSeparator = "__"`

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
    public void OverrideKey_WhenFamilyIsTheDefault_ShouldReturnTheBarePersonId() =>
        StorageKeys.OverrideKey(Registry, "perovsky", "p-0001").Should().Be("p-0001");

    [Fact]
    public void OverrideKey_WhenFamilyIsNotTheDefault_ShouldPrefixWithoutASlash()
    {
        var key = StorageKeys.OverrideKey(Registry, "kowalski", "p-0001");

        key.Should().Be("kowalski__p-0001");
        key.Should().NotContain("/");
    }

    [Fact]
    public void UploadPrefix_WhenFamilyIsTheDefault_ShouldKeepTheHistoricalLayout() =>
        StorageKeys.UploadPrefix(Registry, "perovsky", "p-0001").Should().Be("uploads/p-0001");

    [Fact]
    public void UploadPrefix_WhenFamilyIsNotTheDefault_ShouldInsertTheFamilySegment() =>
        StorageKeys.UploadPrefix(Registry, "kowalski", "p-0001").Should().Be("uploads/kowalski/p-0001");

    [Fact]
    public void ExpandSeedMedia_WhenFamilyIsTheDefault_ShouldLeaveABareNameAlone() =>
        StorageKeys.ExpandSeedMedia(Registry, "perovsky", "p-0001.jpg").Should().Be("p-0001.jpg");

    [Fact]
    public void ExpandSeedMedia_WhenFamilyIsNotTheDefault_ShouldPrefixABareName() =>
        StorageKeys.ExpandSeedMedia(Registry, "kowalski", "p-0001.jpg").Should().Be("portraits/kowalski/p-0001.jpg");

    [Fact]
    public void ExpandSeedMedia_WhenReferenceAlreadyHasASlash_ShouldLeaveItUntouched() =>
        StorageKeys.ExpandSeedMedia(Registry, "kowalski", "uploads/p-0001/ab.webp").Should().Be("uploads/p-0001/ab.webp");

    [Theory]
    [InlineData("uploads/p-0001/ab.webp", true)]
    [InlineData("uploads/kowalski/p-0001/ab.webp", true)]
    [InlineData("p-0001.jpg", false)]
    [InlineData("portraits/kowalski/p-0001.jpg", false)]
    public void IsUploadKey_WhenGivenAReference_ShouldRecogniseOnlyTheUploadsPrefix(string reference, bool expected) =>
        StorageKeys.IsUploadKey(reference).Should().Be(expected);
}
```

Add one test to each photo-handler test class, using that class's existing arrangement helpers, with a person whose seed portrait is the prefixed reference `"portraits/kowalski/p-0001.jpg"`:

- `PromotePersonPhotoHandlerTests`, `Handle_WhenSeedReferenceHasAFamilyPrefix_ShouldTreatItAsASeed`: promoting the seed tile takes the seed branch (it clears the override portrait so the seed shows) and never writes an upload key as the portrait. Assert exactly what the existing bare-seed promote test asserts.
- `DeletePersonPhotoHandlerTests`, `Handle_WhenRemovedReferenceIsAPrefixedSeed_ShouldNotDeleteTheObject`: verify `IMediaStore.DeleteAsync` is `Times.Never()` for `"portraits/kowalski/p-0001.jpg"`.
- `SuppressSeedMediaHandlerTests`, `Handle_WhenSeedPortraitHasAFamilyPrefix_ShouldHideIt`: the appended media override's `HiddenSeeds` contains `"portraits/kowalski/p-0001.jpg"`.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `dotnet test tests/unit/FamilyTree.UnitTests --filter "StorageKeysTests|PersonPhotoHandlerTests|SuppressSeedMediaHandlerTests"`
Expected: FAIL — `StorageKeys` is missing, and the three new handler tests fail on the `Contains('/')` checks.

- [ ] **Step 3: Write `StorageKeys`**

Create `src/backend/FamilyTree.Domain/StorageKeys.cs`:

```csharp
namespace FamilyTree.Domain;

/// <summary>The single home of the family-scoping rule for durable keys: the default family keeps
/// its historical bare keys; every other family is prefixed with its id.</summary>
/// <remarks>Because the default family's keys are unprefixed, promoting a different family to
/// default would orphan its existing overrides and uploads; that would need a one-time rewrite.</remarks>
public static class StorageKeys
{
    /// <summary>Separates family and person in an override key. Firestore document ids cannot contain
    /// '/'; family ids cannot contain '_', so the separator is unambiguous.</summary>
    public const string OverrideSeparator = "__";

    private const string UploadsRoot = "uploads/";

    /// <summary>Firestore document id for a person's override documents.</summary>
    public static string OverrideKey(FamilyRegistry registry, string familyId, string personId) =>
        registry.IsDefault(familyId) ? personId : $"{familyId}{OverrideSeparator}{personId}";

    /// <summary>R2 key prefix for a person's uploaded media.</summary>
    public static string UploadPrefix(FamilyRegistry registry, string familyId, string personId) =>
        registry.IsDefault(familyId) ? $"{UploadsRoot}{personId}" : $"{UploadsRoot}{familyId}/{personId}";

    /// <summary>Expands a seed media reference to a full key. A bare name belongs under the family's
    /// media prefix; a reference already containing '/' is returned unchanged.</summary>
    public static string ExpandSeedMedia(FamilyRegistry registry, string familyId, string reference) =>
        reference.Contains('/') || registry.IsDefault(familyId)
            ? reference
            : $"{registry.MediaPrefixFor(familyId)}/{reference}";

    /// <summary>True for an uploaded object; every other media reference is a seed.</summary>
    public static bool IsUploadKey(string reference) =>
        reference.StartsWith(UploadsRoot, StringComparison.Ordinal);
}
```

- [ ] **Step 4: Switch every seed check to the new rule**

- `PromotePersonPhotoHandler.cs:48`: replace `if (!target.Full.Contains('/'))` with `if (!StorageKeys.IsUploadKey(target.Full))`.
- `DeletePersonPhotoHandler.cs:80`: replace `!removed.Full.Contains('/')` with `!StorageKeys.IsUploadKey(removed.Full)`.
- `SuppressSeedMediaHandler.cs:64`: replace `!p.Contains('/')` with `!StorageKeys.IsUploadKey(p)`.
- `SuppressSeedMediaHandler.cs:66`: replace `!g.Full.Contains('/')` with `!StorageKeys.IsUploadKey(g.Full)`.
- In `FamilySnapshotProvider.SeedTile`'s doc comment, replace "Its key is a bare filename (no '/'), which the editor UI and the promote/delete handlers use to recognize a seed" with "Its key is not under uploads/, which is how the editor UI and the promote/delete handlers recognise a seed (see StorageKeys.IsUploadKey)".

This is behaviour-neutral for the default family: no reference in `Data/family.json` contains a `/`.

- [ ] **Step 5: Run the tests to verify they pass**

Run: `dotnet test`
Expected: PASS — the whole suite.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "Centralise storage keys and recognise seeds by the uploads prefix"
```

---

### Task 3: Cross-family links on a person

**Files:**
- Create: `src/backend/FamilyTree.Domain/FamilyLink.cs`
- Create: `src/backend/FamilyTree.Application/Dtos/FamilyLinkDto.cs`
- Modify: `src/backend/FamilyTree.Domain/Person.cs`, `src/backend/FamilyTree.Application/Dtos/PersonDto.cs`, `src/backend/FamilyTree.Application/Dtos/PersonSummaryDto.cs`, `src/backend/FamilyTree.Application/Mapping/MappingConfig.cs`
- Test: `tests/unit/FamilyTree.UnitTests/Infrastructure/FamilyLinkSeedTests.cs`, `tests/unit/FamilyTree.UnitTests/Application/MappingConfigTests.cs`

**Interfaces:**
- Produces:
  - `enum FamilyLinkRelation { Origin, Joined }`
  - `sealed record FamilyLink(string Family, string? PersonId, FamilyLinkRelation Relation)`
  - `Person.FamilyLinks` (`IReadOnlyList<FamilyLink>`, default `[]`)
  - `sealed record FamilyLinkDto(string Family, string? PersonId, string Relation)`
  - `PersonDto.FamilyLinks` and `PersonSummaryDto.FamilyLinks`, each an `IReadOnlyList<FamilyLinkDto>` defaulting to `[]`

- [ ] **Step 1: Write the failing tests**

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

        var links = JsonFamilyDataLoader.Deserialize(json).People.Single().FamilyLinks;

        links.Should().Equal(
            new FamilyLink("kowalski", "p-42", FamilyLinkRelation.Origin),
            new FamilyLink("nowak", null, FamilyLinkRelation.Joined));
    }

    [Fact]
    public void Deserialize_WhenPersonHasNoFamilyLinks_ShouldDefaultToEmpty()
    {
        var json = """
        { "people": [ { "id": "p-1", "givenName": { "en": "A" }, "surname": { "en": "B" },
            "birth": { "year": 1900 } } ], "unions": [] }
        """;

        JsonFamilyDataLoader.Deserialize(json).People.Single().FamilyLinks.Should().BeEmpty();
    }
}
```

Add to `MappingConfigTests` (it has `BuildConfig()` and `SamplePerson()`):

```csharp
    [Fact]
    public void Map_WhenPersonHasAFamilyLink_ShouldEmitALowercaseRelation()
    {
        var person = SamplePerson() with { FamilyLinks = [new FamilyLink("kowalski", "p-42", FamilyLinkRelation.Origin)] };

        var summary = person.Adapt<PersonSummaryDto>(BuildConfig());
        var detail = person.Adapt<PersonDto>(BuildConfig());

        summary.FamilyLinks.Should().ContainSingle().Which.Should().Be(new FamilyLinkDto("kowalski", "p-42", "origin"));
        detail.FamilyLinks.Should().ContainSingle().Which.Relation.Should().Be("origin");
    }
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `dotnet test tests/unit/FamilyTree.UnitTests --filter "FamilyLinkSeedTests|MappingConfigTests"`
Expected: FAIL — `FamilyLink` does not exist.

- [ ] **Step 3: Implement**

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

/// <summary>An authored link from a person to another family tree, optionally naming that family's
/// record of the same person.</summary>
public sealed record FamilyLink(string Family, string? PersonId, FamilyLinkRelation Relation);
```

In `Person.cs`, below `MarriedIntoFamily`: `public IReadOnlyList<FamilyLink> FamilyLinks { get; init; } = [];`

Create `src/backend/FamilyTree.Application/Dtos/FamilyLinkDto.cs`:

```csharp
namespace FamilyTree.Application.Dtos;

public sealed record FamilyLinkDto(string Family, string? PersonId, string Relation);
```

Add `public IReadOnlyList<FamilyLinkDto> FamilyLinks { get; init; } = [];` to `PersonDto` and `PersonSummaryDto`, matching each record's member style.

In `MappingConfig.Register`, add before the `Person` configs:

```csharp
        config.NewConfig<FamilyLink, FamilyLinkDto>()
            .Map(dest => dest.Relation, src => src.Relation.ToString().ToLowerInvariant());
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `dotnet test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "Add cross-family links to the person model"
```

---
### Task 4: The family-scoped override store

**Files:**
- Create: `src/backend/FamilyTree.Infrastructure/FamilyScopedOverrideStore.cs`
- Test: `tests/unit/FamilyTree.UnitTests/Infrastructure/FamilyScopedOverrideStoreTests.cs`

**Interfaces:**
- Consumes: `IPersonOverrideStore` (existing, **unchanged**), `StorageKeys` (Task 2), `FamilyRegistry` (Task 1).
- Produces: `sealed class FamilyScopedOverrideStore(IPersonOverrideStore inner, FamilyRegistry registry, string familyId) : IPersonOverrideStore`.

- [ ] **Step 1: Write the failing tests**

Create `tests/unit/FamilyTree.UnitTests/Infrastructure/FamilyScopedOverrideStoreTests.cs`. The tests run against the real `InMemoryPersonOverrideStore`, so key translation and filtering are proven end to end:

```csharp
using FamilyTree.Domain;
using FamilyTree.Infrastructure;

namespace FamilyTree.UnitTests.Infrastructure;

public sealed class FamilyScopedOverrideStoreTests
{
    private static readonly FamilyRegistry Registry = new(
    [
        new FamilyRegistryEntry("perovsky", "family.json", new LocalizedText(), null),
        new FamilyRegistryEntry("kowalski", "kowalski.json", new LocalizedText(), null)
    ], "perovsky");

    private readonly InMemoryPersonOverrideStore _inner = new();

    private IPersonOverrideStore For(string familyId) => new FamilyScopedOverrideStore(_inner, Registry, familyId);

    [Fact]
    public async Task AppendBiography_WhenFamilyIsNotTheDefault_ShouldWriteUnderThePrefixedKey()
    {
        await For("kowalski").AppendBiographyAsync("p-1", new LocalizedText { En = "k" }, "e", CancellationToken.None);

        (await _inner.GetLatestBiographyAsync("kowalski__p-1", CancellationToken.None))!.En.Should().Be("k");
        (await _inner.GetLatestBiographyAsync("p-1", CancellationToken.None)).Should().BeNull();
    }

    [Fact]
    public async Task AppendBiography_WhenFamilyIsTheDefault_ShouldWriteUnderTheBareKey()
    {
        await For("perovsky").AppendBiographyAsync("p-1", new LocalizedText { En = "d" }, "e", CancellationToken.None);

        (await _inner.GetLatestBiographyAsync("p-1", CancellationToken.None))!.En.Should().Be("d");
    }

    [Fact]
    public async Task GetLatestBiographies_WhenBothFamiliesHaveEdits_ShouldReturnOnlyItsOwnByBareId()
    {
        await For("perovsky").AppendBiographyAsync("p-1", new LocalizedText { En = "d" }, "e", CancellationToken.None);
        await For("kowalski").AppendBiographyAsync("p-1", new LocalizedText { En = "k" }, "e", CancellationToken.None);

        var perovsky = await For("perovsky").GetLatestBiographiesAsync(CancellationToken.None);
        var kowalski = await For("kowalski").GetLatestBiographiesAsync(CancellationToken.None);

        perovsky.Should().ContainSingle().Which.Should().Match<KeyValuePair<string, LocalizedText>>(p => p.Key == "p-1" && p.Value.En == "d");
        kowalski.Should().ContainSingle().Which.Should().Match<KeyValuePair<string, LocalizedText>>(p => p.Key == "p-1" && p.Value.En == "k");
    }

    [Fact]
    public async Task GetLatestProfile_WhenOnlyTheOtherFamilyHasOne_ShouldReturnNull()
    {
        await For("kowalski").AppendProfileAsync("p-1", new PersonProfileOverride(), "e", CancellationToken.None);

        (await For("perovsky").GetLatestProfileAsync("p-1", CancellationToken.None)).Should().BeNull();
    }

    [Fact]
    public async Task GetLatestMediaMap_WhenBothFamiliesHaveMedia_ShouldReturnOnlyItsOwn()
    {
        await For("perovsky").AppendMediaAsync("p-1", new PersonMediaOverride(null, []), "e", CancellationToken.None);
        await For("kowalski").AppendMediaAsync("p-2", new PersonMediaOverride(null, []), "e", CancellationToken.None);

        (await For("kowalski").GetLatestMediaMapAsync(CancellationToken.None)).Keys.Should().Equal("p-2");
        (await For("perovsky").GetLatestMediaMapAsync(CancellationToken.None)).Keys.Should().Equal("p-1");
    }
}
```

`PersonMediaOverride` is the positional record `PersonMediaOverride(Photo? Portrait, IReadOnlyList<Photo> Gallery)` (`PersonMediaOverride.cs:5`). Construct `PersonProfileOverride` the way the existing `InMemoryPersonOverrideStore` tests do; if it has required members, copy that test's minimal instance.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `dotnet test tests/unit/FamilyTree.UnitTests --filter FamilyScopedOverrideStoreTests`
Expected: FAIL — `FamilyScopedOverrideStore` does not exist.

- [ ] **Step 3: Implement**

Create `src/backend/FamilyTree.Infrastructure/FamilyScopedOverrideStore.cs`:

```csharp
namespace FamilyTree.Infrastructure;

/// <summary>An <see cref="IPersonOverrideStore"/> view of one family over the shared store. Callers
/// use bare person ids; this translates them with <see cref="StorageKeys.OverrideKey"/> and filters
/// the map getters to the family, re-keyed by bare person id.</summary>
public sealed class FamilyScopedOverrideStore : IPersonOverrideStore
{
    private readonly IPersonOverrideStore _inner;
    private readonly FamilyRegistry _registry;
    private readonly string _familyId;

    public FamilyScopedOverrideStore(IPersonOverrideStore inner, FamilyRegistry registry, string familyId)
    {
        _inner = inner;
        _registry = registry;
        _familyId = familyId;
    }

    public Task AppendBiographyAsync(string personId, LocalizedText biography, string editorEmail, CancellationToken cancellationToken) =>
        _inner.AppendBiographyAsync(Key(personId), biography, editorEmail, cancellationToken);

    public Task<LocalizedText?> GetLatestBiographyAsync(string personId, CancellationToken cancellationToken) =>
        _inner.GetLatestBiographyAsync(Key(personId), cancellationToken);

    public async Task<IReadOnlyDictionary<string, LocalizedText>> GetLatestBiographiesAsync(CancellationToken cancellationToken) =>
        Scope(await _inner.GetLatestBiographiesAsync(cancellationToken));

    public Task AppendMediaAsync(string personId, PersonMediaOverride media, string editorEmail, CancellationToken cancellationToken) =>
        _inner.AppendMediaAsync(Key(personId), media, editorEmail, cancellationToken);

    public Task<PersonMediaOverride?> GetLatestMediaAsync(string personId, CancellationToken cancellationToken) =>
        _inner.GetLatestMediaAsync(Key(personId), cancellationToken);

    public async Task<IReadOnlyDictionary<string, PersonMediaOverride>> GetLatestMediaMapAsync(CancellationToken cancellationToken) =>
        Scope(await _inner.GetLatestMediaMapAsync(cancellationToken));

    public Task AppendProfileAsync(string personId, PersonProfileOverride profile, string editorEmail, CancellationToken cancellationToken) =>
        _inner.AppendProfileAsync(Key(personId), profile, editorEmail, cancellationToken);

    public Task<PersonProfileOverride?> GetLatestProfileAsync(string personId, CancellationToken cancellationToken) =>
        _inner.GetLatestProfileAsync(Key(personId), cancellationToken);

    public async Task<IReadOnlyDictionary<string, PersonProfileOverride>> GetLatestProfilesAsync(CancellationToken cancellationToken) =>
        Scope(await _inner.GetLatestProfilesAsync(cancellationToken));

    private string Key(string personId) => StorageKeys.OverrideKey(_registry, _familyId, personId);

    // The default family owns every key without the separator; another family owns the keys under
    // its own prefix, returned with the prefix stripped.
    private Dictionary<string, T> Scope<T>(IReadOnlyDictionary<string, T> all)
    {
        if (_registry.IsDefault(_familyId))
        {
            return all.Where(pair => !pair.Key.Contains(StorageKeys.OverrideSeparator, StringComparison.Ordinal))
                      .ToDictionary(pair => pair.Key, pair => pair.Value, StringComparer.Ordinal);
        }

        var prefix = $"{_familyId}{StorageKeys.OverrideSeparator}";
        return all.Where(pair => pair.Key.StartsWith(prefix, StringComparison.Ordinal))
                  .ToDictionary(pair => pair.Key[prefix.Length..], pair => pair.Value, StringComparer.Ordinal);
    }
}
```

If `InMemoryPersonOverrideStore` has constructor parameters, pass what its existing tests pass.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `dotnet test tests/unit/FamilyTree.UnitTests --filter FamilyScopedOverrideStoreTests`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add src/backend/FamilyTree.Infrastructure/FamilyScopedOverrideStore.cs tests/unit/FamilyTree.UnitTests/Infrastructure/FamilyScopedOverrideStoreTests.cs
git commit -m "Add a family-scoped view over the override store"
```

---

### Task 5: Per-family snapshots

**Files:**
- Create: `src/backend/FamilyTree.Infrastructure/FamilyDataLoaderFactory.cs`
- Create: `src/backend/FamilyTree.Infrastructure/FamilySnapshotRegistry.cs`
- Modify: `src/backend/FamilyTree.Infrastructure/FamilySnapshotProvider.cs` (constructor + `Normalise` only)
- Test: `tests/unit/FamilyTree.UnitTests/Infrastructure/FamilySnapshotRegistryTests.cs`
- Test: `tests/unit/FamilyTree.UnitTests/Infrastructure/FamilySnapshotNormaliseTests.cs`
- Test: existing `FamilySnapshotProvider` tests (update the 6 constructor calls)

**Interfaces:**
- Consumes: `FamilyRegistry`, `StorageKeys`, `FamilyLink`, `FamilyScopedOverrideStore`.
- Produces:
  - `interface IFamilyDataLoaderFactory { IFamilyDataLoader Create(string source); }` with implementation `FamilyDataLoaderFactory`.
  - `FamilySnapshotProvider` gains two trailing constructor parameters, `FamilyRegistry registry, string familyId`.
  - `sealed class FamilySnapshotRegistry`, with the members:
    - `const string RawOverrideStoreKey = "raw"`
    - `IFamilySnapshotProvider For(string familyId)`, which throws `UnknownFamilyException`
    - `IFamilyDataHealthSource HealthFor(string familyId)`
    - `IReadOnlyList<string> DegradedFamilies`
  - `sealed class UnknownFamilyException : Exception` with `string FamilyId`.

- [ ] **Step 1: Write the failing tests**

Create `tests/unit/FamilyTree.UnitTests/Infrastructure/FamilySnapshotRegistryTests.cs`:

```csharp
using FamilyTree.Domain;
using FamilyTree.Infrastructure;
using Microsoft.Extensions.Logging.Abstractions;
using Microsoft.Extensions.Options;

namespace FamilyTree.UnitTests.Infrastructure;

public sealed class FamilySnapshotRegistryTests
{
    private static readonly FamilyRegistry Registry = new(
    [
        new FamilyRegistryEntry("perovsky", "family.json", new LocalizedText(), null),
        new FamilyRegistryEntry("kowalski", "kowalski.json", new LocalizedText(), null)
    ], "perovsky");

    private static FamilySnapshotRegistry Build(StubLoaderFactory factory) =>
        new(Registry, factory, new InMemoryPersonOverrideStore(),
            Options.Create(new FamilyDataOptions()), TimeProvider.System, NullLoggerFactory.Instance);

    [Fact]
    public void For_WhenCalledTwiceForOneFamily_ShouldReturnTheSameProvider()
    {
        var registry = Build(new StubLoaderFactory());

        registry.For("perovsky").Should().BeSameAs(registry.For("perovsky"));
    }

    [Fact]
    public async Task For_WhenTwoFamiliesAreRequested_ShouldLoadEachFromItsOwnSource()
    {
        var registry = Build(new StubLoaderFactory());

        var a = await registry.For("perovsky").GetAsync(CancellationToken.None);
        var b = await registry.For("kowalski").GetAsync(CancellationToken.None);

        a.People.Single().Summary!.En.Should().Be("family.json");
        b.People.Single().Summary!.En.Should().Be("kowalski.json");
    }

    [Fact]
    public void For_WhenFamilyIsNotRegistered_ShouldThrowUnknownFamily()
    {
        var act = () => Build(new StubLoaderFactory()).For("nowak");

        act.Should().Throw<UnknownFamilyException>().Which.FamilyId.Should().Be("nowak");
    }

    [Fact]
    public async Task For_WhenOneFamilySourceFails_ShouldStillServeTheOther()
    {
        var registry = Build(new StubLoaderFactory { FailingSource = "kowalski.json" });

        var failing = async () => await registry.For("kowalski").GetAsync(CancellationToken.None);
        await failing.Should().ThrowAsync<InvalidOperationException>();

        (await registry.For("perovsky").GetAsync(CancellationToken.None)).People.Should().ContainSingle();
    }

    [Fact]
    public async Task For_WhenAFamilyIsBuilt_ShouldReadOnlyItsOwnOverrides()
    {
        var store = new InMemoryPersonOverrideStore();
        await new FamilyScopedOverrideStore(store, Registry, "kowalski")
            .AppendBiographyAsync("p-1", new LocalizedText { En = "k-bio" }, "e", CancellationToken.None);
        var registry = new FamilySnapshotRegistry(Registry, new StubLoaderFactory(), store,
            Options.Create(new FamilyDataOptions()), TimeProvider.System, NullLoggerFactory.Instance);

        (await registry.For("kowalski").GetAsync(CancellationToken.None)).People.Single().Biography!.En.Should().Be("k-bio");
        (await registry.For("perovsky").GetAsync(CancellationToken.None)).People.Single().Biography.Should().BeNull();
    }

    private sealed class StubLoaderFactory : IFamilyDataLoaderFactory
    {
        public string? FailingSource { get; init; }

        public IFamilyDataLoader Create(string source) => new StubLoader(source, source == FailingSource);
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

        public Task<FamilyGraph> LoadAsync(CancellationToken cancellationToken) => _fails
            ? Task.FromException<FamilyGraph>(new InvalidOperationException("source down"))
            : Task.FromResult(new FamilyGraph(
                [new Person
                {
                    Id = "p-1",
                    GivenName = new LocalizedText { En = "A" },
                    Surname = new LocalizedText { En = "B" },
                    Birth = new LifeEvent { Year = 1900 },
                    Summary = new LocalizedText { En = _source }
                }], []));
    }
}
```

Create `tests/unit/FamilyTree.UnitTests/Infrastructure/FamilySnapshotNormaliseTests.cs`:

```csharp
using FamilyTree.Domain;
using FamilyTree.Infrastructure;
using Microsoft.Extensions.Logging.Abstractions;
using Microsoft.Extensions.Options;
using Moq;

namespace FamilyTree.UnitTests.Infrastructure;

public sealed class FamilySnapshotNormaliseTests
{
    private static readonly FamilyRegistry Registry = new(
    [
        new FamilyRegistryEntry("perovsky", "family.json", new LocalizedText(), null),
        new FamilyRegistryEntry("kowalski", "kowalski.json", new LocalizedText(), null)
    ], "perovsky");

    private static async Task<Person> BuildOne(Person seedPerson, string familyId)
    {
        var loader = new Mock<IFamilyDataLoader>();
        loader.Setup(l => l.LoadAsync(It.IsAny<CancellationToken>())).ReturnsAsync(new FamilyGraph([seedPerson], []));
        var provider = new FamilySnapshotProvider(
            loader.Object, new InMemoryPersonOverrideStore(), Options.Create(new FamilyDataOptions()),
            TimeProvider.System, NullLogger<FamilySnapshotProvider>.Instance, Registry, familyId);

        return (await provider.GetAsync(CancellationToken.None)).People.Single();
    }

    private static Person Seed(string? portrait = null, IReadOnlyList<FamilyLink>? links = null) => new()
    {
        Id = "p-1",
        GivenName = new LocalizedText { En = "A" },
        Surname = new LocalizedText { En = "B" },
        Birth = new LifeEvent { Year = 1900 },
        Portrait = portrait,
        PortraitVideo = portrait is null ? null : "p-1.mp4",
        Gallery = portrait is null ? [] : [new Photo("g1", "g1.jpg", "g1.thumb.jpg")],
        FamilyLinks = links ?? []
    };

    [Fact]
    public async Task GetAsync_WhenFamilyIsNotTheDefault_ShouldExpandEveryBareSeedReference()
    {
        var person = await BuildOne(Seed("p-1.jpg"), "kowalski");

        person.Portrait.Should().Be("portraits/kowalski/p-1.jpg");
        person.PortraitVideo.Should().Be("portraits/kowalski/p-1.mp4");
        person.Gallery.Single().Full.Should().Be("portraits/kowalski/g1.jpg");
        person.Gallery.Single().Thumb.Should().Be("portraits/kowalski/g1.thumb.jpg");
    }

    [Fact]
    public async Task GetAsync_WhenFamilyIsTheDefault_ShouldLeaveSeedReferencesBare() =>
        (await BuildOne(Seed("p-1.jpg"), "perovsky")).Portrait.Should().Be("p-1.jpg");

    [Fact]
    public async Task GetAsync_WhenALinkNamesAnUnregisteredFamily_ShouldDropOnlyThatLink()
    {
        var person = await BuildOne(Seed(links:
        [
            new FamilyLink("kowalski", "p-42", FamilyLinkRelation.Origin),
            new FamilyLink("nowak", null, FamilyLinkRelation.Joined)
        ]), "perovsky");

        person.FamilyLinks.Should().ContainSingle().Which.Family.Should().Be("kowalski");
    }

    [Fact]
    public async Task GetAsync_WhenALinkHasNoCounterpart_ShouldKeepIt() =>
        (await BuildOne(Seed(links: [new FamilyLink("kowalski", null, FamilyLinkRelation.Joined)]), "perovsky"))
            .FamilyLinks.Should().ContainSingle().Which.PersonId.Should().BeNull();
}
```

`Photo` is a positional record `Photo(Id, Full, Thumb)`, as `FamilySnapshotProvider.SeedTile` shows. If its constructor differs, match it.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `dotnet test tests/unit/FamilyTree.UnitTests --filter "FamilySnapshotRegistryTests|FamilySnapshotNormaliseTests"`
Expected: FAIL — the new types and constructor parameters don't exist.

- [ ] **Step 3: Write the loader factory**

Create `src/backend/FamilyTree.Infrastructure/FamilyDataLoaderFactory.cs`:

```csharp
using Google.Cloud.Storage.V1;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;

namespace FamilyTree.Infrastructure;

/// <summary>Builds the right <see cref="IFamilyDataLoader"/> for one family's source URI.</summary>
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
        return options.Value.IsGcsSource
            ? new GcsFamilyDataLoader(_services.GetRequiredService<StorageClient>(), options)
            : new JsonFamilyDataLoader(options,
                _services.GetRequiredService<IHostEnvironment>(),
                _services.GetRequiredService<ILogger<JsonFamilyDataLoader>>());
    }
}
```

- [ ] **Step 4: Normalise seeds in the provider**

In `FamilySnapshotProvider.cs`:

1. Add the fields `private readonly FamilyRegistry _registry;` and `private readonly string _familyId;`. Append the parameters `FamilyRegistry registry, string familyId` after `logger` and assign them. Leave everything else in the constructor as it is.
2. Add `private bool _loggedDroppedLinks;` and `private bool _loggedBadIds;`.
3. In `RebuildAsync`, directly after `seed = await _loader.LoadAsync(cancellationToken);`, add `seed = Normalise(seed);`. The override reads are **unchanged**, because the injected store is already scoped to the family.
4. Add these private members at the end of the class:

```csharp
    /// <summary>Family-level seed rules: bare media names expand to the family's media prefix, links to
    /// unregistered families are dropped, and a non-<c>p-</c> id is flagged (validators reject it).</summary>
    private FamilyGraph Normalise(FamilyGraph seed)
    {
        var dropped = 0;
        var badIds = 0;
        var people = seed.People.Select(person =>
        {
            if (!person.Id.StartsWith("p-", StringComparison.Ordinal) || !person.Id[2..].All(char.IsAsciiDigit))
            {
                badIds++;
            }

            var links = person.FamilyLinks.Where(link => _registry.Contains(link.Family)).ToList();
            dropped += person.FamilyLinks.Count - links.Count;
            return person with
            {
                Portrait = Expand(person.Portrait),
                PortraitThumb = Expand(person.PortraitThumb),
                PortraitVideo = Expand(person.PortraitVideo),
                Gallery = [.. person.Gallery.Select(photo => photo with { Full = Expand(photo.Full)!, Thumb = Expand(photo.Thumb)! })],
                FamilyLinks = links
            };
        }).ToList();

        if (dropped > 0)
        {
            // Warn once per provider; later rebuilds repeat it at Debug so a single-family deployment
            // whose seed carries links does not log a warning every TTL.
            var level = _loggedDroppedLinks ? LogLevel.Debug : LogLevel.Warning;
            _logger.Log(level, "Dropped {DroppedCount} family link(s) in family {FamilyId} naming an unregistered family.",
                dropped, _familyId);
            _loggedDroppedLinks = true;
        }

        if (badIds > 0)
        {
            // Same once-then-Debug rule: a malformed seed must not warn every TTL.
            _logger.Log(_loggedBadIds ? LogLevel.Debug : LogLevel.Warning,
                "{BadIdCount} person id(s) in family {FamilyId} are not p-<digits>; those people cannot be opened.",
                badIds, _familyId);
            _loggedBadIds = true;
        }

        return new FamilyGraph(people, seed.Unions);
    }

    private string? Expand(string? reference) =>
        reference is null ? null : StorageKeys.ExpandSeedMedia(_registry, _familyId, reference);
```

5. Update the 6 existing `new FamilySnapshotProvider(...)` calls in the tests: append `FamilyRegistry.Single("family.json"), FamilyRegistry.SyntheticId`. The existing expectations are unchanged, because the default family's references stay bare.

- [ ] **Step 5: Write the snapshot registry**

Create `src/backend/FamilyTree.Infrastructure/FamilySnapshotRegistry.cs`:

```csharp
using System.Collections.Concurrent;
using Microsoft.Extensions.DependencyInjection;
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

/// <summary>One <see cref="FamilySnapshotProvider"/> per registered family, created on first use.
/// Each keeps its own TTL, lock and last-good fallback, so a broken seed degrades only its tree.</summary>
public sealed class FamilySnapshotRegistry
{
    /// <summary>DI key of the raw, unscoped override store singleton.</summary>
    public const string RawOverrideStoreKey = "raw";

    private readonly FamilyRegistry _registry;
    private readonly IFamilyDataLoaderFactory _loaders;
    private readonly IPersonOverrideStore _rawOverrides;
    private readonly IOptions<FamilyDataOptions> _options;
    private readonly TimeProvider _timeProvider;
    private readonly ILoggerFactory _loggerFactory;
    private readonly ConcurrentDictionary<string, FamilySnapshotProvider> _providers = new(StringComparer.Ordinal);

    public FamilySnapshotRegistry(
        FamilyRegistry registry,
        IFamilyDataLoaderFactory loaders,
        [FromKeyedServices(RawOverrideStoreKey)] IPersonOverrideStore rawOverrides,
        IOptions<FamilyDataOptions> options,
        TimeProvider timeProvider,
        ILoggerFactory loggerFactory)
    {
        _registry = registry;
        _loaders = loaders;
        _rawOverrides = rawOverrides;
        _options = options;
        _timeProvider = timeProvider;
        _loggerFactory = loggerFactory;
    }

    /// <summary>The provider for a family, created on first use.</summary>
    /// <exception cref="UnknownFamilyException">The family is not registered.</exception>
    public IFamilySnapshotProvider For(string familyId) => ProviderFor(familyId);

    /// <summary>The health source of a family's provider (creating the provider if needed).</summary>
    public IFamilyDataHealthSource HealthFor(string familyId) => ProviderFor(familyId);

    /// <summary>Ids of every created provider currently reporting a degraded source.</summary>
    public IReadOnlyList<string> DegradedFamilies =>
        [.. _providers.Where(pair => pair.Value.IsDataSourceDegraded).Select(pair => pair.Key).Order(StringComparer.Ordinal)];

    private FamilySnapshotProvider ProviderFor(string familyId)
    {
        var entry = _registry.Find(familyId) ?? throw new UnknownFamilyException(familyId);
        return _providers.GetOrAdd(familyId, id => new FamilySnapshotProvider(
            _loaders.Create(entry.Source),
            new FamilyScopedOverrideStore(_rawOverrides, _registry, id),
            _options,
            _timeProvider,
            _loggerFactory.CreateLogger<FamilySnapshotProvider>(),
            _registry,
            id));
    }
}
```

- [ ] **Step 6: Run the tests to verify they pass**

Run: `dotnet test`
Expected: PASS — the whole suite. DI isn't rewired yet, so the app still runs on the old singleton registrations; that happens in Task 6.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "Build one snapshot provider per family"
```

---

### Task 6: The request family context, DI rewiring, and PR 1

**Files:**
- Create: `src/backend/FamilyTree.Domain/IFamilyContext.cs`
- Create: `src/backend/FamilyTree.Api/Family/FamilyContextMiddleware.cs`
- Modify: `src/backend/FamilyTree.Infrastructure/InfrastructureServiceCollectionExtensions.cs`
- Modify: `src/backend/FamilyTree.Api/Program.cs` (options mapping ~line 69, warm-up line 200, pipeline after line 317)
- Test: `tests/unit/FamilyTree.UnitTests/Api/FamilyContextMiddlewareTests.cs`
- Test: `tests/integration/FamilyTree.IntegrationTests/FamilyRegistryWiringTests.cs`
- Docs: `docs/reference/` (registry format, `familyLinks`, `FamilyData:Registry`)

**Interfaces:**
- Consumes: `FamilySnapshotRegistry`, `FamilyScopedOverrideStore`, `FamilyRegistryLoader`, the readers.
- Produces:
  - `interface IFamilyContext { string FamilyId { get; } }`
  - `sealed class FamilyContext : IFamilyContext` — its constructor takes `FamilyRegistry` and defaults `FamilyId` to the default family; `FamilyId` has a public setter.
  - Scoped `IFamilySnapshotProvider` and scoped `IPersonOverrideStore`, both resolved from `FamilyContext`.
  - Singleton `FamilyRegistry` and singleton `IFamilyDataHealthSource`, the latter being the default family's provider.

- [ ] **Step 1: Write the failing tests**

Create `tests/unit/FamilyTree.UnitTests/Api/FamilyContextMiddlewareTests.cs`:

```csharp
using FamilyTree.Api.Family;
using FamilyTree.Domain;
using Microsoft.AspNetCore.Http;

namespace FamilyTree.UnitTests.Api;

public sealed class FamilyContextMiddlewareTests
{
    private static readonly FamilyRegistry Registry = new(
    [
        new FamilyRegistryEntry("perovsky", "family.json", new LocalizedText(), null),
        new FamilyRegistryEntry("kowalski", "kowalski.json", new LocalizedText(), null)
    ], "perovsky");

    private static DefaultHttpContext Http(string? familyId)
    {
        var http = new DefaultHttpContext();
        if (familyId is not null)
        {
            http.Request.RouteValues["familyId"] = familyId;
        }
        return http;
    }

    [Fact]
    public async Task InvokeAsync_WhenRouteNamesAFamily_ShouldSetItOnTheContext()
    {
        var context = new FamilyContext(Registry);

        await new FamilyContextMiddleware(_ => Task.CompletedTask).InvokeAsync(Http("kowalski"), Registry, context);

        context.FamilyId.Should().Be("kowalski");
    }

    [Fact]
    public async Task InvokeAsync_WhenRouteNamesNoFamily_ShouldKeepTheDefault()
    {
        var context = new FamilyContext(Registry);

        await new FamilyContextMiddleware(_ => Task.CompletedTask).InvokeAsync(Http(null), Registry, context);

        context.FamilyId.Should().Be("perovsky");
    }

    [Fact]
    public async Task InvokeAsync_WhenFamilyIsNotRegistered_ShouldReturn404WithoutCallingNext()
    {
        var called = false;
        var http = Http("nowak");

        await new FamilyContextMiddleware(_ => { called = true; return Task.CompletedTask; })
            .InvokeAsync(http, Registry, new FamilyContext(Registry));

        http.Response.StatusCode.Should().Be(StatusCodes.Status404NotFound);
        called.Should().BeFalse();
    }
}
```

Create `tests/integration/FamilyTree.IntegrationTests/FamilyRegistryWiringTests.cs`. It uses the existing `FamilyApiFactory`, which runs Development with scope validation on, so a scoped-from-root mistake fails here:

```csharp
using System.Net;
using System.Net.Http.Json;
using FamilyTree.Application.Dtos;

namespace FamilyTree.IntegrationTests;

public sealed class FamilyRegistryWiringTests : IClassFixture<FamilyApiFactory>
{
    private readonly FamilyApiFactory _factory;

    public FamilyRegistryWiringTests(FamilyApiFactory factory)
    {
        _factory = factory;
    }

    [Fact]
    public async Task GetGraph_WhenNoRegistryIsConfigured_ShouldServeTheSeedAsBefore()
    {
        var graph = await _factory.CreateClient().GetFromJsonAsync<FamilyGraphDto>("/api/family/graph");

        graph!.People.Should().NotBeEmpty();
    }

    [Fact]
    public async Task GetHealth_WhenNoRegistryIsConfigured_ShouldBeHealthy()
    {
        var response = await _factory.CreateClient().GetAsync("/health");

        response.StatusCode.Should().Be(HttpStatusCode.OK);
    }
}
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `dotnet test tests/unit/FamilyTree.UnitTests --filter FamilyContextMiddlewareTests`
Expected: FAIL — the types don't exist.

- [ ] **Step 3: Write the context and middleware**

Create `src/backend/FamilyTree.Domain/IFamilyContext.cs`:

```csharp
namespace FamilyTree.Domain;

/// <summary>Which family tree the current request is about. Scoped: defaults to the registry's default
/// family and is set from the route by the family middleware.</summary>
public interface IFamilyContext
{
    string FamilyId { get; }
}

public sealed class FamilyContext : IFamilyContext
{
    public FamilyContext(FamilyRegistry registry)
    {
        FamilyId = registry.DefaultFamilyId;
    }

    public string FamilyId { get; set; }
}
```

Create `src/backend/FamilyTree.Api/Family/FamilyContextMiddleware.cs`:

```csharp
using FamilyTree.Domain;

namespace FamilyTree.Api.Family;

/// <summary>Sets the request's family from the <c>familyId</c> route value (the unprefixed alias routes
/// keep the default). An unregistered family short-circuits with a 404 before any seed loads.</summary>
public sealed class FamilyContextMiddleware
{
    private readonly RequestDelegate _next;

    public FamilyContextMiddleware(RequestDelegate next)
    {
        _next = next;
    }

    public async Task InvokeAsync(HttpContext httpContext, FamilyRegistry registry, FamilyContext familyContext)
    {
        if (httpContext.Request.RouteValues.TryGetValue("familyId", out var value) && value?.ToString() is { Length: > 0 } familyId)
        {
            if (!registry.Contains(familyId))
            {
                httpContext.Response.StatusCode = StatusCodes.Status404NotFound;
                return;
            }

            familyContext.FamilyId = familyId;
        }

        await _next(httpContext);
    }
}
```

`FamilyRegistry` and `FamilyContext` are injected per request through `InvokeAsync`; `UseMiddleware` gets no extra arguments.

- [ ] **Step 4: Rewire DI**

In `AddInfrastructure`:

1. Copy `options.Registry = familyData.Registry;` into the `Configure<FamilyDataOptions>` block.
2. Register `StorageClient` **unconditionally** as a lazy singleton, `services.AddSingleton(_ => StorageClient.Create());`, replacing the `IsGcsSource`-guarded registration. It is only constructed, and so only needs ADC, when something resolves it. That happens when the registry is `gs://` or when any registered family's source is `gs://`, including a local registry that lists a GCS seed.
3. **Delete** the `IFamilyDataLoader` singleton registrations (the factory replaces them) and the three `FamilySnapshotProvider` / `IFamilySnapshotProvider` / `IFamilyDataHealthSource` singleton lines.
4. Change the two `IPersonOverrideStore` registrations to keyed singletons: `services.AddKeyedSingleton<IPersonOverrideStore, InMemoryPersonOverrideStore>(FamilySnapshotRegistry.RawOverrideStoreKey);` and the same for `FirestorePersonOverrideStore`.
5. Add:

```csharp
        if (familyData.IsGcsRegistry)
        {
            services.AddSingleton<IRegistryFileReader>(sp => new GcsRegistryFileReader(sp.GetRequiredService<StorageClient>()));
        }
        else
        {
            services.AddSingleton<IRegistryFileReader, LocalRegistryFileReader>();
        }
        services.AddSingleton<FamilyRegistryLoader>();
        // Read once; startup resolves it eagerly so a bad registry fails fast.
        services.AddSingleton(sp => sp.GetRequiredService<FamilyRegistryLoader>().Load());
        services.AddSingleton<IFamilyDataLoaderFactory, FamilyDataLoaderFactory>();
        services.AddSingleton<FamilySnapshotRegistry>();
        services.AddSingleton<IFamilyDataHealthSource>(sp =>
            sp.GetRequiredService<FamilySnapshotRegistry>().HealthFor(sp.GetRequiredService<FamilyRegistry>().DefaultFamilyId));

        // The family travels as a scoped context, so repositories and handlers stay family-agnostic.
        services.AddScoped<FamilyContext>();
        services.AddScoped<IFamilyContext>(sp => sp.GetRequiredService<FamilyContext>());
        services.AddScoped<IFamilySnapshotProvider>(sp =>
            sp.GetRequiredService<FamilySnapshotRegistry>().For(sp.GetRequiredService<FamilyContext>().FamilyId));
        services.AddScoped<IPersonOverrideStore>(sp => new FamilyScopedOverrideStore(
            sp.GetRequiredKeyedService<IPersonOverrideStore>(FamilySnapshotRegistry.RawOverrideStoreKey),
            sp.GetRequiredService<FamilyRegistry>(),
            sp.GetRequiredService<FamilyContext>().FamilyId));
```

`InMemoryPersonRepository` and `InMemoryUnionRepository` are already scoped, so they take the scoped provider unchanged. The 7 override-store consumers (Add/Delete/Promote/SuppressSeed photo handlers, UpdateBiography, UpdateProfile and GetPersonProfile) are MediatR handlers resolved in the request scope, so they need no change.

**Update the three existing tests that pin the old registrations.** They fail after this step otherwise.

- `tests/integration/FamilyTree.IntegrationTests/TestHostIsolationTests.cs:27,34` resolves `IPersonOverrideStore` from the root provider. It is scoped now, so that throws under Development scope validation, and the scoped type would be the wrapper anyway. Change both lines to assert on the raw store:

```csharp
        _auth.Services.GetKeyedService<IPersonOverrideStore>(FamilySnapshotRegistry.RawOverrideStoreKey)
            .Should().BeOfType<InMemoryPersonOverrideStore>();
```

(and the same for `_family`).

- `tests/unit/FamilyTree.UnitTests/Infrastructure/InfrastructureSelectionTests.cs:38-54`: the two `…ShouldRegisterJsonLoader` / `…ShouldRegisterGcsLoader` tests check an `IFamilyDataLoader` descriptor that no longer exists. Replace them with a new `tests/unit/FamilyTree.UnitTests/Infrastructure/FamilyDataLoaderFactoryTests.cs`, and delete the two old tests. Also update the two store-selection tests in that file (lines 13 and 27) to look up the **keyed** `IPersonOverrideStore` descriptor (`ServiceKey == FamilySnapshotRegistry.RawOverrideStoreKey`). The new factory tests:

```csharp
using FamilyTree.Infrastructure;
using Google.Cloud.Storage.V1;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Moq;

namespace FamilyTree.UnitTests.Infrastructure;

public sealed class FamilyDataLoaderFactoryTests
{
    private static FamilyDataLoaderFactory Build()
    {
        var services = new ServiceCollection();
        services.AddLogging();
        services.AddSingleton(Mock.Of<IHostEnvironment>(e => e.ContentRootPath == AppContext.BaseDirectory));
        services.AddSingleton(new Mock<StorageClient>().Object);
        return new FamilyDataLoaderFactory(services.BuildServiceProvider());
    }

    [Fact]
    public void Create_WhenSourceIsALocalPath_ShouldReturnTheJsonLoader() =>
        Build().Create("Data/family.json").Should().BeOfType<JsonFamilyDataLoader>();

    [Fact]
    public void Create_WhenSourceIsAGcsUri_ShouldReturnTheGcsLoader() =>
        Build().Create("gs://bucket/family.json").Should().BeOfType<GcsFamilyDataLoader>();
}
```

`StorageClient` is abstract, so Moq can build it without credentials.

- [ ] **Step 5: Program.cs**

1. Map the setting at line ~69: add `Registry = appSettings.FamilyData.Registry,` to the `FamilyDataOptions` initializer.
2. Replace the warm-up at line 200 (it resolves the now-scoped `IFamilySnapshotProvider` from the root provider):

```csharp
// Load the registry and warm the default family's snapshot once at startup: fail fast on a bad
// registry or seed, and seed the cache so the first request does not pay the build cost.
var familyRegistry = app.Services.GetRequiredService<FamilyRegistry>();
await app.Services.GetRequiredService<FamilySnapshotRegistry>()
    .For(familyRegistry.DefaultFamilyId)
    .RefreshAsync(CancellationToken.None);
```

3. Add `app.UseMiddleware<FamilyContextMiddleware>();` directly after `app.UseAuthorization();` (line 317) and before `app.MapHealthChecks(...)`. `WebApplication` runs routing implicitly at the start of the pipeline, so route values are already populated here. **Do not** add an explicit `app.UseRouting()`: the per-endpoint rate-limit policies rely on routing running before `UseRateLimiter`.
4. Add the `using FamilyTree.Api.Family;` and `using FamilyTree.Infrastructure;` directives if missing.

- [ ] **Step 6: Run everything**

Run: `dotnet build` then `dotnet test`
Expected: PASS — including `FamilyRegistryWiringTests`, which proves startup, scope validation, the alias graph and `/health` still work.

- [ ] **Step 7: Update the docs**

Run the `update-docs-for-pr` skill. For PR 1, `docs/reference/` must gain:
- the `families.json` format (`defaultFamily`, `id`, `source` resolved beside the registry, `name`, `mediaPrefix`), the `FamilyData:Registry` setting, and the single-family fallback;
- the `familyLinks` seed field and its API shape (`relation` lowercase; links to unregistered families are dropped);
- the `p-<digits>` person-id rule for every seed.

Label the registry "configurable; the family-scoped routes arrive next".

- [ ] **Step 8: Commit, push, open the PR, stop**

```bash
git add -A
git commit -m "Resolve each request's family through a scoped family context"
git push -u origin claude/family-tree-switching-ee48f8
gh pr create --base main --title "Serve family data through a per-family registry" --body-file <body>
```

The PR body lists: no behaviour change without a registry; the registry format; the scoped context; the override wrapper; the seed rule; the spec and plan paths; test results. End it with the Claude Code attribution line. **Stop** — wait for the owner to merge.

---
## PR 2 — Family-scoped API

**PR title:** "Serve every family tree through family-scoped API routes"
**Branch:** `claude/multi-family-2-api`, off `main` after PR 1 merges.

### Task 7: Registry endpoint, family routes, and the upload cap

**Files:**
- Create: `src/backend/FamilyTree.Application/Families/FamilySummaryDto.cs`, `GetFamiliesQuery.cs`, `GetFamiliesHandler.cs`
- Create: `src/backend/FamilyTree.Api/Controllers/FamiliesController.cs`
- Create: `src/backend/FamilyTree.Api/Family/PhotoUploadPath.cs`
- Modify: `src/backend/FamilyTree.Api/Controllers/PeopleController.cs:10`
- Modify: `src/backend/FamilyTree.Api/Program.cs:288-297` (upload-cap matcher)
- Create: `tests/integration/FamilyTree.IntegrationTests/Fixtures/families.test.json`, `Fixtures/kowalski.test.json`
- Create: `tests/integration/FamilyTree.IntegrationTests/TwoFamilyApiFactory.cs`
- Modify: `tests/integration/FamilyTree.IntegrationTests/FamilyTree.IntegrationTests.csproj` (next to the existing `family.test.json` item at line 23)
- Test: `tests/unit/FamilyTree.UnitTests/Api/PhotoUploadPathTests.cs`, `tests/integration/FamilyTree.IntegrationTests/FamilyRoutesTests.cs`

**Interfaces:**
- Consumes: the singleton `FamilyRegistry` and `FamilyContextMiddleware` (PR 1).
- Produces:
  - `sealed record FamilySummaryDto(string Id, LocalizedTextDto Name, bool IsDefault)`
  - `GET /api/families`
  - `GET /api/families/{familyId}/graph`
  - `/api/families/{familyId}/people/…`, mirroring every `PeopleController` action
  - `static class PhotoUploadPath { static bool IsMatch(PathString path); }`

- [ ] **Step 1: Add the two-family fixtures**

Create `tests/integration/FamilyTree.IntegrationTests/Fixtures/families.test.json`:

```json
{
  "defaultFamily": "perovsky",
  "families": [
    { "id": "perovsky", "source": "family.test.json", "name": { "en": "Perovsky" } },
    { "id": "kowalski", "source": "kowalski.test.json", "name": { "en": "Kowalski" } }
  ]
}
```

Create `Fixtures/kowalski.test.json`. It uses `p-` ids (a spec rule), deliberately overlapping the default fixture's ids:

```json
{
  "people": [
    { "id": "p-0001", "givenName": { "en": "Maciej" }, "surname": { "en": "Kowalczyk" }, "sex": "male",
      "birth": { "year": 1840, "approx": true }, "portrait": "p-0001.jpg", "isDefaultRoot": true },
    { "id": "p-0002", "givenName": { "en": "Jadwiga" }, "surname": { "en": "Kowalczyk" }, "sex": "female",
      "birth": { "year": 1845, "approx": true }, "marriedIntoFamily": true }
  ],
  "unions": [ { "id": "u-1", "partnerIds": ["p-0001", "p-0002"], "marriageYear": 1868, "childIds": [] } ]
}
```

In the integration `.csproj`, duplicate the existing `<Content Include="Fixtures\family.test.json">` item, with its child elements, for `families.test.json` and `kowalski.test.json`.

Create `TwoFamilyApiFactory.cs`. It copies `FamilyApiFactory`'s credential-blanking settings and adds the registry:

```csharp
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;

namespace FamilyTree.IntegrationTests;

/// <summary>A test host serving two families from the fixture registry.</summary>
public sealed class TwoFamilyApiFactory : WebApplicationFactory<Program>
{
    protected override void ConfigureWebHost(IWebHostBuilder builder)
    {
        var fixtures = Path.Combine(AppContext.BaseDirectory, "Fixtures");
        builder.UseSetting("FamilyData:Source", Path.Combine(fixtures, "family.test.json"));
        builder.UseSetting("FamilyData:Registry", Path.Combine(fixtures, "families.test.json"));
        builder.UseSetting("GoogleMaps:GeocodingApiKey", "");
        builder.UseSetting("Firestore:ProjectId", "");
        builder.UseSetting("R2:AccountId", "");
        builder.UseSetting("R2:Bucket", "");
        builder.UseSetting("R2:AccessKeyId", "");
        builder.UseSetting("R2:SecretAccessKey", "");
        builder.UseEnvironment("Development");
    }
}
```

- [ ] **Step 2: Write the failing tests**

Create `tests/unit/FamilyTree.UnitTests/Api/PhotoUploadPathTests.cs`:

```csharp
using FamilyTree.Api.Family;
using Microsoft.AspNetCore.Http;

namespace FamilyTree.UnitTests.Api;

public sealed class PhotoUploadPathTests
{
    [Theory]
    [InlineData("/api/people/p-0001/photos", true)]
    [InlineData("/api/families/kowalski/people/p-0001/photos", true)]
    [InlineData("/api/people/p-0001/biography", false)]
    [InlineData("/api/families/kowalski/people/p-0001/profile", false)]
    [InlineData("/api/families/kowalski/graph", false)]
    [InlineData("/api/families/kowalski/people/photos", false)]
    public void IsMatch_WhenGivenAPath_ShouldMatchOnlyPhotoUploadRoutes(string path, bool expected) =>
        PhotoUploadPath.IsMatch(new PathString(path)).Should().Be(expected);
}
```

Create `tests/integration/FamilyTree.IntegrationTests/FamilyRoutesTests.cs`:

```csharp
using System.Net;
using System.Net.Http.Json;
using FamilyTree.Application.Dtos;
using FamilyTree.Application.Families;

namespace FamilyTree.IntegrationTests;

public sealed class FamilyRoutesTests : IClassFixture<TwoFamilyApiFactory>
{
    private readonly HttpClient _client;

    public FamilyRoutesTests(TwoFamilyApiFactory factory)
    {
        _client = factory.CreateClient();
    }

    [Fact]
    public async Task GetFamilies_WhenTwoAreRegistered_ShouldListBothWithTheDefaultMarked()
    {
        var families = await _client.GetFromJsonAsync<List<FamilySummaryDto>>("/api/families");

        families!.Select(f => f.Id).Should().Equal("perovsky", "kowalski");
        families.Single(f => f.IsDefault).Id.Should().Be("perovsky");
    }

    [Fact]
    public async Task GetGraph_WhenCalledForTheSecondFamily_ShouldServeItsOwnPeople()
    {
        var graph = await _client.GetFromJsonAsync<FamilyGraphDto>("/api/families/kowalski/graph");

        graph!.People.Should().HaveCount(2);
        graph.People.Single(p => p.Id == "p-0001").Surname.En.Should().Be("Kowalczyk");
    }

    [Fact]
    public async Task GetGraph_WhenCalledThroughTheAlias_ShouldMatchTheDefaultFamilyRoute()
    {
        var alias = await _client.GetFromJsonAsync<FamilyGraphDto>("/api/family/graph");
        var scoped = await _client.GetFromJsonAsync<FamilyGraphDto>("/api/families/perovsky/graph");

        scoped!.People.Select(p => p.Id).Should().Equal(alias!.People.Select(p => p.Id));
    }

    [Fact]
    public async Task GetPerson_WhenIdsOverlapAcrossFamilies_ShouldResolveWithinTheNamedFamily()
    {
        var kowalski = await _client.GetFromJsonAsync<PersonDto>("/api/families/kowalski/people/p-0001");
        var perovsky = await _client.GetFromJsonAsync<PersonDto>("/api/people/p-0001");

        kowalski!.Surname.En.Should().Be("Kowalczyk");
        perovsky!.Surname.En.Should().Be("Kowalski");   // family.test.json:6
    }

    [Fact]
    public async Task GetGraph_WhenFamilyIsNotRegistered_ShouldReturnNotFound() =>
        (await _client.GetAsync("/api/families/nowak/graph")).StatusCode.Should().Be(HttpStatusCode.NotFound);

    [Fact]
    public async Task UploadPhoto_WhenPostedOnTheFamilyRoute_ShouldGetThePhotoSizeCap()
    {
        // Larger than the 256 KB default body cap, far below the photo cap; unauthenticated, so a
        // correct cap lets it through to auth (401) instead of rejecting it for size (413).
        using var content = new ByteArrayContent(new byte[300 * 1024]);
        content.Headers.ContentType = new("application/octet-stream");

        var response = await _client.PostAsync("/api/families/kowalski/people/p-0001/photos", content);

        response.StatusCode.Should().NotBe(HttpStatusCode.RequestEntityTooLarge);
    }
}
```

The default fixture's `p-0001` is surnamed "Kowalski" (`family.test.json:6`), which is why the second family's fixture uses "Kowalczyk": the overlapping ids must resolve to visibly different people.

- [ ] **Step 3: Run the tests to verify they fail**

Run: `dotnet test --filter "PhotoUploadPathTests|FamilyRoutesTests"`
Expected: FAIL — `/api/families` returns 404 and `PhotoUploadPath` does not exist.

- [ ] **Step 4: Implement the query and controller**

`FamilySummaryDto.cs`:

```csharp
using FamilyTree.Application.Dtos;

namespace FamilyTree.Application.Families;

public sealed record FamilySummaryDto(string Id, LocalizedTextDto Name, bool IsDefault);
```

`GetFamiliesQuery.cs`:

```csharp
namespace FamilyTree.Application.Families;

public sealed record GetFamiliesQuery : IRequest<IReadOnlyList<FamilySummaryDto>>;
```

`GetFamiliesHandler.cs`:

```csharp
using FamilyTree.Application.Dtos;

namespace FamilyTree.Application.Families;

public sealed class GetFamiliesHandler : IRequestHandler<GetFamiliesQuery, IReadOnlyList<FamilySummaryDto>>
{
    private readonly FamilyRegistry _registry;
    private readonly IMapper _mapper;

    public GetFamiliesHandler(FamilyRegistry registry, IMapper mapper)
    {
        _registry = registry;
        _mapper = mapper;
    }

    public Task<IReadOnlyList<FamilySummaryDto>> Handle(GetFamiliesQuery request, CancellationToken cancellationToken) =>
        Task.FromResult<IReadOnlyList<FamilySummaryDto>>(
        [
            .. _registry.Families.Select(family => new FamilySummaryDto(
                family.Id, _mapper.Map<LocalizedTextDto>(family.Name), _registry.IsDefault(family.Id)))
        ]);
}
```

`FamiliesController.cs`:

```csharp
using FamilyTree.Application.Families;
using FamilyTree.Application.Family;

namespace FamilyTree.Api.Controllers;

/// <summary>The registry of family trees and the family-scoped graph. Family-scoped person routes are
/// <see cref="PeopleController"/>'s second route template.</summary>
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
    public async Task<ActionResult<IReadOnlyList<FamilySummaryDto>>> GetFamilies(CancellationToken cancellationToken) =>
        Ok(await _sender.Send(new GetFamiliesQuery(), cancellationToken));

    // familyId is consumed by FamilyContextMiddleware; the graph handler reads the scoped context.
    [HttpGet("{familyId}/graph")]
    public async Task<ActionResult<FamilyGraphDto>> GetGraph(string familyId, CancellationToken cancellationToken) =>
        Ok(await _sender.Send(new GetFamilyGraphQuery(), cancellationToken));
}
```

`PeopleController.cs:10`: add a second template directly below the existing one:

```csharp
[Route("api/people")]
[Route("api/families/{familyId}/people")]
```

No action signature changes. The unbound `familyId` route value is read by the middleware.

- [ ] **Step 5: Extend the upload cap**

Create `src/backend/FamilyTree.Api/Family/PhotoUploadPath.cs`:

```csharp
namespace FamilyTree.Api.Family;

/// <summary>Recognises the photo-upload routes, aliased and family-scoped, which get the larger body cap.</summary>
public static class PhotoUploadPath
{
    public static bool IsMatch(PathString path)
    {
        if (path.StartsWithSegments("/api/people", out var rest))
        {
            return IsPersonPhotos(rest);
        }

        if (path.StartsWithSegments("/api/families", out var familyRest))
        {
            // "/{familyId}/people/{id}/photos"
            var segments = familyRest.Value?.Split('/', StringSplitOptions.RemoveEmptyEntries) ?? [];
            return segments.Length == 4 && segments[1] == "people" && segments[3] == "photos";
        }

        return false;
    }

    // "/{id}/photos"
    private static bool IsPersonPhotos(PathString rest)
    {
        var segments = rest.Value?.Split('/', StringSplitOptions.RemoveEmptyEntries) ?? [];
        return segments.Length == 2 && segments[1] == "photos";
    }
}
```

In `Program.cs` (lines ~293-296), replace the `isPhotoUpload` expression with:

```csharp
    var isPhotoUpload = HttpMethods.IsPost(request.Method) && PhotoUploadPath.IsMatch(request.Path);
```

- [ ] **Step 6: Run the tests to verify they pass**

Run: `dotnet test`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "Serve the family registry and family-scoped routes"
```

---

### Task 8: Family-scoped upload keys and the health roll-up

**Files:**
- Modify: `src/backend/FamilyTree.Domain/MediaKeyGenerator.cs`
- Modify: `src/backend/FamilyTree.Application/People/AddPersonPhotoHandler.cs` (constructor + line 55)
- Create: `src/backend/FamilyTree.Infrastructure/IFamilyHealthRollup.cs`
- Modify: `src/backend/FamilyTree.Infrastructure/FamilySnapshotRegistry.cs` (implement the roll-up)
- Modify: `src/backend/FamilyTree.Infrastructure/InfrastructureServiceCollectionExtensions.cs`
- Modify: `src/backend/FamilyTree.Api/Health/FamilyDataHealthCheck.cs`, `src/backend/FamilyTree.Api/Program.cs` (health response writer, lines 319-334)
- Test: `tests/unit/FamilyTree.UnitTests/Domain/MediaKeyGeneratorTests.cs`, `Application/AddPersonPhotoHandlerTests.cs`, `Api/FamilyDataHealthCheckTests.cs`

**Interfaces:**
- Produces:
  - `MediaKeyGenerator.ForPerson(FamilyRegistry registry, string familyId, string personId, ReadOnlySpan<byte> fullBytes)`, which replaces the old overload;
  - `interface IFamilyHealthRollup { IReadOnlyList<string> DegradedFamilies { get; } }`;
  - a `degradedFamilies` array in the `/health` JSON.

- [ ] **Step 1: Write the failing tests**

In `MediaKeyGeneratorTests`, update the existing calls to `MediaKeyGenerator.ForPerson(Single, FamilyRegistry.SyntheticId, "p-0001", bytes)`, where `private static readonly FamilyRegistry Single = FamilyRegistry.Single("family.json");`, then add:

```csharp
    private static readonly FamilyRegistry TwoFamilies = new(
    [
        new FamilyRegistryEntry("perovsky", "family.json", new LocalizedText(), null),
        new FamilyRegistryEntry("kowalski", "kowalski.json", new LocalizedText(), null)
    ], "perovsky");

    [Fact]
    public void ForPerson_WhenFamilyIsTheDefault_ShouldKeepTheHistoricalLayout() =>
        MediaKeyGenerator.ForPerson(TwoFamilies, "perovsky", "p-0001", new byte[] { 1 }).FullKey
            .Should().StartWith("uploads/p-0001/");

    [Fact]
    public void ForPerson_WhenFamilyIsNotTheDefault_ShouldInsertTheFamilySegment() =>
        MediaKeyGenerator.ForPerson(TwoFamilies, "kowalski", "p-0001", new byte[] { 1 }).FullKey
            .Should().StartWith("uploads/kowalski/p-0001/");

    [Fact]
    public void ForPerson_WhenSameBytesGoToTwoFamilies_ShouldShareIdButNotKey()
    {
        var a = MediaKeyGenerator.ForPerson(TwoFamilies, "perovsky", "p-0001", new byte[] { 1 });
        var b = MediaKeyGenerator.ForPerson(TwoFamilies, "kowalski", "p-0001", new byte[] { 1 });

        b.Id.Should().Be(a.Id);
        b.FullKey.Should().NotBe(a.FullKey);
    }
```

In `AddPersonPhotoHandlerTests`, the handler now takes `FamilyRegistry` and `IFamilyContext`. Update its construction helper to pass `FamilyRegistry.Single("family.json")` and a `FamilyContext` built from it, and update line 198 to the new `ForPerson` signature. Then add:

```csharp
    [Fact]
    public async Task Handle_WhenFamilyIsNotTheDefault_ShouldStoreUnderTheFamilyPrefix()
    {
        // Arrange exactly like the existing happy-path upload test, but build the handler with a
        // two-family registry and a FamilyContext whose FamilyId is "kowalski".
        // Assert: IMediaStore.PutAsync was called with a key starting "uploads/kowalski/p-0001/".
    }
```

Fill in its body by copying the existing happy-path test's arrangement and replacing only the registry and context.

In `FamilyDataHealthCheckTests`, add `private sealed class FakeRollup : IFamilyHealthRollup { public IReadOnlyList<string> DegradedFamilies { get; init; } = []; }`, pass `new FakeRollup()` as the new second constructor argument in both existing tests, and add:

```csharp
    [Fact]
    public async Task CheckHealthAsync_WhenAnotherFamilyIsDegraded_ShouldStayHealthyAndReportIt()
    {
        var check = new FamilyDataHealthCheck(
            new FakeHealthSource { IsDataSourceDegraded = false },
            new FakeRollup { DegradedFamilies = ["kowalski"] });

        var result = await check.CheckHealthAsync(new HealthCheckContext(), CancellationToken.None);

        result.Status.Should().Be(HealthStatus.Healthy);
        result.Data["degradedFamilies"].Should().BeEquivalentTo(new[] { "kowalski" });
    }
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `dotnet test tests/unit/FamilyTree.UnitTests --filter "MediaKeyGeneratorTests|AddPersonPhotoHandlerTests|FamilyDataHealthCheckTests"`
Expected: FAIL (compile).

- [ ] **Step 3: Implement the upload keys**

Replace `MediaKeyGenerator.ForPerson`:

```csharp
    /// <summary>Computes a stable key tuple for a person in a family from the SHA-256 of
    /// <paramref name="fullBytes"/>, under <see cref="StorageKeys.UploadPrefix"/>.</summary>
    /// <returns>(<c>Id</c>, <c>FullKey</c>, <c>ThumbKey</c>); <c>Id</c> is the first 20 hex chars of the hash.</returns>
    public static (string Id, string FullKey, string ThumbKey) ForPerson(
        FamilyRegistry registry, string familyId, string personId, ReadOnlySpan<byte> fullBytes)
    {
        var id = Convert.ToHexStringLower(SHA256.HashData(fullBytes))[..20];
        var prefix = StorageKeys.UploadPrefix(registry, familyId, personId);
        return (id, $"{prefix}/{id}.webp", $"{prefix}/{id}.thumb.webp");
    }
```

In `AddPersonPhotoHandler`:

1. Add `FamilyRegistry registry` and `IFamilyContext familyContext` constructor parameters after `IImageProcessor processor`, stored in `_registry` and `_familyContext`.
2. Change line 55 to:

```csharp
        var (id, fullKey, thumbKey) = MediaKeyGenerator.ForPerson(_registry, _familyContext.FamilyId, request.Id, processed.Full);
```

- [ ] **Step 4: Implement the health roll-up**

Create `src/backend/FamilyTree.Infrastructure/IFamilyHealthRollup.cs`:

```csharp
namespace FamilyTree.Infrastructure;

/// <summary>Which families' data sources are currently degraded, across every created provider.</summary>
public interface IFamilyHealthRollup
{
    IReadOnlyList<string> DegradedFamilies { get; }
}
```

Declare `FamilySnapshotRegistry : IFamilyHealthRollup`; its `DegradedFamilies` property already exists from PR 1. In `AddInfrastructure`, add `services.AddSingleton<IFamilyHealthRollup>(sp => sp.GetRequiredService<FamilySnapshotRegistry>());`.

In `FamilyDataHealthCheck`, add the `IFamilyHealthRollup rollup` constructor parameter (`_rollup`) and return data on both results:

```csharp
        // The verdict tracks the default family only (it gates deploys); other families' degradation
        // is reported in the body without failing the probe.
        var data = new Dictionary<string, object> { ["degradedFamilies"] = _rollup.DegradedFamilies };
        if (_source.IsDataSourceDegraded)
        {
            return Task.FromResult(HealthCheckResult.Degraded(
                $"Family data refresh has failed {_source.ConsecutiveRefreshFailures} times in a row; serving stale data.",
                data: data));
        }

        return Task.FromResult(HealthCheckResult.Healthy(data: data));
```

In `Program.cs`'s `/health` response writer, add the field to the anonymous object, keeping `status`, `version` and `commit` exactly as they are (the deploy check reads them):

```csharp
            degradedFamilies = report.Entries.TryGetValue("family-data", out var familyData)
                && familyData.Data.TryGetValue("degradedFamilies", out var degraded)
                    ? degraded
                    : Array.Empty<string>()
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `dotnet test`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "Scope upload keys to the family and roll family health into /health"
```

---

### Task 9: Dev fixtures, docs, and PR 2

**Files:**
- Create: `src/backend/FamilyTree.Api/Data/families.json`
- Create: `src/backend/FamilyTree.Api/Data/kowalski.json`
- Docs: `docs/reference/`

- [ ] **Step 1: Add the dev registry**

Create `src/backend/FamilyTree.Api/Data/kowalski.json` with three people using `p-` ids — `p-0001` (default root), `p-0002` (married in), and `p-0003` (their child). Use the same field shapes as `Data/family.json`, with `ru`/`be`/`en` names, one union, and no `familyLinks` yet (PR 4 adds them).

Create `src/backend/FamilyTree.Api/Data/families.json`:

```json
{
  "defaultFamily": "perovsky",
  "families": [
    { "id": "perovsky", "source": "family.json",
      "name": { "ru": "Перовские", "be": "Пяроўскія", "en": "Perovsky" } },
    { "id": "kowalski", "source": "kowalski.json",
      "name": { "ru": "Ковальские", "be": "Кавальскія", "en": "Kowalski" } }
  ]
}
```

Leave `FamilyData:Registry` **unset** in `appsettings*.json`: the registry is opt-in per run (`FamilyData__Registry=Data/families.json`).

- [ ] **Step 2: Smoke-check the dev registry**

Run the API alone on a free port:

```bash
FamilyData__Registry=Data/families.json dotnet run --project src/backend/FamilyTree.Api -- --urls http://localhost:5041
```

Then `curl http://localhost:5041/api/families`: expect two entries. `curl http://localhost:5041/api/families/kowalski/graph`: expect three people. `curl http://localhost:5041/health`: expect `"degradedFamilies":[]`. Stop the server.

- [ ] **Step 3: Update the docs**

Run the `update-docs-for-pr` skill. `docs/reference/` gains:
- `GET /api/families`, `GET /api/families/{familyId}/graph`, the family-scoped people routes, and the note that the unprefixed routes are default-family aliases;
- the 404 for an unknown family;
- the media and override key layout table (default bare; others `uploads/{family}/…`, Firestore `{family}__{person}`), including the "promoting a different default orphans keys" warning;
- `degradedFamilies` in `/health`;
- how to run with the dev registry.

- [ ] **Step 4: Gates, commit, push, open the PR, stop**

```bash
dotnet build
dotnet test
git add -A
git commit -m "Add a two-family dev registry and document the family API"
git push -u origin claude/multi-family-2-api
gh pr create --base main --title "Serve every family tree through family-scoped API routes" --body-file <body>
```

End the PR body with the Claude Code attribution line. **Stop.**

---
## PR 3 — Switching in the SPA

**PR title:** "Switch between family trees in the app"
**Branch:** `claude/multi-family-3-spa`, off `main` after PR 2 merges.

Run `npm --prefix src/frontend run build` (vue-tsc) at the end of **every** task, not just vitest: several tasks change function signatures.

### Task 10: Registry store and types

**Files:**
- Create: `src/frontend/src/api/familiesApi.ts`, `src/frontend/src/stores/familiesStore.ts`
- Modify: `src/frontend/src/types/family.ts`
- Test: `src/frontend/src/api/familiesApi.spec.ts`, `src/frontend/src/stores/familiesStore.spec.ts`

**Interfaces:**
- Produces:
  - `type FamilyLinkRelation = 'origin' | 'joined'`
  - `interface FamilyLinkRef { family: string; personId: string | null; relation: FamilyLinkRelation }`
  - `interface FamilySummary { id: string; name: LocalizedText; isDefault: boolean }`
  - `familyLinks?: FamilyLinkRef[]` on `PersonSummary` and `PersonDetail` — optional, so existing typed fixtures keep compiling
  - `fetchFamilies(baseUrl?)`
  - `useFamiliesStore()`, with:
    - state `{ families, loaded }`
    - getters `defaultFamilyId`, `hasMultiple`, `familyById(id)`, `isKnown(id)`, `routeFamily(id)` (returns `null` for the default family, else the id)
    - action `load()`

- [ ] **Step 1: Write the failing tests**

`src/frontend/src/api/familiesApi.spec.ts`:

```ts
import { describe, it, expect, vi, afterEach } from 'vitest';
import { fetchFamilies } from './familiesApi';

afterEach(() => vi.unstubAllGlobals());

describe('fetchFamilies', () => {
  it('returns the registry from /api/families', async () => {
    const body = [{ id: 'perovsky', name: { ru: null, be: null, en: 'Perovsky' }, isDefault: true }];
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => body });
    vi.stubGlobal('fetch', fetchMock);

    await expect(fetchFamilies()).resolves.toEqual(body);
    expect(fetchMock).toHaveBeenCalledWith('/api/families');
  });

  it('throws on a failed response', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 500 }));

    await expect(fetchFamilies()).rejects.toThrow('500');
  });
});
```

`src/frontend/src/stores/familiesStore.spec.ts`:

```ts
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { setActivePinia, createPinia } from 'pinia';
import { useFamiliesStore } from './familiesStore';

const two = [
  { id: 'perovsky', name: { ru: 'Перовские', be: null, en: 'Perovsky' }, isDefault: true },
  { id: 'kowalski', name: { ru: 'Ковальские', be: null, en: 'Kowalski' }, isDefault: false }
];

beforeEach(() => setActivePinia(createPinia()));
afterEach(() => vi.unstubAllGlobals());

const stub = (body: unknown) => vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => body }));

describe('familiesStore', () => {
  it('loads the registry and knows the default family', async () => {
    stub(two);
    const store = useFamiliesStore();

    await store.load();

    expect(store.defaultFamilyId).toBe('perovsky');
    expect(store.hasMultiple).toBe(true);
    expect(store.isKnown('kowalski')).toBe(true);
    expect(store.isKnown('nowak')).toBe(false);
  });

  it('maps the default family to the unprefixed routes', async () => {
    stub(two);
    const store = useFamiliesStore();
    await store.load();

    expect(store.routeFamily('perovsky')).toBeNull();
    expect(store.routeFamily('kowalski')).toBe('kowalski');
  });

  it('is not switchable with one family', async () => {
    stub([two[0]]);
    const store = useFamiliesStore();
    await store.load();

    expect(store.hasMultiple).toBe(false);
  });

  it('loads only once', async () => {
    stub(two);
    const store = useFamiliesStore();

    await store.load();
    await store.load();

    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('falls back to an empty registry on failure', async () => {
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

- [ ] **Step 3: Implement**

In `types/family.ts`, add `FamilyLinkRelation`, `FamilyLinkRef` and `FamilySummary` as above, and `familyLinks?: FamilyLinkRef[];` to `PersonSummary` and `PersonDetail`.

`src/frontend/src/api/familiesApi.ts`:

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

`src/frontend/src/stores/familiesStore.ts`:

```ts
import { defineStore } from 'pinia';
import type { FamilySummary } from '../types/family';
import { fetchFamilies } from '../api/familiesApi';

interface FamiliesState {
  families: FamilySummary[];
  loaded: boolean;
}

/** The registry of family trees. The *active* family is never stored here: it is derived from the
 *  route (see router/familyRoutes.ts), so deep links, Back and link buttons can't desynchronise it. */
export const useFamiliesStore = defineStore('families', {
  state: (): FamiliesState => ({ families: [], loaded: false }),
  getters: {
    defaultFamilyId(state): string | null {
      return state.families.find(family => family.isDefault)?.id ?? null;
    },
    hasMultiple(state): boolean {
      return state.families.length > 1;
    },
    familyById(state) {
      return (id: string): FamilySummary | undefined => state.families.find(family => family.id === id);
    },
    isKnown(state) {
      return (id: string): boolean => state.families.some(family => family.id === id);
    },
    /** The route family for an id: null (unprefixed routes) for the default family. */
    routeFamily(): (id: string) => string | null {
      return (id: string) => (id === this.defaultFamilyId ? null : id);
    }
  },
  actions: {
    /** Loads once per session; a failure leaves an empty registry, i.e. a single-family app. */
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
    }
  }
});
```

- [ ] **Step 4: Run the tests, then build**

Run: `npm --prefix src/frontend test -- run src/api/familiesApi.spec.ts src/stores/familiesStore.spec.ts`, then `npm --prefix src/frontend run build`.
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "Add the family registry store"
```

---

### Task 11: Family-aware API clients and seed detection

Every client that names a person takes the family first and uses the family-scoped route. Every caller updates in this same task, so the build stays green.

**Files:**
- Modify: `src/frontend/src/api/familyApi.ts`, `biographyApi.ts`, `profileApi.ts`, `photosApi.ts`, and their `.spec.ts` files
- Modify: `src/frontend/src/media/mediaUrl.ts` (add `isUploadKey`), `media/mediaUrl.spec.ts`
- Modify call sites:
  - `stores/selectionStore.ts` (the `fetchPerson` call)
  - `components/MemberDetail.vue:41`
  - `components/BiographyEditor.vue:80`
  - `components/PersonPhotos.vue:53,78,129,136,142,145,148,149`
  - `components/MemberFieldsEditor.vue:64,157`
  - `components/ResidencesEditor.vue:52,142`
  - `stores/familyStore.ts` (the `fetchFamilyGraph` call)
- Modify: `stores/familyStore.ts` — add a `familyId: string | null` state field (default `null`) that the call sites read. Task 13 builds the loading logic on it.

**Interfaces:**
- Produces:
  - `familyApiRoot(familyId: string | null, baseUrl?)`, which returns `${baseUrl}/api` or `${baseUrl}/api/families/${id}`
  - `fetchFamilyGraph(familyId, baseUrl?)`
  - `fetchPerson(familyId, id, baseUrl?)`
  - `putBiography(familyId, personId, biography, baseUrl?)`
  - `getProfile(familyId, personId, baseUrl?)` and `putProfile(familyId, personId, profile, baseUrl?)`
  - `uploadPhoto(familyId, personId, file, role, baseUrl?)`
  - `deletePortrait(familyId, personId, baseUrl?)`
  - `deleteGalleryPhoto(familyId, personId, photoId, baseUrl?)`
  - `promoteGalleryPhoto(familyId, personId, photoId, baseUrl?)`
  - `suppressSeed(familyId, personId, role, baseUrl?)`
  - `isUploadKey(reference: string): boolean`

- [ ] **Step 1: Write the failing tests**

In `familyApi.spec.ts`, update the existing calls to pass `null` first, and add:

```ts
it('uses the alias graph route for the default family', async () => {
  const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ people: [], unions: [] }) });
  vi.stubGlobal('fetch', fetchMock);

  await fetchFamilyGraph(null);

  expect(fetchMock).toHaveBeenCalledWith('/api/family/graph');
});

it('uses the family-scoped routes for another family', async () => {
  const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ people: [], unions: [] }) });
  vi.stubGlobal('fetch', fetchMock);

  await fetchFamilyGraph('kowalski');
  await fetchPerson('kowalski', 'p-0001');

  expect(fetchMock).toHaveBeenNthCalledWith(1, '/api/families/kowalski/graph');
  expect(fetchMock).toHaveBeenNthCalledWith(2, '/api/families/kowalski/people/p-0001');
});
```

In each of `biographyApi.spec.ts`, `profileApi.spec.ts` and `photosApi.spec.ts`, update the existing calls to pass `null` first; their current URL expectations stay the same. Then add one test per exported function asserting the family-scoped URL, for example:

```ts
it('saves a biography in another family on its family-scoped route', async () => {
  const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) });
  vi.stubGlobal('fetch', fetchMock);

  await putBiography('kowalski', 'p-0001', { ru: null, be: null, en: 'x' });

  expect(fetchMock.mock.calls[0][0]).toBe('/api/families/kowalski/people/p-0001/biography');
});
```

The URLs to assert:
- `getProfile` / `putProfile`: `/api/families/kowalski/people/p-0001/profile`
- `uploadPhoto`: `/api/families/kowalski/people/p-0001/photos`
- `deletePortrait`: `…/photos/portrait` (whatever suffix the function uses today, under the family root)
- `deleteGalleryPhoto`: `…/photos/gallery/g1`
- `promoteGalleryPhoto`: `…/photos/gallery/g1/promote`
- `suppressSeed`: `…/photos/seed/portrait`

In `mediaUrl.spec.ts`:

```ts
describe('isUploadKey', () => {
  it.each([
    ['uploads/p-0001/ab.webp', true],
    ['uploads/kowalski/p-0001/ab.webp', true],
    ['p-0001.jpg', false],
    ['portraits/kowalski/p-0001.jpg', false]
  ])('%s → %s', (reference, expected) => {
    expect(isUploadKey(reference)).toBe(expected);
  });
});
```

In `PersonPhotos.spec.ts`, using its existing mount helper, add: a detail whose `portrait` is `'portraits/kowalski/p-0001.jpg'` renders its portrait tile as a seed. Assert the same seed marker the existing bare-seed test asserts, and that removing it calls `suppressSeed`, not `deletePortrait`.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm --prefix src/frontend test -- run src/api src/media src/components/PersonPhotos.spec.ts`
Expected: FAIL.

- [ ] **Step 3: Implement the clients**

In `familyApi.ts`:

```ts
/** API root for a family: the unprefixed alias routes for null (the default family). */
export function familyApiRoot(familyId: string | null, baseUrl = ''): string {
  return familyId ? `${baseUrl}/api/families/${encodeURIComponent(familyId)}` : `${baseUrl}/api`;
}

export async function fetchFamilyGraph(familyId: string | null, baseUrl = ''): Promise<FamilyGraph> {
  const url = familyId ? `${familyApiRoot(familyId, baseUrl)}/graph` : `${baseUrl}/api/family/graph`;
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to load family graph: ${response.status}`);
  }
  return (await response.json()) as FamilyGraph;
}

export async function fetchPerson(familyId: string | null, id: string, baseUrl = ''): Promise<PersonDetail> {
  const response = await fetch(`${familyApiRoot(familyId, baseUrl)}/people/${id}`);
  if (!response.ok) {
    throw new Error(`Failed to load person ${id}: ${response.status}`);
  }
  return (await response.json()) as PersonDetail;
}
```

In `biographyApi.ts`, `profileApi.ts` and `photosApi.ts`:
- add `familyId: string | null` as the first parameter of each exported function;
- replace each `` `${baseUrl}/api/people/${personId}…` `` with `` `${familyApiRoot(familyId, baseUrl)}/people/${personId}…` ``;
- import `familyApiRoot` from `./familyApi`.

Everything else stays: `credentials`, headers, error handling.

In `media/mediaUrl.ts`:

```ts
/** True for an uploaded object; every other media reference is a seed (mirrors StorageKeys.IsUploadKey). */
export function isUploadKey(reference: string): boolean {
  return reference.startsWith('uploads/');
}
```

- [ ] **Step 4: Update every call site**

Add `familyId: null as string | null` to `familyStore`'s state and interface. It holds the family the store currently represents.

Each component calls `useFamilyStore()` (imported from `../stores/familyStore`) and passes `familyStore.familyId` as the new first argument:
- `BiographyEditor.vue:80`: `putBiography(familyStore.familyId, props.personId, buildPayload())`
- `MemberFieldsEditor.vue:64,157` and `ResidencesEditor.vue:52,142`: `getProfile(familyStore.familyId, props.personId)`, `putProfile(familyStore.familyId, props.personId, payload)`
- `PersonPhotos.vue:129,136,142,145,148,149`: prefix each call's arguments with `familyStore.familyId`
- `PersonPhotos.vue:53`: `seed: !isUploadKey(portrait)`; line 78: `seed: !isUploadKey(photo.full)` (import `isUploadKey` from `../media/mediaUrl`)
- `MemberDetail.vue:41`: `fetchPerson(store.familyId, id)`, using whatever it calls the family store
- `selectionStore.ts`: `fetchPerson(useFamilyStore().familyId, id)`, calling `useFamilyStore()` inside the action
- `familyStore.ts` `load()`: `fetchFamilyGraph(this.familyId)`

Update each affected component spec's `vi.mock` expectations to the new argument lists. `TreeView.spec`, `MembersView.spec` and `ChronicleView.spec` mock `fetchFamilyGraph`/`fetchPerson` with `vi.fn()`, so they need no change unless they assert call arguments.

- [ ] **Step 5: Run the tests and build**

Run: `npm --prefix src/frontend test` and `npm --prefix src/frontend run build`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "Send every person request to the family it belongs to"
```

---

### Task 12: Family routes and family-aware navigation

**Files:**
- Create: `src/frontend/src/router/familyRoutes.ts`, `router/familyRoutes.spec.ts`
- Modify: `router/index.ts`, `router/firstVisit.ts`, `router/firstVisit.spec.ts`
- Modify navigations:
  - `views/TreeView.vue:77,81-82,111,120`
  - `views/MembersView.vue:38,43`
  - `views/ChronicleView.vue:45`
  - `components/MemberDetail.vue:110,190`
  - `components/PersonHeader.vue:79`
- Test: `views/TreeView.spec.ts`

**Interfaces:**
- Produces:
  - `type FamilyView = 'tree' | 'chronicle' | 'members' | 'person'`
  - `buildRoutes(views: { tree; chronicle; members }): RouteRecordRaw[]`, with route names `tree|chronicle|members|person` and `family-tree|family-chronicle|family-members|family-person`
  - `activeFamilyId(route): string | null`
  - `familyLocation(view: FamilyView, familyId: string | null, params?: Record<string, string>): RouteLocationRaw`
  - `isView(route, view): boolean`

- [ ] **Step 1: Write the failing tests**

`src/frontend/src/router/familyRoutes.spec.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { createRouter, createMemoryHistory } from 'vue-router';
import { buildRoutes, activeFamilyId, familyLocation, isView } from './familyRoutes';

const stub = { template: '<div />' };
const makeRouter = () => createRouter({ history: createMemoryHistory(), routes: buildRoutes({ tree: stub, chronicle: stub, members: stub }) });

describe('family routes', () => {
  it('keeps the unprefixed routes for the default family', async () => {
    const router = makeRouter();
    await router.push('/person/anna-1900-p-7');

    expect(router.currentRoute.value.name).toBe('person');
    expect(activeFamilyId(router.currentRoute.value)).toBeNull();
  });

  it.each([
    ['/f/kowalski', 'family-tree'],
    ['/f/kowalski/chronicle', 'family-chronicle'],
    ['/f/kowalski/members', 'family-members'],
    ['/f/kowalski/members/anna-1900-p-7', 'family-members'],
    ['/f/kowalski/person/anna-1900-p-7', 'family-person']
  ])('resolves %s to %s with the family', async (path, name) => {
    const router = makeRouter();
    await router.push(path);

    expect(router.currentRoute.value.name).toBe(name);
    expect(activeFamilyId(router.currentRoute.value)).toBe('kowalski');
  });

  it('builds prefixed and unprefixed locations', () => {
    const router = makeRouter();

    expect(router.resolve(familyLocation('person', 'kowalski', { slug: 'p-7' })).fullPath).toBe('/f/kowalski/person/p-7');
    expect(router.resolve(familyLocation('person', null, { slug: 'p-7' })).fullPath).toBe('/person/p-7');
    expect(router.resolve(familyLocation('members', 'kowalski')).fullPath).toBe('/f/kowalski/members');
    expect(router.resolve(familyLocation('tree', null)).fullPath).toBe('/');
  });

  it('recognises a view in either shape', async () => {
    const router = makeRouter();
    await router.push('/f/kowalski');

    expect(isView(router.currentRoute.value, 'tree')).toBe(true);
    expect(isView(router.currentRoute.value, 'person')).toBe(false);
  });
});
```

In `firstVisit.spec.ts`, add these routes to its `makeRouter`:

```ts
      { path: '/f/:familyId', name: 'family-tree', component: Stub },
      { path: '/f/:familyId/chronicle', name: 'family-chronicle', component: Stub },
      { path: '/f/:familyId/person/:slug', name: 'family-person', component: Stub }
```

Then add:

```ts
  it('redirects the first load of a family root to that family chronicle', async () => {
    const router = makeRouter();
    await router.push('/f/kowalski');

    expect(router.currentRoute.value.name).toBe('family-chronicle');
    expect(router.currentRoute.value.params.familyId).toBe('kowalski');
  });

  it('a family chronicle visit does not mark explored', async () => {
    const router = makeRouter();
    await router.push('/f/kowalski/chronicle');

    expect(localStorage.getItem(EXPLORED_STORAGE_KEY)).toBeNull();
  });
```

In `TreeView.spec.ts`, add a `describe` that builds its router with `buildRoutes({ tree: TreeView, chronicle: stub, members: stub })` instead of the spec's two-route `makeRouter`. Mount the view the way the spec's existing tests do, with the same graph mock:

```ts
it('keeps the family in the URL when canonicalising a person slug', async () => {
  const router = familyRouter();
  const person = graph.people[0];
  await router.push(`/f/kowalski/person/${person.id}`);
  await mountTree(router);   // the spec's existing mount path
  await flushPromises();
  await flushPromises();

  expect(router.currentRoute.value.fullPath).toBe(`/f/kowalski/person/${personSlug(person)}`);
});
```

Use the spec's existing mounting code for `mountTree`; if it is inline, extract it into a local helper within the spec.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm --prefix src/frontend test -- run src/router src/views/TreeView.spec.ts`
Expected: FAIL.

- [ ] **Step 3: Implement the routes**

`src/frontend/src/router/familyRoutes.ts`:

```ts
import type { Component } from 'vue';
import type { RouteLocationNormalized, RouteLocationRaw, RouteRecordRaw } from 'vue-router';

export type FamilyView = 'tree' | 'chronicle' | 'members' | 'person';

/** Every view exists twice: unprefixed for the default family (existing links keep working) and
 *  under /f/:familyId for the rest. Both shapes share one component. */
export function buildRoutes(views: { tree: Component; chronicle: Component; members: Component }): RouteRecordRaw[] {
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

/** The family named by the route; null on the unprefixed routes (the default family). */
export function activeFamilyId(route: Pick<RouteLocationNormalized, 'params'>): string | null {
  const value = route.params.familyId;
  const id = Array.isArray(value) ? value[0] : value;
  return id ? id : null;
}

/** A location for a view in a family: prefixed when a family is named, unprefixed for null. */
export function familyLocation(view: FamilyView, familyId: string | null, params: Record<string, string> = {}): RouteLocationRaw {
  return familyId ? { name: `family-${view}`, params: { ...params, familyId } } : { name: view, params };
}

/** True when the route is the given view, in either shape. */
export function isView(route: Pick<RouteLocationNormalized, 'name'>, view: FamilyView): boolean {
  return route.name === view || route.name === `family-${view}`;
}
```

`router/index.ts`: replace the `routes` array with `buildRoutes({ tree: TreeView, chronicle: ChronicleView, members: MembersView })`.

`router/firstVisit.ts`:

```ts
export function installFirstVisitRedirect(router: Router): void {
  router.beforeEach((to, from) => {
    if (from !== START_LOCATION || hasExplored()) {
      return;
    }
    if (to.name === 'tree') {
      return { name: 'chronicle', replace: true };
    }
    if (to.name === 'family-tree') {
      return { name: 'family-chronicle', params: { familyId: to.params.familyId }, replace: true };
    }
  });
  router.afterEach(to => {
    if (to.name !== 'chronicle' && to.name !== 'family-chronicle') {
      markExplored();
    }
  });
}
```

Keep the existing comment block above it, adding "(either route shape)".

- [ ] **Step 4: Make every navigation family-aware**

Each file imports `{ activeFamilyId, familyLocation, isView }` from the router module (`../router/familyRoutes`) and `useRoute` where it isn't already imported:

- `TreeView.vue:77`: `router.replace(familyLocation('person', activeFamilyId(route), { slug }))`
- `TreeView.vue:81-82`: `if (!isView(route, 'tree')) { void router.replace(familyLocation('tree', activeFamilyId(route))); }`
- `TreeView.vue:111`: `router.replace(familyLocation('person', activeFamilyId(route), { slug }))`
- `TreeView.vue:120`: `router.push(familyLocation('person', activeFamilyId(route), { slug: slugFor(id) }))`
- `MembersView.vue:38`: `router.push(familyLocation('members', activeFamilyId(route), { slug: person ? personSlug(person) : id }))`
- `MembersView.vue:43`: `router.push(familyLocation('members', activeFamilyId(route)))`
- `ChronicleView.vue:45`: `router.push(familyLocation('tree', activeFamilyId(route)))`
- `MemberDetail.vue:110`: `router.push(familyLocation('person', activeFamilyId(route), { slug: personSlug(person) }))`
- `MemberDetail.vue:190`: `router.replace(familyLocation('members', activeFamilyId(route), { slug: nextSlug }))`
- `PersonHeader.vue:79`: `router.push(familyLocation('members', activeFamilyId(route), { slug: personSlug(person) }))`

Then check nothing was missed. From `src/frontend/src`, `grep -rnE "name: '(tree|chronicle|members|person)'" --include=*.vue .` must return no hits outside `router/`.

`PersonHeader.spec.ts`'s `makeRouter` names routes `members` and `person` without a `familyId`, so its existing "open in members" test keeps working.

- [ ] **Step 5: Run the tests and build**

Run: `npm --prefix src/frontend test` and `npm --prefix src/frontend run build`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "Route every view per family and keep navigation inside the family"
```

---

### Task 13: One family-aware load path, with state reset

**Files:**
- Modify: `stores/familyStore.ts`, `stores/selectionStore.ts`, `stores/panelStore.ts`
- Create: `router/familySync.ts`, `router/familySync.spec.ts`
- Modify: `router/index.ts` (install the sync), `App.vue` (registry load only), and `main.ts` only if it installs Pinia after the router
- Modify: `views/TreeView.vue`, `views/MembersView.vue`, `views/ChronicleView.vue` (on-mount load, watcher guards, error back link)
- Modify: `i18n/messages/{en,ru,be}.ts` (`family.backToMain`)
- Test: `stores/familyStore.spec.ts`, `stores/selectionStore.spec.ts`, `stores/panelStore.spec.ts`, `views/TreeView.spec.ts`, `App.spec.ts`

**Interfaces:**
- Produces:
  - `familyStore.ensureFamily(familyId: string | null): Promise<void>`
  - `familyStore.reset()`
  - `familyStore.load(familyId = this.familyId)`, now guarded by a request token
  - `selectionStore.reset()`, backed by a generation guard
  - `panelStore.clearPersons()` and `panelStore.generation`

- [ ] **Step 1: Write the failing tests**

Add to `familyStore.spec.ts` (it mocks `fetchFamilyGraph`):

```ts
describe('ensureFamily', () => {
  it('loads the requested family once', async () => {
    vi.mocked(fetchFamilyGraph).mockResolvedValue({ people: [person('p-1', true)], unions: [] } as FamilyGraph);
    const store = useFamilyStore();

    await store.ensureFamily('kowalski');
    await store.ensureFamily('kowalski');

    expect(fetchFamilyGraph).toHaveBeenCalledTimes(1);
    expect(fetchFamilyGraph).toHaveBeenCalledWith('kowalski');
    expect(store.familyId).toBe('kowalski');
  });

  it('resets people, selection and person panels when the family changes', async () => {
    vi.mocked(fetchFamilyGraph).mockResolvedValue({ people: [person('p-1', true)], unions: [] } as FamilyGraph);
    const store = useFamilyStore();
    const selection = useSelectionStore();
    const panels = usePanelStore();
    await store.ensureFamily(null);
    selection.cache['p-1'] = {} as never;
    panels.openPerson('p-1');

    const pending = store.ensureFamily('kowalski');

    expect(store.people).toEqual([]);
    expect(selection.cache).toEqual({});
    expect(panels.personPanels).toEqual([]);
    await pending;
  });

  it('does not reset on the very first load (keeps a deep-linked panel)', async () => {
    vi.mocked(fetchFamilyGraph).mockResolvedValue({ people: [person('p-1', true)], unions: [] } as FamilyGraph);
    const panels = usePanelStore();
    panels.openPerson('p-1');

    await useFamilyStore().ensureFamily('kowalski');

    expect(panels.personPanels).toHaveLength(1);
  });

  it('discards a stale response that resolves after a newer switch', async () => {
    let resolveFirst!: (graph: FamilyGraph) => void;
    vi.mocked(fetchFamilyGraph)
      .mockImplementationOnce(() => new Promise(resolve => { resolveFirst = resolve; }))
      .mockResolvedValueOnce({ people: [person('p-k', true)], unions: [] } as FamilyGraph);
    const store = useFamilyStore();

    const first = store.ensureFamily(null);
    await store.ensureFamily('kowalski');
    resolveFirst({ people: [person('p-old', true)], unions: [] } as FamilyGraph);
    await first;

    expect(store.people.map(p => p.id)).toEqual(['p-k']);
  });

  it('still resets on a switch after a failed load', async () => {
    vi.mocked(fetchFamilyGraph)
      .mockRejectedValueOnce(new Error('404'))
      .mockResolvedValueOnce({ people: [person('p-1', true)], unions: [] } as FamilyGraph);
    const store = useFamilyStore();
    const panels = usePanelStore();
    await store.ensureFamily('nowak');
    panels.openPerson('p-3');

    await store.ensureFamily(null);

    expect(panels.personPanels).toEqual([]);
  });
});
```

Import `useSelectionStore` and `usePanelStore` at the top of the spec.

Add to `selectionStore.spec.ts`, following its existing `fetchPerson` mock:

```ts
it('ignores a person response that lands after a reset', async () => {
  let resolve!: (detail: PersonDetail) => void;
  vi.mocked(fetchPerson).mockImplementationOnce(() => new Promise(r => { resolve = r; }));
  const store = useSelectionStore();

  const pending = store.open('p-1');
  store.reset();
  resolve({ id: 'p-1' } as PersonDetail);
  await pending;

  expect(store.cache).toEqual({});
  expect(store.detail).toBeNull();
});
```

Add to `panelStore.spec.ts`:

```ts
it('clears every person panel and bumps the generation', () => {
  const store = usePanelStore();
  store.openPerson('p-1');
  store.openBiggerView('p-1');
  const before = store.generation;

  store.clearPersons();

  expect(store.personPanels).toEqual([]);
  expect(store.biggerViewId).toBeNull();
  expect(store.generation).toBe(before + 1);
});
```

Add to `TreeView.spec.ts`, in the `describe` that uses the family router from Task 12:

```ts
it('opens the same person id in a different family after a cross-family jump', async () => {
  const router = familyRouter();
  const person = graph.people[0];
  await router.push(`/person/${personSlug(person)}`);
  await mountTree(router);
  await flushPromises();

  await router.push(`/f/kowalski/person/${person.id}`);
  await flushPromises();
  await flushPromises();

  expect(fetchFamilyGraph).toHaveBeenLastCalledWith('kowalski');
  expect(usePanelStore().expandedId).toBe(person.id);
  expect(fetchPerson).toHaveBeenLastCalledWith('kowalski', person.id);
  expect(useSelectionStore().selectedId).toBe(person.id);
  expect(router.currentRoute.value.path.startsWith('/f/kowalski/person/')).toBe(true);
});
```

Extend Task 12's `familyRouter()` helper to call `installFamilySync(router)` (Step 4). The router then drives `ensureFamily` exactly as in the app, with no manual stand-in. Before the second push, make `fetchPerson` resolve with `vi.mocked(fetchPerson).mockResolvedValue({ id: person.id } as never)`. The `fetchPerson` assertion is the one that catches a switch that expands the panel but never loads its detail.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm --prefix src/frontend test -- run src/stores src/views/TreeView.spec.ts`
Expected: FAIL.

- [ ] **Step 3: Implement the stores**

`panelStore.ts`: add `generation: number` to `PanelState` (initial `0`) and:

```ts
    /** Drops every person panel (ids are only unique within a family). Bumps `generation` so
     *  watchers can tell a family switch from a user closing a panel. */
    clearPersons(): void {
      this.personPanels = [];
      this.biggerViewId = null;
      this.generation++;
    },
```

`selectionStore.ts`: add `generation: number` to the state (initial `0`). In `open`, capture `const generation = this.generation;` before the `await`, and immediately after the `await` (and in `catch` / `finally`) return early when `generation !== this.generation`. Then add:

```ts
    /** Clears the selection and its cache; an in-flight request for the old family is ignored. */
    reset(): void {
      this.generation++;
      this.selectedId = null;
      this.detail = null;
      this.loading = false;
      this.error = null;
      this.cache = {};
    },
```

`familyStore.ts`: add `requestedKey: string | null` (initial `null`) and `requestToken: number` (initial `0`) to the state, next to `familyId` from Task 11. Replace `load` and add `ensureFamily` and `reset`:

```ts
    /** The single entry point for showing a family. No-op when it is already loaded or loading;
     *  otherwise drops the previous family's people, selection and person panels (ids are only
     *  unique within a family), then loads. The very first load resets nothing, so a deep-linked
     *  person panel survives. */
    async ensureFamily(familyId: string | null): Promise<void> {
      const key = familyId ?? '';
      if (this.requestedKey === key) {
        return;
      }
      // Any earlier request, even a failed one, may have left another family's state on screen.
      if (this.requestToken > 0) {
        this.reset();
        useSelectionStore().reset();
        usePanelStore().clearPersons();
      }
      this.requestedKey = key;
      await this.load(familyId);
    },
    async load(familyId: string | null = this.familyId): Promise<void> {
      const token = ++this.requestToken;
      this.familyId = familyId;
      this.loading = true;
      this.error = null;
      try {
        const graph = await fetchFamilyGraph(familyId);
        if (token !== this.requestToken) {
          return;
        }
        this.people = graph.people;
        this.unions = graph.unions;
        this.focusId = this.defaultRootId;
      } catch (cause) {
        if (token !== this.requestToken) {
          return;
        }
        this.error = cause instanceof Error ? cause.message : 'Failed to load family';
        this.requestedKey = null;   // allow a retry of the same family
      } finally {
        if (token === this.requestToken) {
          this.loading = false;
        }
      }
    },
    reset(): void {
      this.people = [];
      this.unions = [];
      this.focusId = null;
      this.error = null;
    },
```

Import `useSelectionStore` and `usePanelStore` at the top of `familyStore.ts`. Pinia tolerates the module cycle because each store is only called inside actions.

- [ ] **Step 4: Wire the loaders**

Create `src/frontend/src/router/familySync.ts`. The router, not a component watcher, reacts to a family change. `afterEach` runs synchronously once the route is committed and before any component watcher flushes, so per-family state is already reset when the views see the new route. This removes any dependence on component watcher order:

```ts
import type { Router } from 'vue-router';
import { useFamilyStore } from '../stores/familyStore';
import { activeFamilyId } from './familyRoutes';

/** Shows the route's family after every successful navigation (idempotent for the same family). */
export function installFamilySync(router: Router): void {
  router.afterEach((to, _from, failure) => {
    if (!failure) {
      void useFamilyStore().ensureFamily(activeFamilyId(to));
    }
  });
}
```

In `router/index.ts`, call `installFamilySync(router);` after `installFirstVisitRedirect(router);`.

The hook calls a store, so Pinia must be active before the router's initial navigation. Check `src/frontend/src/main.ts`: `app.use(pinia)` must come before `app.use(router)`; swap them if not.

Create `src/frontend/src/router/familySync.spec.ts`:

```ts
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { setActivePinia, createPinia } from 'pinia';
import { createRouter, createMemoryHistory } from 'vue-router';

vi.mock('../api/familyApi', () => ({ fetchFamilyGraph: vi.fn(), fetchPerson: vi.fn() }));

import { fetchFamilyGraph } from '../api/familyApi';
import { buildRoutes } from './familyRoutes';
import { installFamilySync } from './familySync';

const stub = { template: '<div />' };

beforeEach(() => {
  setActivePinia(createPinia());
  vi.mocked(fetchFamilyGraph).mockReset().mockResolvedValue({ people: [], unions: [] });
});

describe('installFamilySync', () => {
  it('loads the family named by each navigation, once per family', async () => {
    const router = createRouter({ history: createMemoryHistory(), routes: buildRoutes({ tree: stub, chronicle: stub, members: stub }) });
    installFamilySync(router);

    await router.push('/f/kowalski');
    await router.push('/f/kowalski/chronicle');
    await router.push('/');

    expect(vi.mocked(fetchFamilyGraph).mock.calls).toEqual([['kowalski'], [null]]);
  });
});
```

`App.vue`: add only `import { useFamiliesStore } from './stores/familiesStore';`, `const familiesStore = useFamiliesStore();` and `void familiesStore.load();` inside the existing `onMounted`. `App.spec` does not stub `fetch`, and `familiesStore.load` swallows the failure.

In `TreeView.vue`, `MembersView.vue` and `ChronicleView.vue`, replace the `if (store.people.length === 0) { void store.load(); }` block in `onMounted` with `void store.ensureFamily(activeFamilyId(route));`. `ChronicleView` needs `useRoute`.

In `TreeView.vue`:
- Replace the `panel.expandedId` watcher (lines 69-85). A family switch skips **only the navigation**, never the detail fetch: `selection.open` is the sole loader of the panel's detail (`TreeView.vue:74`). A URL is also only rewritten to a friendly slug once that person is known, so a just-reset store can't flicker the address bar to a bare id:

```ts
watch(
  () => [panel.expandedId, panel.generation] as const,
  ([id, generation], [, previousGeneration]) => {
    // A generation bump means clearPersons() ran for a family switch: the route already names
    // the target, so load state but don't navigate.
    const familySwitch = generation !== previousGeneration;
    const familyId = activeFamilyId(route);
    if (id) {
      void selection.open(id);
      const person = store.personById(id);
      if (!familySwitch && person && route.params.slug !== personSlug(person)) {
        void router.replace(familyLocation('person', familyId, { slug: personSlug(person) }));
      }
    } else {
      selection.close();
      if (!familySwitch && !isView(route, 'tree')) {
        void router.replace(familyLocation('tree', familyId));
      }
    }
  }
);
```
- The `selectedId` watcher (line ~91) watches `() => [activeFamilyId(route), selectedId.value] as const` and uses the second element as `id`. A jump to the same person id in another family must re-open that panel.
- The canonical-slug watcher (lines 103-113) watches `() => { const id = selectedId.value; const person = id ? store.personById(id) : undefined; return person ? personSlug(person) : null; }`. It no longer falls back to the bare id, so after a reset it waits for the graph instead of rewriting a friendly slug to a bare one; this also fixes the flicker on Back. Its body keeps `router.replace(familyLocation('person', activeFamilyId(route), { slug }))` from Task 12.

In `MembersView.vue`'s template, give `<MemberDetail>` the attribute `:key="`${activeFamilyId(route) ?? ''}:${selectedId}`"`. It reloads only when `personId` changes, and person ids repeat across families.

In each of the three views' error `<p v-else-if="error">` blocks, add a link after the message:

```html
    <router-link v-if="error && activeFamilyId(route)" :to="{ name: 'tree' }" data-test="back-to-main-tree">{{ t('family.backToMain') }}</router-link>
```

If a view's error branch is a single `<p>`, wrap the `<p>` and the link in `<div v-else-if="error">`. Keep the existing status classes.

i18n: add `family: { backToMain: … }`:
- `en`: `'Back to the main tree'`
- `ru`: `'Вернуться к основному древу'`
- `be`: `'Вярнуцца да галоўнага дрэва'`

- [ ] **Step 5: Run the tests and build**

Run: `npm --prefix src/frontend test` and `npm --prefix src/frontend run build`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "Load one family at a time and reset per-family state on a switch"
```

---

### Task 14: The switcher, docs, and PR 3

**Files:**
- Create: `src/frontend/src/components/FamilySwitcher.vue`, `components/FamilySwitcher.spec.ts`
- Modify: `components/SettingsPanel.vue`, `i18n/messages/{en,ru,be}.ts`
- Docs: `docs/reference/`

- [ ] **Step 1: Write the failing tests**

`src/frontend/src/components/FamilySwitcher.spec.ts`:

```ts
import { describe, it, expect, beforeEach } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { createRouter, createMemoryHistory } from 'vue-router';
import { i18n } from '../i18n';
import FamilySwitcher from './FamilySwitcher.vue';
import { useFamiliesStore } from '../stores/familiesStore';
import { useLocaleStore } from '../stores/localeStore';
import { buildRoutes } from '../router/familyRoutes';

const stub = { template: '<div />' };
const two = [
  { id: 'perovsky', name: { ru: null, be: null, en: 'Perovsky' }, isDefault: true },
  { id: 'kowalski', name: { ru: null, be: null, en: 'Kowalski' }, isDefault: false }
];

async function mountAt(path: string, families = two) {
  const store = useFamiliesStore();
  store.families = families;
  store.loaded = true;
  const router = createRouter({ history: createMemoryHistory(), routes: buildRoutes({ tree: stub, chronicle: stub, members: stub }) });
  await router.push(path);
  const wrapper = mount(FamilySwitcher, { global: { plugins: [router, i18n] } });
  return { wrapper, router };
}

beforeEach(() => {
  setActivePinia(createPinia());
  localStorage.clear();
  useLocaleStore().setLocale('en');
});

describe('FamilySwitcher', () => {
  it('lists every family and marks the one in the route', async () => {
    const { wrapper } = await mountAt('/f/kowalski');

    const options = wrapper.findAll('[data-test="family-switcher-option"]');
    expect(options).toHaveLength(2);
    expect(options.filter(o => o.attributes('aria-checked') === 'true').map(o => o.text())).toEqual(['Kowalski']);
  });

  it('marks the default family on the unprefixed routes', async () => {
    const { wrapper } = await mountAt('/');

    const checked = wrapper.findAll('[data-test="family-switcher-option"]').filter(o => o.attributes('aria-checked') === 'true');
    expect(checked.map(o => o.text())).toEqual(['Perovsky']);
  });

  it('is hidden with a single family', async () => {
    const { wrapper } = await mountAt('/', [two[0]]);

    expect(wrapper.find('[data-test="family-switcher"]').exists()).toBe(false);
  });

  it('switches to another family on its prefixed tree', async () => {
    const { wrapper, router } = await mountAt('/');

    await wrapper.findAll('[data-test="family-switcher-option"]')[1].trigger('click');
    await flushPromises();

    expect(router.currentRoute.value.fullPath).toBe('/f/kowalski');
  });

  it('switches back to the default family on the unprefixed tree', async () => {
    const { wrapper, router } = await mountAt('/f/kowalski');

    await wrapper.findAll('[data-test="family-switcher-option"]')[0].trigger('click');
    await flushPromises();

    expect(router.currentRoute.value.fullPath).toBe('/');
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm --prefix src/frontend test -- run src/components/FamilySwitcher.spec.ts`
Expected: FAIL — component missing.

- [ ] **Step 3: Implement**

`src/frontend/src/components/FamilySwitcher.vue`:

```vue
<script setup lang="ts">
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRoute, useRouter } from 'vue-router';
import { useFamiliesStore } from '../stores/familiesStore';
import { useLocaleStore } from '../stores/localeStore';
import { activeFamilyId, familyLocation } from '../router/familyRoutes';
import { localize } from '../i18n/localize';
import type { FamilySummary } from '../types/family';

const { t } = useI18n({ useScope: 'global' });
const families = useFamiliesStore();
const localeStore = useLocaleStore();
const route = useRoute();
const router = useRouter();

// The route is the source of truth; the unprefixed routes are the default family.
const activeId = computed(() => activeFamilyId(route) ?? families.defaultFamilyId);

function label(family: FamilySummary): string {
  return localize(family.name, localeStore.currentLocale) || family.id;
}

function switchTo(family: FamilySummary): void {
  void router.push(familyLocation('tree', families.routeFamily(family.id)));
}
</script>

<template>
  <div v-if="families.hasMultiple" class="family-switcher" data-test="family-switcher">
    <span class="family-switcher__label">{{ t('family.label') }}</span>
    <ul class="family-switcher__list" role="radiogroup" :aria-label="t('family.label')">
      <li v-for="family in families.families" :key="family.id">
        <button
          type="button"
          role="radio"
          class="family-switcher__option"
          :class="{ 'family-switcher__option--on': family.id === activeId }"
          :aria-checked="family.id === activeId"
          data-test="family-switcher-option"
          @click="switchTo(family)"
        >{{ label(family) }}</button>
      </li>
    </ul>
  </div>
</template>

<style scoped lang="scss">
.family-switcher { display: flex; flex-direction: column; gap: 6px; }
.family-switcher__label { font-family: var(--font-display); color: var(--gilt-deep); }
.family-switcher__list { display: flex; flex-wrap: wrap; gap: 6px; list-style: none; margin: 0; padding: 0; }
.family-switcher__option {
  font-family: var(--font-body); color: var(--ink); background: transparent;
  border: 1px solid var(--gilt); border-radius: 4px; padding: 4px 10px; cursor: pointer;

  &:hover:not(&--on) { background: var(--control-hover); }
  &--on { background: var(--bark); color: var(--on-accent); }
}
</style>
```

The locale store's field is `currentLocale` (`localeStore.ts:7`). Match the font-size and label styling of `SettingsPanel`'s existing `settings-panel__label` and option buttons, which sit at lines 60-95 of that file, so the group looks native.

In `SettingsPanel.vue`, import `FamilySwitcher` and render `<FamilySwitcher />` as the first child of `.settings-panel`, above the language row.

i18n: extend the `family` group:
- `en`: `label: 'Family tree'`
- `ru`: `label: 'Родовое древо'`
- `be`: `label: 'Радавое дрэва'`

- [ ] **Step 4: Run the gates**

```bash
npm --prefix src/frontend test
npm --prefix src/frontend run build
```

Expected: PASS.

- [ ] **Step 5: Verify in the browser**

Start a pair with the dev registry:

```bash
FamilyData__Registry=Data/families.json node scripts/dev.mjs --instance 4
```

In the Browser pane, check each of these:
- The settings panel shows "Family tree" with both families, on desktop and in the mobile sheet.
- Picking Kowalski shows `/f/kowalski` and the Kowalski tree.
- Clicking a medallion there stays under `/f/kowalski/person/…`.
- The Members page and the roster stay in Kowalski.
- Switching back shows `/` and the main tree, with no stale person panel.
- `/f/nowak` shows the error state with "Back to the main tree".
- Both Film and Classic themes look right.
- There are no console errors.

Take screenshots of the switcher and of the Kowalski tree.

- [ ] **Step 6: Update the docs**

Run the `update-docs-for-pr` skill. `docs/reference/` gains:
- the `/f/:familyId` URL shapes and that the default family stays unprefixed;
- the switcher, including when it is hidden;
- the reset-on-switch behaviour;
- the unknown-family state.

- [ ] **Step 7: Commit, push, open the PR, stop**

```bash
git add -A
git commit -m "Add a family tree switcher to the settings panel"
git push -u origin claude/multi-family-3-spa
gh pr create --base main --title "Switch between family trees in the app" --body-file <body>
```

Attach the screenshots. End the PR body with the Claude Code attribution line. **Stop.**

---
## PR 4 — Cross-family member links

**PR title:** "Follow a member to their other family tree"
**Branch:** `claude/multi-family-4-links`, off `main` after PR 3 merges.

### Task 15: The member-card buttons

**Files:**
- Modify: `src/frontend/src/components/PersonHeader.vue` (script + the `header__vocrow` row at lines 117-124)
- Modify: `src/frontend/src/i18n/messages/{en,ru,be}.ts`
- Test: `src/frontend/src/components/PersonHeader.spec.ts`

**Interfaces:**
- Consumes (PR 3):
  - `useFamiliesStore()`, with `isKnown(id)`, `familyById(id)` and `routeFamily(id)` (returns `null` for the default family);
  - `familyLocation(view, familyId, params?)` from `router/familyRoutes.ts`;
  - `buildRoutes(views)`;
  - `PersonDetail.familyLinks?: FamilyLinkRef[]`;
  - `localize(text, locale)` from `i18n/localize.ts`.
- Produces: `data-test="open-family-link"` buttons.

- [ ] **Step 1: Write the failing tests**

Add to `PersonHeader.spec.ts`. It already has `tadeusz`, `mountWith(detail, router)`, Pinia set up in `beforeEach`, and the locale set to `en`.

```ts
import { buildRoutes } from '../router/familyRoutes';
import { useFamiliesStore } from '../stores/familiesStore';

const stub = { template: '<div />' };
const families = [
  { id: 'perovsky', name: { ru: 'Перовские', be: null, en: 'Perovsky' }, isDefault: true },
  { id: 'kowalski', name: { ru: 'Ковальские', be: null, en: 'Kowalski' }, isDefault: false }
];

function familyRouter() {
  return createRouter({ history: createMemoryHistory(), routes: buildRoutes({ tree: stub, chronicle: stub, members: stub }) });
}

function withRegistry() {
  const store = useFamiliesStore();
  store.families = families;
  store.loaded = true;
}

describe('PersonHeader family links', () => {
  it('offers the family a person came from, named in the current locale', () => {
    withRegistry();
    const w = mountWith({ ...tadeusz, familyLinks: [{ family: 'kowalski', personId: 'p-0042', relation: 'origin' }] }, familyRouter());

    expect(w.get('[data-test="open-family-link"]').text()).toBe('Kowalski family tree');
  });

  it('labels a family the person joined', () => {
    withRegistry();
    const w = mountWith({ ...tadeusz, familyLinks: [{ family: 'kowalski', personId: null, relation: 'joined' }] }, familyRouter());

    expect(w.get('[data-test="open-family-link"]').text()).toBe('Family they joined: Kowalski');
  });

  it('opens the linked person in the other family, using the bare id as the slug', async () => {
    withRegistry();
    const router = familyRouter();
    const w = mountWith({ ...tadeusz, familyLinks: [{ family: 'kowalski', personId: 'p-0042', relation: 'origin' }] }, router);

    await w.get('[data-test="open-family-link"]').trigger('click');
    await flushPromises();

    expect(router.currentRoute.value.fullPath).toBe('/f/kowalski/person/p-0042');
  });

  it('opens the other family root when the link names no counterpart', async () => {
    withRegistry();
    const router = familyRouter();
    const w = mountWith({ ...tadeusz, familyLinks: [{ family: 'kowalski', personId: null, relation: 'joined' }] }, router);

    await w.get('[data-test="open-family-link"]').trigger('click');
    await flushPromises();

    expect(router.currentRoute.value.fullPath).toBe('/f/kowalski');
  });

  it('links back to the default family on the unprefixed routes', async () => {
    withRegistry();
    const router = familyRouter();
    await router.push('/f/kowalski/person/p-0042');
    const w = mountWith({ ...tadeusz, familyLinks: [{ family: 'perovsky', personId: 'p-0016', relation: 'joined' }] }, router);

    await w.get('[data-test="open-family-link"]').trigger('click');
    await flushPromises();

    expect(router.currentRoute.value.fullPath).toBe('/person/p-0016');
  });

  it('hides a link to an unregistered family', () => {
    withRegistry();
    const w = mountWith({ ...tadeusz, familyLinks: [{ family: 'nowak', personId: 'p-0001', relation: 'origin' }] }, familyRouter());

    expect(w.find('[data-test="open-family-link"]').exists()).toBe(false);
  });

  it('renders no link when the person has none', () => {
    withRegistry();
    const w = mountWith(tadeusz, familyRouter());

    expect(w.find('[data-test="open-family-link"]').exists()).toBe(false);
  });
});
```

Import `flushPromises` from `@vue/test-utils`.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm --prefix src/frontend test -- run src/components/PersonHeader.spec.ts`
Expected: FAIL — no `open-family-link` element.

- [ ] **Step 3: Add the strings**

Add a `family` group to each locale's messages. If PR 3's switcher already added `family.label` / `family.switchTo`, extend that group rather than adding a second one.

- `en.ts`: `openOrigin: '{name} family tree'`, `openJoined: 'Family they joined: {name}'`
- `ru.ts`: `openOrigin: 'Родовое древо: {name}'`, `openJoined: 'Перешёл(ла) в семью: {name}'`
- `be.ts`: `openOrigin: 'Радавое дрэва: {name}'`, `openJoined: "Перайшоў(ла) у сям'ю: {name}"`

- [ ] **Step 4: Render the buttons**

In `PersonHeader.vue`'s `<script setup>`, reuse its existing `t`, `router` and locale access, adding whichever of them is missing:

```ts
import { useFamiliesStore } from '../stores/familiesStore';
import { familyLocation } from '../router/familyRoutes';
import { localize } from '../i18n/localize';
import type { FamilyLinkRef } from '../types/family';

const families = useFamiliesStore();

/** Only links whose family is registered: a button that cannot resolve is worse than none. */
const familyLinks = computed(() => (props.detail.familyLinks ?? []).filter(link => families.isKnown(link.family)));

function familyLinkLabel(link: FamilyLinkRef): string {
  const family = families.familyById(link.family);
  const name = (family && localize(family.name, localeStore.currentLocale)) || link.family;
  return link.relation === 'origin' ? t('family.openOrigin', { name }) : t('family.openJoined', { name });
}

/** The counterpart's bare id is a valid slug (extractPersonId matches p-<digits>$); TreeView swaps in
 *  the friendly slug once that family's graph has loaded. */
function openFamilyLink(link: FamilyLinkRef): void {
  const familyId = families.routeFamily(link.family);
  void router.push(link.personId
    ? familyLocation('person', familyId, { slug: link.personId })
    : familyLocation('tree', familyId));
}
```

`localeStore` is `useLocaleStore()`, and its field is `currentLocale` (`localeStore.ts:7`). The spec sets it through `useLocaleStore().setLocale('en')`.

In the template, after the existing "Open in members" button inside `header__vocrow`:

```html
        <button
          v-for="link in familyLinks"
          :key="`${link.family}-${link.relation}`"
          type="button"
          class="header__members"
          data-test="open-family-link"
          @click="openFamilyLink(link)"
        >{{ familyLinkLabel(link) }}</button>
```

The `header__members` class keeps the existing button styling, which is already theme-tokenised.

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npm --prefix src/frontend test -- run src/components/PersonHeader.spec.ts src/i18n`
Expected: PASS. `messages.spec.ts` checks locale key parity; all three locales gain the same keys.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "Offer a switch to a member's other family tree"
```

---

### Task 16: Reciprocal dev links, end-to-end check, and PR 4

**Files:**
- Modify: `src/backend/FamilyTree.Api/Data/family.json` (one `familyLinks` entry)
- Modify: `src/backend/FamilyTree.Api/Data/kowalski.json` (one `familyLinks` entry; the file is created in PR 2)
- Docs: `docs/reference/`, `README.md`, `CLAUDE.md`

- [ ] **Step 1: Add the links**

In `Data/family.json`, choose a person with `"marriedIntoFamily": true` and add:

```json
      "familyLinks": [ { "family": "kowalski", "personId": "p-0003", "relation": "origin" } ]
```

In `Data/kowalski.json`, on `p-0003`, add the reciprocal link, using the chosen default-family person's id:

```json
      "familyLinks": [ { "family": "perovsky", "personId": "<chosen p- id>", "relation": "joined" } ]
```

With no registry configured, the default-family link is dropped: the snapshot logs a Warning on the first build and Debug on later rebuilds.

- [ ] **Step 2: Run the gates**

```bash
dotnet test
npm --prefix src/frontend run build
npm --prefix src/frontend test
```

Expected: all PASS.

- [ ] **Step 3: Verify end to end**

Start a pair on non-default ports with the dev registry enabled. Another session usually owns 5037/5173.

```bash
FamilyData__Registry=Data/families.json node scripts/dev.mjs --instance 4
```

Use the Browser pane to confirm each of these:

1. The married-in person's card on `/` shows "Kowalski family tree".
2. Clicking it lands on `/f/kowalski/person/p-0003`, which then becomes the friendly slug.
3. The Kowalski tree renders.
4. `p-0003`'s card links back to `/person/<id>` (unprefixed).
5. Browser Back returns to the previous tree.
6. Clicking another medallion inside the Kowalski tree stays under `/f/kowalski`.
7. Both Film and Classic themes look right.
8. There are no console errors.

Capture screenshots of the member card with the button and of the Kowalski tree.

- [ ] **Step 4: Update the docs**

Run the `update-docs-for-pr` skill: document the member-card buttons in `docs/reference/`. In `README.md` and `CLAUDE.md`, update the overview to describe multiple family trees, the switcher, and following a member across trees.

- [ ] **Step 5: Commit, push, open the PR, stop**

```bash
git add -A
git commit -m "Link the dev seeds across families and document member links"
git push -u origin claude/multi-family-4-links
gh pr create --base main --title "Follow a member to their other family tree" --body-file <body>
```

Attach the screenshots and the gate results. End the body with the Claude Code attribution line. **Stop.**
## Re-review fixes (rev. 3, 2026-09-11)

The second review confirmed all ten original defects fixed. Its new findings are now in place:

- **Detail never loaded after a family switch:** Task 13. The generation guard skips only navigation; `selection.open` always runs. `ensureFamily` moved from an App watcher to `router.afterEach` (`installFamilySync`), so the reset no longer depends on component watcher order.
- **Task 13 test fails even when the implementation is correct:** the test router now installs `installFamilySync`, and the test asserts `fetchPerson('kowalski', id)` and the selected id.
- **Three existing tests broken by PR 1:** Task 6, Step 4 updates `TestHostIsolationTests` to use the keyed raw store, and replaces the `InfrastructureSelectionTests` loader tests with `FamilyDataLoaderFactoryTests`.
- **Non-blocking fixes:**
  - `currentLocale`
  - `PersonMediaOverride(null, [])`
  - `StorageClient` registered lazily and unconditionally
  - reset after a failed load
  - no bare-id slug flicker
  - the bad-id warning is logged once
  - fixture surname "Kowalczyk"
  - accurate promote-test wording
  - route helpers typed to accept an `afterEach` `to`

## Self-review (rev. 2)

Spec coverage, by spec section:
- Registry format, source resolution, GCS registry, fail-fast, fallback: Task 1.
- Storage keys (`__` override separator, upload prefix) and the seed rule: Task 2.
- `familyLinks` model and lowercase API relation: Task 3.
- Override store scoped to a family, via a wrapper (interface unchanged): Task 4.
- Per-family providers, isolation, seed media expansion, dropped links, id-shape warning: Task 5.
- Scoped family context, 404 for an unknown family, DI rewiring, startup warm-up, health source: Task 6.
- `/api/families`, family routes, aliases, upload cap: Task 7.
- Family-scoped upload keys, `degradedFamilies` in `/health`: Task 8.
- Dev registry and API docs: Task 9.
- SPA registry store: Task 10.
- Family-aware API clients, including every edit client, and SPA seed detection: Task 11.
- `/f/:familyId` routes, first-visit redirect, the ten navigations: Task 12.
- Single load path, stale-response guards, selection/panel reset, same-id cross-family jumps, unknown-family link: Task 13.
- Switcher: Task 14.
- Member-card buttons and slug canonicalisation (reuses TreeView's existing watcher): Task 15.
- Reciprocal dev links, end-to-end check, overview docs: Task 16.

Review findings addressed (numbers match the 2026-09-11 review):
1. Startup crash → Task 6, Step 5.
2. Middleware wiring → Task 6, Step 3.
3. `/health` gap → Task 6, Step 4.
4. Firestore keys → Task 2.
5. Seed recognition → Tasks 2 and 11.
6. Upload cap → Task 7.
7. GCS registry and relative sources → Task 1.
8. Id format → Global Constraints, fixtures, Task 5.
9. Navigation → Task 12.
10. Loading → Task 13.

Also fixed:
- Mapster test uses `BuildConfig()`.
- Correct helper and factory names (`FamilyApiFactory`, `mountWith`).
- Top-level router in the switcher spec, with no `vi.mock` in `beforeEach`.
- `familyLinks` is optional in the TS types.
- The active family is derived from the route.
- Default-family links use the unprefixed routes.

Names are consistent across tasks:
- `StorageKeys.{OverrideKey, UploadPrefix, ExpandSeedMedia, IsUploadKey}`
- `FamilySnapshotRegistry.{For, HealthFor, DegradedFamilies}`
- `familyLocation`, `activeFamilyId`, `isView`, `routeFamily`, `ensureFamily`, `clearPersons`, `familyApiRoot`, `isUploadKey`
