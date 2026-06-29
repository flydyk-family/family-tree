# Editor Photo Upload Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let signed-in editors upload a person's portrait and gallery photos from the app; bytes are stored in Cloudflare R2 by the .NET API, re-encoded to WebP with a thumbnail, and photo references persist in the per-person override layer.

**Architecture:** A new `IMediaStore` (R2 via S3 API in deployment, local-folder in dev) writes image bytes; a new `IImageProcessor` (ImageSharp) validates/orients/strips/re-encodes and makes a thumbnail. Photo references live in the existing `IPersonOverrideStore` as a per-person media override, merged into the read snapshot beside biography overrides. New MediaR commands + thin controller endpoints, all behind the existing `CanEdit` policy. The Vue popup gains an editor `PhotoManager` and a read-only gallery viewer.

**Tech Stack:** .NET 10, MediatR, FluentValidation, Mapster, SixLabors.ImageSharp, AWSSDK.S3 (R2), Google.Cloud.Firestore; Vue 3 + TypeScript + Vitest; Cloudflare R2 + Pages Functions.

## Global Constraints

- **C#:** file-scoped namespaces; private fields `_camelCase`; interfaces `I`-prefixed; async methods `Async` suffix with `CancellationToken` last; constructor injection into `readonly` fields (services first, `ILogger<T>` last); nullable enabled, prefer `is null`/`is not null`, avoid `!`; always brace control statements; `var` when type is obvious; K&R braces; `using` directives not fully-qualified names.
- **Logging:** `ILogger<T>` only, structured templates with named placeholders, never string interpolation. **Never log PII or secrets** — no emails, names, tokens, file contents. Log non-identifying outcomes (person id, `canEdit`, status). Log every `catch`.
- **Tests:** xUnit + Moq + AwesomeAssertions. Unit test naming `<Method>_When<Conditions>_Should<ExpectedResult>`, PascalCase segments, ≤100 chars. Frontend: Vitest.
- **Doc comments:** standard XML doc (C#) / TSDoc (frontend); concise, no rambling rationale inline.
- **Auth:** all write endpoints `[Authorize(Policy = "CanEdit")]`; editor email from `User.FindFirstValue(ClaimTypes.Email) ?? ""`.
- **Central packages:** all NuGet versions go in `Directory.Packages.props` (no inline `Version=` in csproj).
- **Media keys are immutable** (content-hashed) → long-cache holds. Uploaded objects live under the `uploads/` prefix.
- **Git:** branch off `main`; never self-merge; squash-merge on approval. Docs land in the same PR.

---

## File Structure

**Backend — Domain (`src/backend/FamilyTree.Domain`)**
- Create `Photo.cs` — `record Photo(string Id, string Full, string Thumb)` (Full/Thumb are R2 keys).
- Create `PersonMediaOverride.cs` — `record PersonMediaOverride(Photo? Portrait, IReadOnlyList<Photo> Gallery)`.
- Modify `Person.cs` — add `string? PortraitThumb`; change `Gallery` to `IReadOnlyList<Photo>`.
- Modify `IPersonOverrideStore.cs` — add media append/get/get-map methods.
- Create `IMediaStore.cs` — `PutAsync` / `DeleteAsync`.
- Create `IImageProcessor.cs` + `ProcessedImage.cs` — image processing contract.

**Backend — Infrastructure (`src/backend/FamilyTree.Infrastructure`)**
- Modify `InMemoryPersonOverrideStore.cs` — media revisions.
- Modify `FirestorePersonOverrideStore.cs` — media collection.
- Modify `FamilySnapshotProvider.cs` — merge media overrides.
- Create `MediaKeyGenerator.cs` — content-hash → object keys.
- Create `ImageSharpImageProcessor.cs` — ImageSharp impl.
- Create `LocalFileMediaStore.cs` — dev/test media store.
- Create `R2MediaStore.cs` — S3-API media store (`[ExcludeFromCodeCoverage]`).
- Create `R2Options.cs` — R2 config.
- Modify `FirestoreOptions.cs` — add `MediaOverridesCollection`.
- Modify `InfrastructureServiceCollectionExtensions.cs` — register media store/processor/options.

**Backend — Application (`src/backend/FamilyTree.Application`)**
- Create `Dtos/PhotoDto.cs`.
- Modify `Dtos/PersonDto.cs` — add `PortraitThumb`; change `Gallery` to `IReadOnlyList<PhotoDto>`.
- Create `People/AddPersonPhotoCommand.cs` + `Handler` + `Validator`.
- Create `People/DeletePersonPhotoCommand.cs` + `Handler`.
- Create `People/PromotePersonPhotoCommand.cs` + `Handler`.
- Create `People/PhotoRole.cs` — `enum PhotoRole { Portrait, Gallery }`.

**Backend — Api (`src/backend/FamilyTree.Api`)**
- Modify `Controllers/PeopleController.cs` — upload/delete/promote endpoints.
- Modify `Configuration/AppSettings.cs` — add `R2` section + `RequestLimits.MaxPhotoUploadBytes`.
- Modify `Program.cs` — bind R2 options into `AddInfrastructure`.

**Frontend (`src/frontend/src`)**
- Modify `media/mediaUrl.ts` — add `resolveMediaUrl`.
- Modify `types/family.ts` — `Photo` type; `PersonDetail.portraitThumb`, `gallery: Photo[]`.
- Create `api/photosApi.ts` — upload/delete/promote.
- Create `components/PhotoManager.vue` — editor UI.
- Create `components/GalleryViewer.vue` — read-only gallery grid.
- Modify `components/PersonHeader.vue` + `PersonMedallion.vue` — use `resolveMediaUrl` + thumb.
- Modify the popup component that hosts `BiographyEditor` — mount `PhotoManager` + `GalleryViewer`.

**Tests** — co-located `*.spec.ts` (frontend) and `tests/unit/FamilyTree.UnitTests`, `tests/integration/FamilyTree.IntegrationTests` (backend).

---

## Task 1: Domain photo types + Person model change

**Files:**
- Create: `src/backend/FamilyTree.Domain/Photo.cs`
- Create: `src/backend/FamilyTree.Domain/PersonMediaOverride.cs`
- Modify: `src/backend/FamilyTree.Domain/Person.cs:15-17`
- Test: `tests/unit/FamilyTree.UnitTests/Domain/PhotoTests.cs`

**Interfaces:**
- Produces: `Photo(string Id, string Full, string Thumb)`; `PersonMediaOverride(Photo? Portrait, IReadOnlyList<Photo> Gallery)`; `Person.PortraitThumb` (`string?`); `Person.Gallery` now `IReadOnlyList<Photo>`.

- [ ] **Step 1: Write the failing test**

```csharp
// tests/unit/FamilyTree.UnitTests/Domain/PhotoTests.cs
using FamilyTree.Domain;

namespace FamilyTree.UnitTests.Domain;

public sealed class PhotoTests
{
    [Fact]
    public void PersonMediaOverride_WhenConstructed_ShouldExposePortraitAndGallery()
    {
        var portrait = new Photo("hash1", "uploads/p-0001/hash1.webp", "uploads/p-0001/hash1.thumb.webp");
        var gallery = new[] { new Photo("hash2", "uploads/p-0001/hash2.webp", "uploads/p-0001/hash2.thumb.webp") };

        var media = new PersonMediaOverride(portrait, gallery);

        media.Portrait.Should().Be(portrait);
        media.Gallery.Should().ContainSingle().Which.Id.Should().Be("hash2");
    }
}
```

- [ ] **Step 2: Run test — expect FAIL (types missing)**

Run: `dotnet test tests/unit/FamilyTree.UnitTests --filter PhotoTests`
Expected: build error — `Photo`/`PersonMediaOverride` not found.

- [ ] **Step 3: Create the types and update Person**

```csharp
// src/backend/FamilyTree.Domain/Photo.cs
namespace FamilyTree.Domain;

/// <summary>An uploaded image and its thumbnail, identified by a content hash.
/// <see cref="Full"/> and <see cref="Thumb"/> are R2 object keys (e.g. "uploads/p-0001/ab12.webp").</summary>
public sealed record Photo(string Id, string Full, string Thumb);
```

```csharp
// src/backend/FamilyTree.Domain/PersonMediaOverride.cs
namespace FamilyTree.Domain;

/// <summary>An editor's media override for one person: the portrait (if set) and the gallery photos.</summary>
public sealed record PersonMediaOverride(Photo? Portrait, IReadOnlyList<Photo> Gallery);
```

In `Person.cs`, replace lines 15-17:

```csharp
    public string? Portrait { get; init; }
    public string? PortraitThumb { get; init; }
    public string? PortraitVideo { get; init; }
    public IReadOnlyList<Photo> Gallery { get; init; } = [];
```

- [ ] **Step 4: Build the solution; fix any callers that used `Gallery` as `string[]`**

Run: `dotnet build`
Expected: it fails only where `Gallery` was consumed as strings. Grep first: `grep -rn "\.Gallery" src/backend tests` and update each (the seed has empty galleries, so this is type-only). The `PersonDto.Gallery` change is handled in Task 7 — if the build breaks there now, leave PersonDto for Task 7 and `dotnet build src/backend/FamilyTree.Domain` to confirm the Domain compiles in isolation.

Run: `dotnet build src/backend/FamilyTree.Domain && dotnet test tests/unit/FamilyTree.UnitTests --filter PhotoTests`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/backend/FamilyTree.Domain tests/unit/FamilyTree.UnitTests/Domain/PhotoTests.cs
git commit -m "feat(domain): add Photo/PersonMediaOverride and Person photo fields"
```

---

## Task 2: Extend `IPersonOverrideStore` + in-memory media revisions

**Files:**
- Modify: `src/backend/FamilyTree.Domain/IPersonOverrideStore.cs`
- Modify: `src/backend/FamilyTree.Infrastructure/InMemoryPersonOverrideStore.cs`
- Test: `tests/unit/FamilyTree.UnitTests/Infrastructure/InMemoryPersonOverrideStoreMediaTests.cs`

**Interfaces:**
- Consumes: `Photo`, `PersonMediaOverride` (Task 1).
- Produces on `IPersonOverrideStore`:
  - `Task AppendMediaAsync(string personId, PersonMediaOverride media, string editorEmail, CancellationToken cancellationToken)`
  - `Task<PersonMediaOverride?> GetLatestMediaAsync(string personId, CancellationToken cancellationToken)`
  - `Task<IReadOnlyDictionary<string, PersonMediaOverride>> GetLatestMediaMapAsync(CancellationToken cancellationToken)`

- [ ] **Step 1: Write the failing test**

```csharp
// tests/unit/FamilyTree.UnitTests/Infrastructure/InMemoryPersonOverrideStoreMediaTests.cs
using FamilyTree.Domain;
using FamilyTree.Infrastructure;

namespace FamilyTree.UnitTests.Infrastructure;

public sealed class InMemoryPersonOverrideStoreMediaTests
{
    private static Photo Make(string id) => new(id, $"uploads/p-0001/{id}.webp", $"uploads/p-0001/{id}.thumb.webp");

    [Fact]
    public async Task GetLatestMediaAsync_WhenAppended_ShouldReturnLatestOverride()
    {
        var store = new InMemoryPersonOverrideStore();
        await store.AppendMediaAsync("p-0001", new PersonMediaOverride(Make("a"), [Make("b")]), "e@x.com", default);
        await store.AppendMediaAsync("p-0001", new PersonMediaOverride(Make("a"), [Make("b"), Make("c")]), "e@x.com", default);

        var latest = await store.GetLatestMediaAsync("p-0001", default);

        latest!.Gallery.Should().HaveCount(2);
        latest.Portrait!.Id.Should().Be("a");
    }

    [Fact]
    public async Task GetLatestMediaAsync_WhenNoOverride_ShouldReturnNull()
    {
        var store = new InMemoryPersonOverrideStore();
        (await store.GetLatestMediaAsync("p-0001", default)).Should().BeNull();
    }

    [Fact]
    public async Task GetLatestMediaMapAsync_WhenMultiplePeople_ShouldReturnEachLatest()
    {
        var store = new InMemoryPersonOverrideStore();
        await store.AppendMediaAsync("p-0001", new PersonMediaOverride(Make("a"), []), "e@x.com", default);
        await store.AppendMediaAsync("p-0002", new PersonMediaOverride(null, [Make("b")]), "e@x.com", default);

        var map = await store.GetLatestMediaMapAsync(default);

        map.Should().HaveCount(2);
        map["p-0002"].Portrait.Should().BeNull();
    }
}
```

- [ ] **Step 2: Run test — expect FAIL (methods missing)**

Run: `dotnet test tests/unit/FamilyTree.UnitTests --filter InMemoryPersonOverrideStoreMediaTests`
Expected: build error — methods not on interface.

- [ ] **Step 3: Add interface methods**

Append to `IPersonOverrideStore` (inside the interface body):

```csharp
    Task AppendMediaAsync(string personId, PersonMediaOverride media, string editorEmail, CancellationToken cancellationToken);
    Task<PersonMediaOverride?> GetLatestMediaAsync(string personId, CancellationToken cancellationToken);
    Task<IReadOnlyDictionary<string, PersonMediaOverride>> GetLatestMediaMapAsync(CancellationToken cancellationToken);
```

- [ ] **Step 4: Implement in `InMemoryPersonOverrideStore`**

Add a parallel media dictionary + revision record and the three methods (mirror the biography pattern):

```csharp
    private sealed record MediaRevision(PersonMediaOverride Media, string EditorEmail, DateTimeOffset EditedAt);

    private readonly ConcurrentDictionary<string, List<MediaRevision>> _media = new(StringComparer.Ordinal);

    public Task AppendMediaAsync(string personId, PersonMediaOverride media, string editorEmail, CancellationToken cancellationToken)
    {
        var revision = new MediaRevision(media, editorEmail, DateTimeOffset.UtcNow);
        var revisions = _media.GetOrAdd(personId, _ => new List<MediaRevision>());
        lock (revisions)
        {
            revisions.Add(revision);
        }

        return Task.CompletedTask;
    }

    public Task<PersonMediaOverride?> GetLatestMediaAsync(string personId, CancellationToken cancellationToken)
    {
        if (!_media.TryGetValue(personId, out var revisions))
        {
            return Task.FromResult<PersonMediaOverride?>(null);
        }

        lock (revisions)
        {
            return Task.FromResult<PersonMediaOverride?>(revisions.Count > 0 ? revisions[^1].Media : null);
        }
    }

    public Task<IReadOnlyDictionary<string, PersonMediaOverride>> GetLatestMediaMapAsync(CancellationToken cancellationToken)
    {
        var latest = new Dictionary<string, PersonMediaOverride>(StringComparer.Ordinal);
        foreach (var entry in _media)
        {
            lock (entry.Value)
            {
                if (entry.Value.Count > 0)
                {
                    latest[entry.Key] = entry.Value[^1].Media;
                }
            }
        }

        return Task.FromResult<IReadOnlyDictionary<string, PersonMediaOverride>>(latest);
    }
```

- [ ] **Step 5: Run tests — expect PASS**

Run: `dotnet test tests/unit/FamilyTree.UnitTests --filter InMemoryPersonOverrideStoreMediaTests`
Expected: PASS. (`FirestorePersonOverrideStore` will not compile until Task 3 — build the Infrastructure project's in-memory tests via the filter; if the whole solution build is required, do Task 3 immediately after.)

- [ ] **Step 6: Commit**

```bash
git add src/backend/FamilyTree.Domain/IPersonOverrideStore.cs src/backend/FamilyTree.Infrastructure/InMemoryPersonOverrideStore.cs tests/unit/FamilyTree.UnitTests/Infrastructure/InMemoryPersonOverrideStoreMediaTests.cs
git commit -m "feat(infra): in-memory media overrides"
```

---

## Task 3: Firestore media overrides

**Files:**
- Modify: `src/backend/FamilyTree.Infrastructure/FirestoreOptions.cs`
- Modify: `src/backend/FamilyTree.Infrastructure/FirestorePersonOverrideStore.cs`

**Interfaces:**
- Consumes: media methods from Task 2; `PersonMediaOverride`, `Photo`.
- This class is `[ExcludeFromCodeCoverage]` (thin SDK wrapper, emulator-verified) — no unit test; correctness is by code review + the integration suite running against the in-memory store.

- [ ] **Step 1: Add the media collection option**

In `FirestoreOptions.cs` add:

```csharp
    /// <summary>Collection holding per-person media overrides (separate from biography overrides).</summary>
    public string MediaOverridesCollection { get; set; } = "mediaOverrides";
```

- [ ] **Step 2: Add a media `CollectionReference` and implement the three methods**

In the constructor, after `_overrides = ...`:

```csharp
        _mediaOverrides = db.Collection(options.Value.MediaOverridesCollection);
```

Add the field `private readonly CollectionReference _mediaOverrides;`. Then implement (same parent-latest + append-only `versions` pattern as biography; portrait stored as nullable nested fields, gallery as an array of maps):

```csharp
    public async Task AppendMediaAsync(string personId, PersonMediaOverride media, string editorEmail, CancellationToken cancellationToken)
    {
        var snapshot = new Dictionary<string, object?>
        {
            ["portrait"] = media.Portrait is null ? null : PhotoMap(media.Portrait),
            ["gallery"] = media.Gallery.Select(PhotoMap).ToList(),
            ["editorEmail"] = editorEmail,
            ["editedAt"] = FieldValue.ServerTimestamp
        };

        var parent = _mediaOverrides.Document(personId);
        var batch = _db.StartBatch();
        batch.Set(parent, snapshot);
        batch.Create(parent.Collection(VersionsSubcollection).Document(), snapshot);
        await OperationDeadline.RunAsync(OperationTimeout, cancellationToken,
            ct => batch.CommitAsync(ct), "Firestore media write");
    }

    public async Task<PersonMediaOverride?> GetLatestMediaAsync(string personId, CancellationToken cancellationToken)
    {
        var snapshot = await OperationDeadline.RunAsync(OperationTimeout, cancellationToken,
            ct => _mediaOverrides.Document(personId).GetSnapshotAsync(ct), "Firestore media read");
        return snapshot.Exists ? MediaFrom(snapshot) : null;
    }

    public async Task<IReadOnlyDictionary<string, PersonMediaOverride>> GetLatestMediaMapAsync(CancellationToken cancellationToken)
    {
        var result = new Dictionary<string, PersonMediaOverride>(StringComparer.Ordinal);
        var snapshot = await OperationDeadline.RunAsync(OperationTimeout, cancellationToken,
            ct => _mediaOverrides.GetSnapshotAsync(ct), "Firestore media overrides read");
        foreach (var doc in snapshot.Documents)
        {
            var media = MediaFrom(doc);
            if (media is not null)
            {
                result[doc.Id] = media;
            }
        }

        return result;
    }

    private static Dictionary<string, object> PhotoMap(Photo p) => new()
    {
        ["id"] = p.Id, ["full"] = p.Full, ["thumb"] = p.Thumb
    };

    private static PersonMediaOverride? MediaFrom(DocumentSnapshot doc)
    {
        if (!doc.ContainsField("portrait") && !doc.ContainsField("gallery"))
        {
            return null;
        }

        Photo? portrait = null;
        if (doc.TryGetValue<Dictionary<string, object>>("portrait", out var pm) && pm is not null)
        {
            portrait = ReadPhoto(pm);
        }

        var gallery = new List<Photo>();
        if (doc.TryGetValue<List<object>>("gallery", out var arr) && arr is not null)
        {
            foreach (var item in arr.OfType<Dictionary<string, object>>())
            {
                gallery.Add(ReadPhoto(item));
            }
        }

        return new PersonMediaOverride(portrait, gallery);
    }

    private static Photo ReadPhoto(Dictionary<string, object> m) =>
        new((string)m["id"], (string)m["full"], (string)m["thumb"]);
```

- [ ] **Step 3: Build the whole backend**

Run: `dotnet build`
Expected: builds (PersonDto/Mapster may still break — if so, that is Task 7; otherwise green). Confirm the Infrastructure project at least compiles: `dotnet build src/backend/FamilyTree.Infrastructure`.

- [ ] **Step 4: Commit**

```bash
git add src/backend/FamilyTree.Infrastructure/FirestoreOptions.cs src/backend/FamilyTree.Infrastructure/FirestorePersonOverrideStore.cs
git commit -m "feat(infra): firestore media overrides"
```

---

## Task 4: Merge media overrides into the snapshot

**Files:**
- Modify: `src/backend/FamilyTree.Infrastructure/FamilySnapshotProvider.cs:76-122`
- Test: `tests/unit/FamilyTree.UnitTests/Infrastructure/FamilySnapshotProviderMediaTests.cs`

**Interfaces:**
- Consumes: `IPersonOverrideStore.GetLatestMediaMapAsync`; `Person.PortraitThumb`, `Person.Gallery`.
- Produces: merged `Person` whose `Portrait`/`PortraitThumb`/`Gallery` reflect the media override when present.

- [ ] **Step 1: Write the failing test**

```csharp
// tests/unit/FamilyTree.UnitTests/Infrastructure/FamilySnapshotProviderMediaTests.cs
using FamilyTree.Domain;
using FamilyTree.Infrastructure;
using Microsoft.Extensions.Logging.Abstractions;
using Microsoft.Extensions.Options;
using Moq;

namespace FamilyTree.UnitTests.Infrastructure;

public sealed class FamilySnapshotProviderMediaTests
{
    private static Person Seed(string id) => new()
    {
        Id = id,
        GivenName = new LocalizedText { En = "A" },
        Surname = new LocalizedText { En = "B" },
        Birth = new LifeEvent(),
        Portrait = "p-0001.jpg"
    };

    [Fact]
    public async Task GetAsync_WhenMediaOverrideExists_ShouldReplacePortraitAndGallery()
    {
        var loader = new Mock<IFamilyDataLoader>();
        loader.Setup(l => l.LoadAsync(It.IsAny<CancellationToken>()))
            .ReturnsAsync(new FamilyGraph([Seed("p-0001")], []));

        var overrides = new Mock<IPersonOverrideStore>();
        overrides.Setup(o => o.GetLatestBiographiesAsync(It.IsAny<CancellationToken>()))
            .ReturnsAsync(new Dictionary<string, LocalizedText>());
        var portrait = new Photo("h1", "uploads/p-0001/h1.webp", "uploads/p-0001/h1.thumb.webp");
        var gallery = new[] { new Photo("h2", "uploads/p-0001/h2.webp", "uploads/p-0001/h2.thumb.webp") };
        overrides.Setup(o => o.GetLatestMediaMapAsync(It.IsAny<CancellationToken>()))
            .ReturnsAsync(new Dictionary<string, PersonMediaOverride> { ["p-0001"] = new(portrait, gallery) });

        var provider = new FamilySnapshotProvider(loader.Object, overrides.Object,
            Options.Create(new FamilyDataOptions { SnapshotTtlMinutes = 10 }),
            TimeProvider.System, NullLogger<FamilySnapshotProvider>.Instance);

        var graph = await provider.GetAsync(default);

        var person = graph.People.Single();
        person.Portrait.Should().Be("uploads/p-0001/h1.webp");
        person.PortraitThumb.Should().Be("uploads/p-0001/h1.thumb.webp");
        person.Gallery.Should().ContainSingle().Which.Id.Should().Be("h2");
    }

    [Fact]
    public async Task GetAsync_WhenMediaOverrideHasNoPortrait_ShouldKeepSeedPortrait()
    {
        var loader = new Mock<IFamilyDataLoader>();
        loader.Setup(l => l.LoadAsync(It.IsAny<CancellationToken>()))
            .ReturnsAsync(new FamilyGraph([Seed("p-0001")], []));
        var overrides = new Mock<IPersonOverrideStore>();
        overrides.Setup(o => o.GetLatestBiographiesAsync(It.IsAny<CancellationToken>()))
            .ReturnsAsync(new Dictionary<string, LocalizedText>());
        var gallery = new[] { new Photo("h2", "uploads/p-0001/h2.webp", "uploads/p-0001/h2.thumb.webp") };
        overrides.Setup(o => o.GetLatestMediaMapAsync(It.IsAny<CancellationToken>()))
            .ReturnsAsync(new Dictionary<string, PersonMediaOverride> { ["p-0001"] = new(null, gallery) });

        var provider = new FamilySnapshotProvider(loader.Object, overrides.Object,
            Options.Create(new FamilyDataOptions { SnapshotTtlMinutes = 10 }),
            TimeProvider.System, NullLogger<FamilySnapshotProvider>.Instance);

        var person = (await provider.GetAsync(default)).People.Single();
        person.Portrait.Should().Be("p-0001.jpg");
        person.PortraitThumb.Should().BeNull();
        person.Gallery.Should().ContainSingle();
    }
}
```

> Note: confirm the `FamilyGraph` constructor shape (`new FamilyGraph(people, unions)`) and `LifeEvent`/`LocalizedText` initializers against the current Domain types when writing the test; adjust the minimal `Seed` accordingly.

- [ ] **Step 2: Run — expect FAIL**

Run: `dotnet test tests/unit/FamilyTree.UnitTests --filter FamilySnapshotProviderMediaTests`
Expected: FAIL (media map not consulted; portrait unchanged).

- [ ] **Step 3: Implement the merge**

In `RebuildAsync`, after `latest = await _overrides.GetLatestBiographiesAsync(...)` add the media pull inside the same `try`:

```csharp
                latest = await _overrides.GetLatestBiographiesAsync(cancellationToken);
                media = await _overrides.GetLatestMediaMapAsync(cancellationToken);
```

Declare `IReadOnlyDictionary<string, PersonMediaOverride> media;` beside `latest`. Replace the people projection (lines ~114-120) with a single pass applying both overrides:

```csharp
            var people = (latest.Count == 0 && media.Count == 0)
                ? seed.People
                : seed.People.Select(person =>
                {
                    var updated = person;
                    if (latest.TryGetValue(person.Id, out var biography))
                    {
                        updated = updated with { Biography = biography };
                    }
                    if (media.TryGetValue(person.Id, out var m))
                    {
                        updated = updated with
                        {
                            Portrait = m.Portrait?.Full ?? updated.Portrait,
                            PortraitThumb = m.Portrait?.Thumb,
                            Gallery = m.Gallery
                        };
                    }
                    return updated;
                }).ToList();
```

Update the debug log to include media count: `"... {OverrideCount} bio, {MediaCount} media overrides"`, passing `latest.Count, media.Count`.

- [ ] **Step 4: Run — expect PASS**

Run: `dotnet test tests/unit/FamilyTree.UnitTests --filter FamilySnapshotProviderMediaTests`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/backend/FamilyTree.Infrastructure/FamilySnapshotProvider.cs tests/unit/FamilyTree.UnitTests/Infrastructure/FamilySnapshotProviderMediaTests.cs
git commit -m "feat(infra): merge media overrides into snapshot"
```

---

## Task 5: Media key generator (content hash → object keys)

**Files:**
- Create: `src/backend/FamilyTree.Infrastructure/MediaKeyGenerator.cs`
- Test: `tests/unit/FamilyTree.UnitTests/Infrastructure/MediaKeyGeneratorTests.cs`

**Interfaces:**
- Produces: `static class MediaKeyGenerator` with
  `static (string Id, string FullKey, string ThumbKey) ForPerson(string personId, ReadOnlySpan<byte> fullBytes)`.
  `Id` = first 20 hex chars of SHA-256 of `fullBytes`; keys `uploads/{personId}/{id}.webp` and `uploads/{personId}/{id}.thumb.webp`.

- [ ] **Step 1: Write the failing test**

```csharp
// tests/unit/FamilyTree.UnitTests/Infrastructure/MediaKeyGeneratorTests.cs
using FamilyTree.Infrastructure;

namespace FamilyTree.UnitTests.Infrastructure;

public sealed class MediaKeyGeneratorTests
{
    [Fact]
    public void ForPerson_WhenSameBytes_ShouldProduceStableKeys()
    {
        var bytes = new byte[] { 1, 2, 3, 4 };
        var a = MediaKeyGenerator.ForPerson("p-0001", bytes);
        var b = MediaKeyGenerator.ForPerson("p-0001", bytes);

        a.Should().Be(b);
        a.FullKey.Should().Be($"uploads/p-0001/{a.Id}.webp");
        a.ThumbKey.Should().Be($"uploads/p-0001/{a.Id}.thumb.webp");
        a.Id.Should().HaveLength(20);
    }

    [Fact]
    public void ForPerson_WhenDifferentBytes_ShouldProduceDifferentIds()
    {
        var a = MediaKeyGenerator.ForPerson("p-0001", new byte[] { 1 });
        var b = MediaKeyGenerator.ForPerson("p-0001", new byte[] { 2 });
        a.Id.Should().NotBe(b.Id);
    }
}
```

- [ ] **Step 2: Run — expect FAIL**

Run: `dotnet test tests/unit/FamilyTree.UnitTests --filter MediaKeyGeneratorTests`
Expected: FAIL (class missing).

- [ ] **Step 3: Implement**

```csharp
// src/backend/FamilyTree.Infrastructure/MediaKeyGenerator.cs
using System.Security.Cryptography;

namespace FamilyTree.Infrastructure;

/// <summary>Derives immutable, content-addressed R2 keys for an uploaded photo so re-uploading
/// identical bytes is idempotent and the long-cache convention holds.</summary>
public static class MediaKeyGenerator
{
    public static (string Id, string FullKey, string ThumbKey) ForPerson(string personId, ReadOnlySpan<byte> fullBytes)
    {
        var hash = SHA256.HashData(fullBytes);
        var id = Convert.ToHexStringLower(hash)[..20];
        return (id, $"uploads/{personId}/{id}.webp", $"uploads/{personId}/{id}.thumb.webp");
    }
}
```

- [ ] **Step 4: Run — expect PASS**

Run: `dotnet test tests/unit/FamilyTree.UnitTests --filter MediaKeyGeneratorTests`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/backend/FamilyTree.Infrastructure/MediaKeyGenerator.cs tests/unit/FamilyTree.UnitTests/Infrastructure/MediaKeyGeneratorTests.cs
git commit -m "feat(infra): content-addressed media key generator"
```

---

## Task 6: Image processor (ImageSharp) — validate, orient, strip, resize, WebP, thumbnail

**Files:**
- Modify: `Directory.Packages.props`
- Modify: `src/backend/FamilyTree.Infrastructure/FamilyTree.Infrastructure.csproj` (add `PackageReference`)
- Create: `src/backend/FamilyTree.Domain/IImageProcessor.cs`
- Create: `src/backend/FamilyTree.Domain/ProcessedImage.cs`
- Create: `src/backend/FamilyTree.Infrastructure/ImageSharpImageProcessor.cs`
- Test: `tests/unit/FamilyTree.UnitTests/Infrastructure/ImageSharpImageProcessorTests.cs`

**Interfaces:**
- Produces: `interface IImageProcessor { ProcessedImage Process(ReadOnlyMemory<byte> input); }`;
  `record ProcessedImage(byte[] Full, byte[] Thumb, int Width, int Height)` (content type is always `image/webp`).
- Throws `InvalidImageException` (new, in Domain) for undecodable input or unsupported format.

- [ ] **Step 1: Add the package**

In `Directory.Packages.props` under an `<!-- Infrastructure -->` comment:

```xml
    <PackageVersion Include="SixLabors.ImageSharp" Version="3.1.5" />
```

In `FamilyTree.Infrastructure.csproj` add `<PackageReference Include="SixLabors.ImageSharp" />`.

- [ ] **Step 2: Write the failing test (generate a real PNG fixture in-test)**

```csharp
// tests/unit/FamilyTree.UnitTests/Infrastructure/ImageSharpImageProcessorTests.cs
using FamilyTree.Domain;
using FamilyTree.Infrastructure;
using SixLabors.ImageSharp;
using SixLabors.ImageSharp.PixelFormats;

namespace FamilyTree.UnitTests.Infrastructure;

public sealed class ImageSharpImageProcessorTests
{
    private static byte[] Png(int w, int h)
    {
        using var image = new Image<Rgba32>(w, h);
        using var ms = new MemoryStream();
        image.SaveAsPng(ms);
        return ms.ToArray();
    }

    [Fact]
    public void Process_WhenLargePng_ShouldCapDimensionsAndEmitWebp()
    {
        var processor = new ImageSharpImageProcessor();

        var result = processor.Process(Png(3000, 1500));

        result.Width.Should().BeLessThanOrEqualTo(2000);
        result.Height.Should().BeLessThanOrEqualTo(2000);
        // WebP magic: "RIFF"...."WEBP"
        result.Full.Should().StartWith("RIFF"u8.ToArray());
        result.Thumb.Length.Should().BeLessThan(result.Full.Length);
    }

    [Fact]
    public void Process_WhenNotAnImage_ShouldThrowInvalidImageException()
    {
        var processor = new ImageSharpImageProcessor();
        var act = () => processor.Process(new byte[] { 0, 1, 2, 3, 4, 5 });
        act.Should().Throw<InvalidImageException>();
    }
}
```

- [ ] **Step 3: Run — expect FAIL**

Run: `dotnet test tests/unit/FamilyTree.UnitTests --filter ImageSharpImageProcessorTests`
Expected: FAIL (types missing).

- [ ] **Step 4: Implement contract + impl**

```csharp
// src/backend/FamilyTree.Domain/ProcessedImage.cs
namespace FamilyTree.Domain;

/// <summary>A processed upload: the dimension-capped WebP and its WebP thumbnail.</summary>
public sealed record ProcessedImage(byte[] Full, byte[] Thumb, int Width, int Height);
```

```csharp
// src/backend/FamilyTree.Domain/IImageProcessor.cs
namespace FamilyTree.Domain;

/// <summary>Validates an uploaded image and produces a clean WebP plus a thumbnail.</summary>
public interface IImageProcessor
{
    /// <exception cref="InvalidImageException">Input is not a supported, decodable image.</exception>
    ProcessedImage Process(ReadOnlyMemory<byte> input);
}

/// <summary>Thrown when an upload is not a decodable image in a supported format.</summary>
public sealed class InvalidImageException(string message) : Exception(message);
```

```csharp
// src/backend/FamilyTree.Infrastructure/ImageSharpImageProcessor.cs
using FamilyTree.Domain;
using SixLabors.ImageSharp;
using SixLabors.ImageSharp.Formats.Webp;
using SixLabors.ImageSharp.Processing;

namespace FamilyTree.Infrastructure;

/// <summary>ImageSharp-backed processor: decode, auto-orient, strip metadata, cap the longest
/// side, and re-encode to WebP. Produces a full image (≤2000px) and a thumbnail (≤400px).</summary>
public sealed class ImageSharpImageProcessor : IImageProcessor
{
    private const int MaxFullDimension = 2000;
    private const int MaxThumbDimension = 400;
    private static readonly WebpEncoder Encoder = new() { Quality = 82 };

    public ProcessedImage Process(ReadOnlyMemory<byte> input)
    {
        Image image;
        try
        {
            image = Image.Load(input.Span);
        }
        catch (Exception ex) when (ex is UnknownImageFormatException or InvalidImageContentException)
        {
            throw new InvalidImageException("The uploaded file is not a supported image.");
        }

        using (image)
        {
            image.Mutate(x => x.AutoOrient());
            image.Metadata.ExifProfile = null;
            image.Metadata.IptcProfile = null;
            image.Metadata.XmpProfile = null;

            var full = Encode(image, MaxFullDimension);
            var thumb = Encode(image, MaxThumbDimension);
            return new ProcessedImage(full.Bytes, thumb.Bytes, full.Width, full.Height);
        }
    }

    private static (byte[] Bytes, int Width, int Height) Encode(Image source, int maxDimension)
    {
        using var clone = source.Clone(x => x.Resize(new ResizeOptions
        {
            Mode = ResizeMode.Max,
            Size = new Size(maxDimension, maxDimension)
        }));
        using var ms = new MemoryStream();
        clone.Save(ms, Encoder);
        return (ms.ToArray(), clone.Width, clone.Height);
    }
}
```

- [ ] **Step 5: Run — expect PASS**

Run: `dotnet test tests/unit/FamilyTree.UnitTests --filter ImageSharpImageProcessorTests`
Expected: PASS. (`"RIFF"u8` requires C# 11+/.NET 10 — available here.)

- [ ] **Step 6: Commit**

```bash
git add Directory.Packages.props src/backend/FamilyTree.Infrastructure/FamilyTree.Infrastructure.csproj src/backend/FamilyTree.Domain/IImageProcessor.cs src/backend/FamilyTree.Domain/ProcessedImage.cs src/backend/FamilyTree.Infrastructure/ImageSharpImageProcessor.cs tests/unit/FamilyTree.UnitTests/Infrastructure/ImageSharpImageProcessorTests.cs
git commit -m "feat(infra): ImageSharp image processor (webp + thumbnail, strip EXIF)"
```

---

## Task 7: PhotoDto + PersonDto change + Mapster mapping

**Files:**
- Create: `src/backend/FamilyTree.Application/Dtos/PhotoDto.cs`
- Modify: `src/backend/FamilyTree.Application/Dtos/PersonDto.cs:11,16`
- Test: `tests/unit/FamilyTree.UnitTests/Application/PersonMappingTests.cs` (add cases; create if absent)

**Interfaces:**
- Produces: `record PhotoDto(string Id, string Full, string Thumb)`; `PersonDto.PortraitThumb` (`string?`); `PersonDto.Gallery` now `IReadOnlyList<PhotoDto>`.
- Mapster maps `Photo`→`PhotoDto` and `Person`→`PersonDto` by name (field names match), so no explicit config is needed beyond what already maps `Person`→`PersonDto`.

- [ ] **Step 1: Write the failing test**

```csharp
// tests/unit/FamilyTree.UnitTests/Application/PersonMappingTests.cs (add or extend)
using FamilyTree.Application.Dtos;
using FamilyTree.Domain;
using Mapster;

namespace FamilyTree.UnitTests.Application;

public sealed class PersonMappingTests
{
    [Fact]
    public void Map_WhenPersonHasGalleryAndThumb_ShouldMapPhotoFields()
    {
        var person = new Person
        {
            Id = "p-0001",
            GivenName = new LocalizedText { En = "A" },
            Surname = new LocalizedText { En = "B" },
            Birth = new LifeEvent(),
            Portrait = "uploads/p-0001/h1.webp",
            PortraitThumb = "uploads/p-0001/h1.thumb.webp",
            Gallery = [new Photo("h2", "uploads/p-0001/h2.webp", "uploads/p-0001/h2.thumb.webp")]
        };

        var dto = person.Adapt<PersonDto>();

        dto.PortraitThumb.Should().Be("uploads/p-0001/h1.thumb.webp");
        dto.Gallery.Should().ContainSingle().Which.Should().Be(new PhotoDto("h2", "uploads/p-0001/h2.webp", "uploads/p-0001/h2.thumb.webp"));
    }
}
```

> Confirm whether the project uses a global Mapster `TypeAdapterConfig` (a `MappingConfig`/`IRegister`). If mapping is configured rather than `Adapt` global, route the test through the registered config the same way the existing `Person`→`PersonDto` test does. Match the existing test's setup.

- [ ] **Step 2: Run — expect FAIL**

Run: `dotnet test tests/unit/FamilyTree.UnitTests --filter PersonMappingTests`
Expected: FAIL (PhotoDto missing / PersonDto.Gallery is `string[]`).

- [ ] **Step 3: Implement**

```csharp
// src/backend/FamilyTree.Application/Dtos/PhotoDto.cs
namespace FamilyTree.Application.Dtos;

public sealed record PhotoDto(string Id, string Full, string Thumb);
```

In `PersonDto.cs` change the two members:

```csharp
    string? Portrait,
    string? PortraitThumb,
    string? PortraitVideo,
    IReadOnlyList<PhotoDto> Gallery,
```

- [ ] **Step 4: Build & run — fix fallout**

Run: `dotnet build`
Expected: any other code constructing `PersonDto` positionally now needs the extra `PortraitThumb` arg / `PhotoDto[]` gallery. Fix call sites (search `new PersonDto(`). Then:

Run: `dotnet test tests/unit/FamilyTree.UnitTests --filter PersonMappingTests`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/backend/FamilyTree.Application/Dtos tests/unit/FamilyTree.UnitTests/Application/PersonMappingTests.cs
git commit -m "feat(app): PhotoDto and PersonDto gallery/thumb"
```

---

## Task 8: Media store abstraction — `LocalFileMediaStore` (+ R2 stub) + options

**Files:**
- Create: `src/backend/FamilyTree.Domain/IMediaStore.cs`
- Create: `src/backend/FamilyTree.Infrastructure/LocalFileMediaStore.cs`
- Create: `src/backend/FamilyTree.Infrastructure/R2Options.cs`
- Test: `tests/unit/FamilyTree.UnitTests/Infrastructure/LocalFileMediaStoreTests.cs`

**Interfaces:**
- Produces: `interface IMediaStore { Task PutAsync(string key, ReadOnlyMemory<byte> bytes, string contentType, CancellationToken ct); Task DeleteAsync(string key, CancellationToken ct); }`
- `LocalFileMediaStore(string rootDirectory)` writes/deletes under `rootDirectory/<key>` (key segments map to subfolders). `R2Options { AccountId, Bucket, AccessKeyId, SecretAccessKey }` with `bool IsConfigured`.

- [ ] **Step 1: Write the failing test**

```csharp
// tests/unit/FamilyTree.UnitTests/Infrastructure/LocalFileMediaStoreTests.cs
using FamilyTree.Infrastructure;

namespace FamilyTree.UnitTests.Infrastructure;

public sealed class LocalFileMediaStoreTests : IDisposable
{
    private readonly string _root = Path.Combine(Path.GetTempPath(), "media-test-" + Guid.NewGuid().ToString("N"));

    [Fact]
    public async Task PutAsync_ThenDeleteAsync_ShouldWriteThenRemoveFile()
    {
        var store = new LocalFileMediaStore(_root);
        await store.PutAsync("uploads/p-0001/h1.webp", new byte[] { 1, 2, 3 }, "image/webp", default);

        var path = Path.Combine(_root, "uploads", "p-0001", "h1.webp");
        File.Exists(path).Should().BeTrue();
        (await File.ReadAllBytesAsync(path)).Should().Equal(1, 2, 3);

        await store.DeleteAsync("uploads/p-0001/h1.webp", default);
        File.Exists(path).Should().BeFalse();
    }

    [Fact]
    public async Task DeleteAsync_WhenMissing_ShouldNotThrow()
    {
        var store = new LocalFileMediaStore(_root);
        var act = async () => await store.DeleteAsync("uploads/none.webp", default);
        await act.Should().NotThrowAsync();
    }

    public void Dispose()
    {
        if (Directory.Exists(_root)) Directory.Delete(_root, recursive: true);
    }
}
```

- [ ] **Step 2: Run — expect FAIL**

Run: `dotnet test tests/unit/FamilyTree.UnitTests --filter LocalFileMediaStoreTests`
Expected: FAIL.

- [ ] **Step 3: Implement interface, local store, options**

```csharp
// src/backend/FamilyTree.Domain/IMediaStore.cs
namespace FamilyTree.Domain;

/// <summary>Stores and removes media object bytes by key (e.g. "uploads/p-0001/h1.webp").</summary>
public interface IMediaStore
{
    Task PutAsync(string key, ReadOnlyMemory<byte> bytes, string contentType, CancellationToken cancellationToken);
    Task DeleteAsync(string key, CancellationToken cancellationToken);
}
```

```csharp
// src/backend/FamilyTree.Infrastructure/LocalFileMediaStore.cs
using FamilyTree.Domain;

namespace FamilyTree.Infrastructure;

/// <summary>Dev/test media store: writes objects under a local folder that Vite serves at /media/*.</summary>
public sealed class LocalFileMediaStore : IMediaStore
{
    private readonly string _root;

    public LocalFileMediaStore(string rootDirectory)
    {
        _root = rootDirectory;
    }

    public async Task PutAsync(string key, ReadOnlyMemory<byte> bytes, string contentType, CancellationToken cancellationToken)
    {
        var path = ResolvePath(key);
        Directory.CreateDirectory(Path.GetDirectoryName(path)!);
        await File.WriteAllBytesAsync(path, bytes.ToArray(), cancellationToken);
    }

    public Task DeleteAsync(string key, CancellationToken cancellationToken)
    {
        var path = ResolvePath(key);
        if (File.Exists(path))
        {
            File.Delete(path);
        }

        return Task.CompletedTask;
    }

    private string ResolvePath(string key) =>
        Path.Combine(_root, Path.Combine(key.Split('/')));
}
```

```csharp
// src/backend/FamilyTree.Infrastructure/R2Options.cs
namespace FamilyTree.Infrastructure;

/// <summary>Cloudflare R2 (S3-compatible) credentials for the media store. When unset,
/// the app uses the local-folder media store instead.</summary>
public sealed class R2Options
{
    public string AccountId { get; set; } = "";
    public string Bucket { get; set; } = "";
    public string AccessKeyId { get; set; } = "";
    public string SecretAccessKey { get; set; } = "";
    public string LocalMediaРdirectory { get; set; } = "";

    public bool IsConfigured =>
        !string.IsNullOrWhiteSpace(AccountId) &&
        !string.IsNullOrWhiteSpace(Bucket) &&
        !string.IsNullOrWhiteSpace(AccessKeyId) &&
        !string.IsNullOrWhiteSpace(SecretAccessKey);
}
```

> Fix the typo: name the property `LocalMediaDirectory` (used by dev to point at the repo `media/` folder; defaults to empty → resolved at registration in Task 10).

- [ ] **Step 4: Run — expect PASS**

Run: `dotnet test tests/unit/FamilyTree.UnitTests --filter LocalFileMediaStoreTests`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/backend/FamilyTree.Domain/IMediaStore.cs src/backend/FamilyTree.Infrastructure/LocalFileMediaStore.cs src/backend/FamilyTree.Infrastructure/R2Options.cs tests/unit/FamilyTree.UnitTests/Infrastructure/LocalFileMediaStoreTests.cs
git commit -m "feat(infra): IMediaStore + LocalFileMediaStore + R2Options"
```

---

## Task 9: `R2MediaStore` (S3 API) + AWSSDK package

**Files:**
- Modify: `Directory.Packages.props`
- Modify: `src/backend/FamilyTree.Infrastructure/FamilyTree.Infrastructure.csproj`
- Create: `src/backend/FamilyTree.Infrastructure/R2MediaStore.cs`

**Interfaces:**
- Consumes: `IMediaStore` (Task 8), `R2Options`.
- `[ExcludeFromCodeCoverage]` (thin SDK wrapper, emulator/manual-verified). No unit test.

- [ ] **Step 1: Add the package**

`Directory.Packages.props`:

```xml
    <!-- Cloudflare R2 via its S3-compatible API. -->
    <PackageVersion Include="AWSSDK.S3" Version="3.7.405.4" />
```

`FamilyTree.Infrastructure.csproj`: `<PackageReference Include="AWSSDK.S3" />`.

- [ ] **Step 2: Implement**

```csharp
// src/backend/FamilyTree.Infrastructure/R2MediaStore.cs
using System.Diagnostics.CodeAnalysis;
using Amazon.S3;
using Amazon.S3.Model;
using FamilyTree.Domain;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;

namespace FamilyTree.Infrastructure;

/// <summary>Writes media objects to Cloudflare R2 via its S3-compatible API. Selected in
/// deployment when R2 credentials are configured.</summary>
[ExcludeFromCodeCoverage]
public sealed class R2MediaStore : IMediaStore
{
    private readonly IAmazonS3 _client;
    private readonly string _bucket;
    private readonly ILogger<R2MediaStore> _logger;

    public R2MediaStore(IOptions<R2Options> options, ILogger<R2MediaStore> logger)
    {
        var r2 = options.Value;
        _bucket = r2.Bucket;
        _logger = logger;
        _client = new AmazonS3Client(r2.AccessKeyId, r2.SecretAccessKey, new AmazonS3Config
        {
            ServiceURL = $"https://{r2.AccountId}.r2.cloudflarestorage.com",
            // R2 requires path-style addressing and a placeholder region.
            ForcePathStyle = true,
            AuthenticationRegion = "auto"
        });
    }

    public async Task PutAsync(string key, ReadOnlyMemory<byte> bytes, string contentType, CancellationToken cancellationToken)
    {
        using var stream = new MemoryStream(bytes.ToArray());
        await _client.PutObjectAsync(new PutObjectRequest
        {
            BucketName = _bucket,
            Key = key,
            InputStream = stream,
            ContentType = contentType,
            DisablePayloadSigning = true   // R2 does not support streaming SHA-256 chunked signing.
        }, cancellationToken);
        _logger.LogInformation("Stored media object {Key} ({Bytes} bytes).", key, bytes.Length);
    }

    public async Task DeleteAsync(string key, CancellationToken cancellationToken)
    {
        await _client.DeleteObjectAsync(new DeleteObjectRequest
        {
            BucketName = _bucket,
            Key = key
        }, cancellationToken);
        _logger.LogInformation("Deleted media object {Key}.", key);
    }
}
```

> If the installed AWSSDK.S3 lacks `DisablePayloadSigning` on `PutObjectRequest`, set `_client.Config.SignatureVersion`/use `UseChunkEncoding = false` on the request — verify against the resolved package version and adjust; the goal is "no chunked payload signing" for R2 compatibility.

- [ ] **Step 3: Build**

Run: `dotnet build src/backend/FamilyTree.Infrastructure`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add Directory.Packages.props src/backend/FamilyTree.Infrastructure/FamilyTree.Infrastructure.csproj src/backend/FamilyTree.Infrastructure/R2MediaStore.cs
git commit -m "feat(infra): R2MediaStore over the S3 API"
```

---

## Task 10: DI wiring — register media store/processor + bind R2 options

**Files:**
- Modify: `src/backend/FamilyTree.Infrastructure/InfrastructureServiceCollectionExtensions.cs`
- Modify: `src/backend/FamilyTree.Api/Configuration/AppSettings.cs`
- Modify: `src/backend/FamilyTree.Api/Program.cs:46-57`
- Test: `tests/unit/FamilyTree.UnitTests/Infrastructure/MediaStoreSelectionTests.cs`

**Interfaces:**
- `AddInfrastructure` gains an `R2Options r2` parameter; registers `IImageProcessor → ImageSharpImageProcessor` (singleton), `IMediaStore → R2MediaStore` when `r2.IsConfigured` else `LocalFileMediaStore` (rooted at `r2.LocalMediaDirectory` or a default), and binds `R2Options`.

- [ ] **Step 1: Write the failing test**

```csharp
// tests/unit/FamilyTree.UnitTests/Infrastructure/MediaStoreSelectionTests.cs
using FamilyTree.Domain;
using FamilyTree.Infrastructure;
using Microsoft.Extensions.DependencyInjection;

namespace FamilyTree.UnitTests.Infrastructure;

public sealed class MediaStoreSelectionTests
{
    private static IServiceProvider Build(R2Options r2)
    {
        var services = new ServiceCollection();
        services.AddLogging();
        services.AddInfrastructure(
            new FamilyDataOptions { Source = "", SnapshotTtlMinutes = 10 },
            new FirestoreOptions { ProjectId = "" },
            r2);
        return services.BuildServiceProvider();
    }

    [Fact]
    public void AddInfrastructure_WhenR2Unconfigured_ShouldUseLocalFileMediaStore()
    {
        var sp = Build(new R2Options { LocalMediaDirectory = Path.GetTempPath() });
        sp.GetRequiredService<IMediaStore>().Should().BeOfType<LocalFileMediaStore>();
    }

    [Fact]
    public void AddInfrastructure_ShouldRegisterImageProcessor()
    {
        var sp = Build(new R2Options { LocalMediaDirectory = Path.GetTempPath() });
        sp.GetRequiredService<IImageProcessor>().Should().BeOfType<ImageSharpImageProcessor>();
    }
}
```

- [ ] **Step 2: Run — expect FAIL**

Run: `dotnet test tests/unit/FamilyTree.UnitTests --filter MediaStoreSelectionTests`
Expected: FAIL (`AddInfrastructure` has no `r2` parameter).

- [ ] **Step 3: Wire DI**

In `InfrastructureServiceCollectionExtensions.AddInfrastructure`, add `R2Options r2` parameter and inside the method:

```csharp
        services.Configure<R2Options>(options =>
        {
            options.AccountId = r2.AccountId;
            options.Bucket = r2.Bucket;
            options.AccessKeyId = r2.AccessKeyId;
            options.SecretAccessKey = r2.SecretAccessKey;
            options.LocalMediaDirectory = r2.LocalMediaDirectory;
        });

        services.AddSingleton<IImageProcessor, ImageSharpImageProcessor>();

        if (r2.IsConfigured)
        {
            services.AddSingleton<IMediaStore, R2MediaStore>();
        }
        else
        {
            var root = string.IsNullOrWhiteSpace(r2.LocalMediaDirectory)
                ? Path.Combine(AppContext.BaseDirectory, "media")
                : r2.LocalMediaDirectory;
            services.AddSingleton<IMediaStore>(_ => new LocalFileMediaStore(root));
        }
```

In `AppSettings.cs`, add an `R2Settings` section (mirror existing nested settings) with `AccountId/Bucket/AccessKeyId/SecretAccessKey/LocalMediaDirectory` and add `public R2Settings R2 { get; set; } = new();`. Also add `public long MaxPhotoUploadBytes { get; set; } = 15_728_640;` to the existing `RequestLimits` settings class (15 MiB) and ensure `RequestLimits.MaxRequestBodyBytes` default is ≥ that (read the current default; if smaller, raise it to e.g. `16_777_216`).

In `Program.cs`, pass R2 into `AddInfrastructure`:

```csharp
builder.Services.AddInfrastructure(
    new FamilyDataOptions { Source = appSettings.FamilyData.Source, SnapshotTtlMinutes = appSettings.FamilyData.SnapshotTtlMinutes },
    new FirestoreOptions { ProjectId = appSettings.Firestore.ProjectId, SessionsCollection = appSettings.Firestore.SessionsCollection, OverridesCollection = appSettings.Firestore.OverridesCollection, MediaOverridesCollection = appSettings.Firestore.MediaOverridesCollection },
    new R2Options { AccountId = appSettings.R2.AccountId, Bucket = appSettings.R2.Bucket, AccessKeyId = appSettings.R2.AccessKeyId, SecretAccessKey = appSettings.R2.SecretAccessKey, LocalMediaDirectory = appSettings.R2.LocalMediaDirectory });
```

Add `MediaOverridesCollection` to the `Firestore` settings class too (default `"mediaOverrides"`).

- [ ] **Step 4: Run — expect PASS; build the API**

Run: `dotnet test tests/unit/FamilyTree.UnitTests --filter MediaStoreSelectionTests && dotnet build`
Expected: PASS / green build.

- [ ] **Step 5: Commit**

```bash
git add src/backend/FamilyTree.Infrastructure/InfrastructureServiceCollectionExtensions.cs src/backend/FamilyTree.Api/Configuration/AppSettings.cs src/backend/FamilyTree.Api/Program.cs tests/unit/FamilyTree.UnitTests/Infrastructure/MediaStoreSelectionTests.cs
git commit -m "feat(infra): register media store + image processor; bind R2 options"
```

---

## Task 11: Application commands — add / delete / promote photo

**Files:**
- Create: `src/backend/FamilyTree.Application/People/PhotoRole.cs`
- Create: `src/backend/FamilyTree.Application/People/AddPersonPhotoCommand.cs`
- Create: `src/backend/FamilyTree.Application/People/AddPersonPhotoHandler.cs`
- Create: `src/backend/FamilyTree.Application/People/AddPersonPhotoValidator.cs`
- Create: `src/backend/FamilyTree.Application/People/DeletePersonPhotoCommand.cs` + `DeletePersonPhotoHandler.cs`
- Create: `src/backend/FamilyTree.Application/People/PromotePersonPhotoCommand.cs` + `PromotePersonPhotoHandler.cs`
- Test: `tests/unit/FamilyTree.UnitTests/Application/AddPersonPhotoHandlerTests.cs`, `DeletePersonPhotoHandlerTests.cs`, `PromotePersonPhotoHandlerTests.cs`

**Interfaces:**
- Consumes: `IFamilyQueryService`, `IPersonOverrideStore` (bio+media), `IFamilySnapshotProvider`, `IMediaStore`, `IImageProcessor`, `IMapper`, `MediaKeyGenerator`.
- Produces:
  - `enum PhotoRole { Portrait, Gallery }`
  - `record AddPersonPhotoCommand(string Id, PhotoRole Role, byte[] Content, string EditorEmail) : IRequest<PersonDto?>`
  - `record DeletePersonPhotoCommand(string Id, string Target, string EditorEmail) : IRequest<PersonDto?>` where `Target` is `"portrait"` or a gallery photo id
  - `record PromotePersonPhotoCommand(string Id, string PhotoId, string EditorEmail) : IRequest<PersonDto?>`
- Each handler appends a new `PersonMediaOverride` (full replacement, computed from the current latest media) then `await _snapshot.RefreshAsync(ct)` and returns the merged `PersonDto`.

**Semantics (apply in handlers):**
- **Add/portrait:** process bytes → store full+thumb → `current` media (or empty) → new override with `Portrait = new Photo(...)`, gallery unchanged.
- **Add/gallery:** process+store → append the new `Photo` to gallery (dedupe by id), portrait unchanged.
- **Delete `"portrait"`:** new override with `Portrait = null`, gallery unchanged. Best-effort `DeleteAsync` both keys of the removed portrait (only if not also referenced in the gallery).
- **Delete gallery id:** remove that `Photo` from gallery; best-effort delete its keys (only if not the current portrait).
- **Promote id:** the chosen gallery photo becomes `Portrait`; it is removed from gallery; the previous portrait (if any) is pushed into the gallery so nothing is lost.
- All return `null` when the person does not exist (→ 404).

- [ ] **Step 1: Write failing handler tests (add)**

```csharp
// tests/unit/FamilyTree.UnitTests/Application/AddPersonPhotoHandlerTests.cs
using FamilyTree.Application.Abstractions;
using FamilyTree.Application.Dtos;
using FamilyTree.Application.People;
using FamilyTree.Domain;
using Microsoft.Extensions.Logging.Abstractions;
using Moq;

namespace FamilyTree.UnitTests.Application;

public sealed class AddPersonPhotoHandlerTests
{
    private static Person Existing => new()
    {
        Id = "p-0001",
        GivenName = new LocalizedText { En = "A" },
        Surname = new LocalizedText { En = "B" },
        Birth = new LifeEvent()
    };

    [Fact]
    public async Task Handle_WhenPortraitRole_ShouldStoreBothKeysAndAppendPortraitOverride()
    {
        var service = new Mock<IFamilyQueryService>();
        service.SetupSequence(s => s.GetPersonAsync("p-0001", It.IsAny<CancellationToken>()))
            .ReturnsAsync(Existing).ReturnsAsync(Existing);
        var overrides = new Mock<IPersonOverrideStore>();
        overrides.Setup(o => o.GetLatestMediaAsync("p-0001", It.IsAny<CancellationToken>()))
            .ReturnsAsync((PersonMediaOverride?)null);
        var processor = new Mock<IImageProcessor>();
        processor.Setup(p => p.Process(It.IsAny<ReadOnlyMemory<byte>>()))
            .Returns(new ProcessedImage([1, 2, 3], [4, 5], 100, 100));
        var mediaStore = new Mock<IMediaStore>();
        var snapshot = new Mock<IFamilySnapshotProvider>();
        var mapper = new Mock<IMapper>();
        mapper.Setup(m => m.Map<PersonDto>(It.IsAny<Person>())).Returns((Person p) => StubDto(p));

        var handler = new AddPersonPhotoHandler(service.Object, overrides.Object, snapshot.Object,
            mediaStore.Object, processor.Object, mapper.Object, NullLogger<AddPersonPhotoHandler>.Instance);

        var result = await handler.Handle(new AddPersonPhotoCommand("p-0001", PhotoRole.Portrait, [9, 9], "e@x.com"), default);

        result.Should().NotBeNull();
        mediaStore.Verify(m => m.PutAsync(It.Is<string>(k => k.EndsWith(".webp") && !k.Contains(".thumb")), It.IsAny<ReadOnlyMemory<byte>>(), "image/webp", It.IsAny<CancellationToken>()), Times.Once);
        mediaStore.Verify(m => m.PutAsync(It.Is<string>(k => k.EndsWith(".thumb.webp")), It.IsAny<ReadOnlyMemory<byte>>(), "image/webp", It.IsAny<CancellationToken>()), Times.Once);
        overrides.Verify(o => o.AppendMediaAsync("p-0001", It.Is<PersonMediaOverride>(mo => mo.Portrait != null && mo.Gallery.Count == 0), "e@x.com", It.IsAny<CancellationToken>()), Times.Once);
        snapshot.Verify(s => s.RefreshAsync(It.IsAny<CancellationToken>()), Times.Once);
    }

    [Fact]
    public async Task Handle_WhenPersonMissing_ShouldReturnNull()
    {
        var service = new Mock<IFamilyQueryService>();
        service.Setup(s => s.GetPersonAsync("p-0001", It.IsAny<CancellationToken>())).ReturnsAsync((Person?)null);
        var handler = new AddPersonPhotoHandler(service.Object, Mock.Of<IPersonOverrideStore>(), Mock.Of<IFamilySnapshotProvider>(),
            Mock.Of<IMediaStore>(), Mock.Of<IImageProcessor>(), Mock.Of<IMapper>(), NullLogger<AddPersonPhotoHandler>.Instance);

        (await handler.Handle(new AddPersonPhotoCommand("p-0001", PhotoRole.Gallery, [1], "e@x.com"), default)).Should().BeNull();
    }

    private static PersonDto StubDto(Person p) => new(p.Id,
        new LocalizedTextDto(null, null, p.GivenName.En), new LocalizedTextDto(null, null, p.Surname.En), null,
        "Unknown", new LifeEventDto(null, null, null), null, "Unknown", null, null, p.Portrait, p.PortraitThumb, p.PortraitVideo,
        [], [], [], new ParentsDto(null, null), false, false);
}
```

> Match `LocalizedTextDto`/`LifeEventDto`/`ParentsDto` constructor shapes to the real DTOs when writing `StubDto` (open those files and copy the parameter order). The point of the stub is only that `Map<PersonDto>` returns *something* non-null.

- [ ] **Step 2: Run — expect FAIL**

Run: `dotnet test tests/unit/FamilyTree.UnitTests --filter AddPersonPhotoHandlerTests`
Expected: FAIL (types missing).

- [ ] **Step 3: Implement role enum, command, handler**

```csharp
// src/backend/FamilyTree.Application/People/PhotoRole.cs
namespace FamilyTree.Application.People;

public enum PhotoRole { Portrait, Gallery }
```

```csharp
// src/backend/FamilyTree.Application/People/AddPersonPhotoCommand.cs
using FamilyTree.Application.Dtos;

namespace FamilyTree.Application.People;

public sealed record AddPersonPhotoCommand(string Id, PhotoRole Role, byte[] Content, string EditorEmail)
    : IRequest<PersonDto?>;
```

```csharp
// src/backend/FamilyTree.Application/People/AddPersonPhotoHandler.cs
using FamilyTree.Application.Abstractions;
using FamilyTree.Application.Dtos;
using FamilyTree.Domain;
using FamilyTree.Infrastructure;
using Microsoft.Extensions.Logging;

namespace FamilyTree.Application.People;

public sealed class AddPersonPhotoHandler : IRequestHandler<AddPersonPhotoCommand, PersonDto?>
{
    private const string WebpContentType = "image/webp";

    private readonly IFamilyQueryService _service;
    private readonly IPersonOverrideStore _overrides;
    private readonly IFamilySnapshotProvider _snapshot;
    private readonly IMediaStore _media;
    private readonly IImageProcessor _processor;
    private readonly IMapper _mapper;
    private readonly ILogger<AddPersonPhotoHandler> _logger;

    public AddPersonPhotoHandler(
        IFamilyQueryService service,
        IPersonOverrideStore overrides,
        IFamilySnapshotProvider snapshot,
        IMediaStore media,
        IImageProcessor processor,
        IMapper mapper,
        ILogger<AddPersonPhotoHandler> logger)
    {
        _service = service;
        _overrides = overrides;
        _snapshot = snapshot;
        _media = media;
        _processor = processor;
        _mapper = mapper;
        _logger = logger;
    }

    public async Task<PersonDto?> Handle(AddPersonPhotoCommand request, CancellationToken cancellationToken)
    {
        var existing = await _service.GetPersonAsync(request.Id, cancellationToken);
        if (existing is null)
        {
            return null;
        }

        var processed = _processor.Process(request.Content);
        var (id, fullKey, thumbKey) = MediaKeyGenerator.ForPerson(request.Id, processed.Full);

        // Store bytes BEFORE recording metadata: an orphaned object is harmless, a dangling
        // metadata reference would render as a broken image. Metadata is the commit point.
        await _media.PutAsync(fullKey, processed.Full, WebpContentType, cancellationToken);
        await _media.PutAsync(thumbKey, processed.Thumb, WebpContentType, cancellationToken);

        var photo = new Photo(id, fullKey, thumbKey);
        var current = await _overrides.GetLatestMediaAsync(request.Id, cancellationToken)
            ?? new PersonMediaOverride(null, []);

        var next = request.Role == PhotoRole.Portrait
            ? current with { Portrait = photo }
            : current with { Gallery = Append(current.Gallery, photo) };

        await _overrides.AppendMediaAsync(request.Id, next, request.EditorEmail, cancellationToken);
        await _snapshot.RefreshAsync(cancellationToken);

        var merged = await _service.GetPersonAsync(request.Id, cancellationToken);
        _logger.LogInformation("Photo added for person {PersonId} (role={Role}).", request.Id, request.Role);
        return merged is null ? null : _mapper.Map<PersonDto>(merged);
    }

    private static IReadOnlyList<Photo> Append(IReadOnlyList<Photo> gallery, Photo photo) =>
        gallery.Any(p => p.Id == photo.Id) ? gallery : [.. gallery, photo];
}
```

> `using FamilyTree.Infrastructure;` for `MediaKeyGenerator` — the Application project already references Infrastructure? Verify the project reference direction. If Application does NOT reference Infrastructure (clean-architecture: it usually depends on Domain only), **move `MediaKeyGenerator` into `FamilyTree.Domain`** (it has no infra dependency — pure `SHA256`). Do that move in this step and update Task 5's namespace/test accordingly. Confirm by checking `FamilyTree.Application.csproj` project references.

- [ ] **Step 4: Implement delete + promote (with their tests)**

Write `DeletePersonPhotoHandlerTests` and `PromotePersonPhotoHandlerTests` mirroring the add test (assert `AppendMediaAsync` is called with the expected resulting override, and best-effort `DeleteAsync` is invoked for removed keys; person-missing → null). Then:

```csharp
// src/backend/FamilyTree.Application/People/DeletePersonPhotoCommand.cs
using FamilyTree.Application.Dtos;
namespace FamilyTree.Application.People;
public sealed record DeletePersonPhotoCommand(string Id, string Target, string EditorEmail) : IRequest<PersonDto?>;
```

```csharp
// src/backend/FamilyTree.Application/People/DeletePersonPhotoHandler.cs
using FamilyTree.Application.Abstractions;
using FamilyTree.Application.Dtos;
using FamilyTree.Domain;
using Microsoft.Extensions.Logging;

namespace FamilyTree.Application.People;

public sealed class DeletePersonPhotoHandler : IRequestHandler<DeletePersonPhotoCommand, PersonDto?>
{
    private readonly IFamilyQueryService _service;
    private readonly IPersonOverrideStore _overrides;
    private readonly IFamilySnapshotProvider _snapshot;
    private readonly IMediaStore _media;
    private readonly IMapper _mapper;
    private readonly ILogger<DeletePersonPhotoHandler> _logger;

    public DeletePersonPhotoHandler(IFamilyQueryService service, IPersonOverrideStore overrides,
        IFamilySnapshotProvider snapshot, IMediaStore media, IMapper mapper, ILogger<DeletePersonPhotoHandler> logger)
    {
        _service = service; _overrides = overrides; _snapshot = snapshot; _media = media; _mapper = mapper; _logger = logger;
    }

    public async Task<PersonDto?> Handle(DeletePersonPhotoCommand request, CancellationToken cancellationToken)
    {
        var existing = await _service.GetPersonAsync(request.Id, cancellationToken);
        if (existing is null)
        {
            return null;
        }

        var current = await _overrides.GetLatestMediaAsync(request.Id, cancellationToken);
        if (current is null)
        {
            // Nothing overridden — return the current merged person unchanged.
            return _mapper.Map<PersonDto>(existing);
        }

        PersonMediaOverride next;
        Photo? removed;
        if (request.Target == "portrait")
        {
            removed = current.Portrait;
            next = current with { Portrait = null };
        }
        else
        {
            removed = current.Gallery.FirstOrDefault(p => p.Id == request.Target);
            next = current with { Gallery = current.Gallery.Where(p => p.Id != request.Target).ToList() };
        }

        await _overrides.AppendMediaAsync(request.Id, next, request.EditorEmail, cancellationToken);
        await _snapshot.RefreshAsync(cancellationToken);
        await BestEffortDeleteAsync(removed, next, cancellationToken);

        var merged = await _service.GetPersonAsync(request.Id, cancellationToken);
        _logger.LogInformation("Photo removed for person {PersonId}.", request.Id);
        return merged is null ? null : _mapper.Map<PersonDto>(merged);
    }

    // Delete bytes only when no surviving reference (portrait or gallery) still points at them.
    private async Task BestEffortDeleteAsync(Photo? removed, PersonMediaOverride next, CancellationToken cancellationToken)
    {
        if (removed is null)
        {
            return;
        }

        var stillUsed = next.Portrait?.Id == removed.Id || next.Gallery.Any(p => p.Id == removed.Id);
        if (stillUsed)
        {
            return;
        }

        try
        {
            await _media.DeleteAsync(removed.Full, cancellationToken);
            await _media.DeleteAsync(removed.Thumb, cancellationToken);
        }
        catch (Exception ex)
        {
            // Orphaned bytes are harmless; never fail the user's delete because cleanup failed.
            _logger.LogWarning(ex, "Best-effort media delete failed for an object of person {PersonId}.", removed.Id is null ? "?" : removed.Id);
        }
    }
}
```

> Fix the log to not pass `removed.Id` as a person id; log a fixed message instead (no PII concern, but keep it accurate): `_logger.LogWarning(ex, "Best-effort media delete failed.");`

```csharp
// src/backend/FamilyTree.Application/People/PromotePersonPhotoCommand.cs
using FamilyTree.Application.Dtos;
namespace FamilyTree.Application.People;
public sealed record PromotePersonPhotoCommand(string Id, string PhotoId, string EditorEmail) : IRequest<PersonDto?>;
```

```csharp
// src/backend/FamilyTree.Application/People/PromotePersonPhotoHandler.cs
using FamilyTree.Application.Abstractions;
using FamilyTree.Application.Dtos;
using FamilyTree.Domain;
using Microsoft.Extensions.Logging;

namespace FamilyTree.Application.People;

public sealed class PromotePersonPhotoHandler : IRequestHandler<PromotePersonPhotoCommand, PersonDto?>
{
    private readonly IFamilyQueryService _service;
    private readonly IPersonOverrideStore _overrides;
    private readonly IFamilySnapshotProvider _snapshot;
    private readonly IMapper _mapper;
    private readonly ILogger<PromotePersonPhotoHandler> _logger;

    public PromotePersonPhotoHandler(IFamilyQueryService service, IPersonOverrideStore overrides,
        IFamilySnapshotProvider snapshot, IMapper mapper, ILogger<PromotePersonPhotoHandler> logger)
    {
        _service = service; _overrides = overrides; _snapshot = snapshot; _mapper = mapper; _logger = logger;
    }

    public async Task<PersonDto?> Handle(PromotePersonPhotoCommand request, CancellationToken cancellationToken)
    {
        var existing = await _service.GetPersonAsync(request.Id, cancellationToken);
        if (existing is null)
        {
            return null;
        }

        var current = await _overrides.GetLatestMediaAsync(request.Id, cancellationToken);
        var target = current?.Gallery.FirstOrDefault(p => p.Id == request.PhotoId);
        if (current is null || target is null)
        {
            // No such gallery photo — return unchanged.
            return _mapper.Map<PersonDto>(existing);
        }

        // The previous portrait (if any) drops back into the gallery so no photo is lost.
        var newGallery = current.Gallery.Where(p => p.Id != target.Id).ToList();
        if (current.Portrait is not null)
        {
            newGallery.Insert(0, current.Portrait);
        }

        var next = new PersonMediaOverride(target, newGallery);
        await _overrides.AppendMediaAsync(request.Id, next, request.EditorEmail, cancellationToken);
        await _snapshot.RefreshAsync(cancellationToken);

        var merged = await _service.GetPersonAsync(request.Id, cancellationToken);
        _logger.LogInformation("Gallery photo promoted to portrait for person {PersonId}.", request.Id);
        return merged is null ? null : _mapper.Map<PersonDto>(merged);
    }
}
```

- [ ] **Step 5: Implement the upload validator**

```csharp
// src/backend/FamilyTree.Application/People/AddPersonPhotoValidator.cs
using FluentValidation;

namespace FamilyTree.Application.People;

public sealed class AddPersonPhotoValidator : AbstractValidator<AddPersonPhotoCommand>
{
    // Matches the existing person-id rule used by the biography validator.
    private const long MaxBytes = 15_728_640; // 15 MiB — mirror RequestLimits.MaxPhotoUploadBytes.

    public AddPersonPhotoValidator()
    {
        RuleFor(c => c.Id).Matches("^p-\\d+$");
        RuleFor(c => c.Content).NotEmpty().Must(c => c.LongLength <= MaxBytes)
            .WithMessage("The image exceeds the maximum upload size.");
        RuleFor(c => c.Role).IsInEnum();
    }
}
```

- [ ] **Step 6: Run all new Application tests — expect PASS**

Run: `dotnet test tests/unit/FamilyTree.UnitTests --filter "AddPersonPhotoHandlerTests|DeletePersonPhotoHandlerTests|PromotePersonPhotoHandlerTests"`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/backend/FamilyTree.Application/People tests/unit/FamilyTree.UnitTests/Application
git commit -m "feat(app): add/delete/promote person photo commands"
```

---

## Task 12: API endpoints — upload / delete / promote

**Files:**
- Modify: `src/backend/FamilyTree.Api/Controllers/PeopleController.cs`
- Test: `tests/integration/FamilyTree.IntegrationTests/PhotoEndpointsTests.cs`

**Interfaces:**
- Consumes: the three commands (Task 11); existing `CanEdit` policy; `ClaimTypes.Email`.
- Endpoints (all `[Authorize(Policy = "CanEdit")]`):
  - `POST /api/people/{id}/photos` — `multipart/form-data`: `file` (`IFormFile`), `role` (`"portrait"|"gallery"`).
  - `DELETE /api/people/{id}/photos/portrait`
  - `DELETE /api/people/{id}/photos/gallery/{photoId}`
  - `POST /api/people/{id}/photos/gallery/{photoId}/promote`

- [ ] **Step 1: Write the failing integration tests**

Mirror the existing biography integration tests (find them under `tests/integration/FamilyTree.IntegrationTests`, copy the `WebApplicationFactory` + authenticated-client helper). Cover:

```csharp
// tests/integration/FamilyTree.IntegrationTests/PhotoEndpointsTests.cs (sketch — match the existing harness)
public sealed class PhotoEndpointsTests : IClassFixture<CustomWebApplicationFactory>
{
    // ... reuse the factory + the helper that produces an authenticated editor client and an anonymous client.

    [Fact]
    public async Task PostPhoto_WhenAnonymous_ShouldReturn401()
    {
        var client = _factory.CreateClient();
        using var content = PngMultipart("portrait");
        var response = await client.PostAsync("/api/people/p-0001/photos", content);
        response.StatusCode.Should().Be(HttpStatusCode.Unauthorized);
    }

    [Fact]
    public async Task PostPhoto_WhenEditorUploadsPortrait_ShouldReturnPersonWithPortraitThumb()
    {
        var client = await _factory.CreateEditorClientAsync();
        using var content = PngMultipart("portrait");
        var response = await client.PostAsync("/api/people/p-0001/photos", content);
        response.StatusCode.Should().Be(HttpStatusCode.OK);
        var dto = await response.Content.ReadFromJsonAsync<PersonDto>();
        dto!.Portrait.Should().StartWith("uploads/p-0001/");
        dto.PortraitThumb.Should().EndWith(".thumb.webp");
    }

    [Fact]
    public async Task PostThenGetMedia_ShouldRoundTripBytes()
    {
        var client = await _factory.CreateEditorClientAsync();
        using var content = PngMultipart("gallery");
        var dto = await (await client.PostAsync("/api/people/p-0001/photos", content)).Content.ReadFromJsonAsync<PersonDto>();
        var key = dto!.Gallery.Single().Full;            // e.g. uploads/p-0001/<id>.webp
        // The API's LocalFileMediaStore writes under the configured media dir, which the factory points at a temp dir;
        // assert the file exists on disk (the Pages Function serves it in production, not the API).
        // Verify via the store path the factory configured, OR assert the override took effect via GET /api/people/{id}.
    }

    [Fact]
    public async Task DeletePortrait_WhenEditor_ShouldClearPortraitOverride()
    {
        var client = await _factory.CreateEditorClientAsync();
        using var content = PngMultipart("portrait");
        await client.PostAsync("/api/people/p-0001/photos", content);
        var response = await client.DeleteAsync("/api/people/p-0001/photos/portrait");
        response.StatusCode.Should().Be(HttpStatusCode.OK);
    }

    [Fact]
    public async Task PostPhoto_WhenNotAnImage_ShouldReturn400()
    {
        var client = await _factory.CreateEditorClientAsync();
        using var content = BytesMultipart("portrait", new byte[] { 0, 1, 2, 3 });
        var response = await client.PostAsync("/api/people/p-0001/photos", content);
        response.StatusCode.Should().Be(HttpStatusCode.BadRequest);
    }
}
```

> Configure the integration factory so R2 is **unconfigured** (uses `LocalFileMediaStore` rooted at a temp dir) — set `R2:LocalMediaDirectory` to a temp path via the factory's config override, exactly how the suite already overrides config for tests. Generate the PNG with ImageSharp in a small `PngMultipart` helper. `InvalidImageException` should surface as a 400 — either add a `catch` in the controller mapping it to `BadRequest`, or (preferred) a small `IExceptionHandler`/validation path; simplest is to catch `InvalidImageException` in the controller action and return `BadRequest`.

- [ ] **Step 2: Run — expect FAIL (404s, endpoints absent)**

Run: `dotnet test tests/integration/FamilyTree.IntegrationTests --filter PhotoEndpointsTests`
Expected: FAIL.

- [ ] **Step 3: Implement the endpoints**

Add to `PeopleController` (uses `using FamilyTree.Domain;` for `InvalidImageException`, `using Microsoft.AspNetCore.Mvc;`):

```csharp
    [HttpPost("{id}/photos")]
    [Authorize(Policy = "CanEdit")]
    [RequestSizeLimit(16_777_216)] // 16 MiB ceiling for a photo upload (≥ MaxPhotoUploadBytes).
    public async Task<ActionResult<PersonDto>> AddPhoto(
        string id,
        [FromForm] IFormFile file,
        [FromForm] string role,
        CancellationToken cancellationToken)
    {
        if (!Enum.TryParse<PhotoRole>(role, ignoreCase: true, out var parsedRole))
        {
            return BadRequest(new { title = "role must be 'portrait' or 'gallery'." });
        }

        await using var stream = file.OpenReadStream();
        using var buffer = new MemoryStream();
        await stream.CopyToAsync(buffer, cancellationToken);

        var editorEmail = User.FindFirstValue(ClaimTypes.Email) ?? "";
        try
        {
            var person = await _sender.Send(new AddPersonPhotoCommand(id, parsedRole, buffer.ToArray(), editorEmail), cancellationToken);
            return person is null ? NotFound() : Ok(person);
        }
        catch (InvalidImageException ex)
        {
            return BadRequest(new { title = ex.Message });
        }
    }

    [HttpDelete("{id}/photos/portrait")]
    [Authorize(Policy = "CanEdit")]
    public async Task<ActionResult<PersonDto>> DeletePortrait(string id, CancellationToken cancellationToken)
    {
        var editorEmail = User.FindFirstValue(ClaimTypes.Email) ?? "";
        var person = await _sender.Send(new DeletePersonPhotoCommand(id, "portrait", editorEmail), cancellationToken);
        return person is null ? NotFound() : Ok(person);
    }

    [HttpDelete("{id}/photos/gallery/{photoId}")]
    [Authorize(Policy = "CanEdit")]
    public async Task<ActionResult<PersonDto>> DeleteGalleryPhoto(string id, string photoId, CancellationToken cancellationToken)
    {
        var editorEmail = User.FindFirstValue(ClaimTypes.Email) ?? "";
        var person = await _sender.Send(new DeletePersonPhotoCommand(id, photoId, editorEmail), cancellationToken);
        return person is null ? NotFound() : Ok(person);
    }

    [HttpPost("{id}/photos/gallery/{photoId}/promote")]
    [Authorize(Policy = "CanEdit")]
    public async Task<ActionResult<PersonDto>> PromoteGalleryPhoto(string id, string photoId, CancellationToken cancellationToken)
    {
        var editorEmail = User.FindFirstValue(ClaimTypes.Email) ?? "";
        var person = await _sender.Send(new PromotePersonPhotoCommand(id, photoId, editorEmail), cancellationToken);
        return person is null ? NotFound() : Ok(person);
    }
```

Add `using FamilyTree.Application.Dtos;` / `using FamilyTree.Domain;` as needed.

> The global Content-Length 413 middleware in `Program.cs` uses `appSettings.RequestLimits.MaxRequestBodyBytes`. Confirm that value ≥ 16 MiB (Task 10 raised it). The `[RequestSizeLimit]` here is a secondary, per-endpoint guard.

- [ ] **Step 4: Run — expect PASS**

Run: `dotnet test tests/integration/FamilyTree.IntegrationTests --filter PhotoEndpointsTests`
Expected: PASS.

- [ ] **Step 5: Full backend test sweep + commit**

Run: `dotnet test`
Expected: PASS.

```bash
git add src/backend/FamilyTree.Api/Controllers/PeopleController.cs tests/integration/FamilyTree.IntegrationTests/PhotoEndpointsTests.cs
git commit -m "feat(api): person photo upload/delete/promote endpoints"
```

---

## Task 13: Frontend types + `resolveMediaUrl`

**Files:**
- Modify: `src/frontend/src/media/mediaUrl.ts`
- Modify: `src/frontend/src/types/family.ts`
- Test: `src/frontend/src/media/mediaUrl.spec.ts`

**Interfaces:**
- Produces: `resolveMediaUrl(keyOrName: string): string` — full key (contains `/`) → `/media/<key>` (each segment encoded); bare filename → legacy `/media/portraits/<name>`.
- `Photo` type `{ id: string; full: string; thumb: string }`; `PersonDetail.portraitThumb?: string`; `PersonDetail.gallery: Photo[]`.

- [ ] **Step 1: Write the failing test (extend the existing spec)**

```ts
// src/frontend/src/media/mediaUrl.spec.ts (add)
import { describe, it, expect } from 'vitest';
import { resolveMediaUrl } from './mediaUrl';

describe('resolveMediaUrl', () => {
  it('treats a bare filename as a legacy portrait', () => {
    expect(resolveMediaUrl('p-0001.jpg')).toBe('/media/portraits/p-0001.jpg');
  });

  it('treats a value with a slash as a full media key', () => {
    expect(resolveMediaUrl('uploads/p-0001/ab12.webp')).toBe('/media/uploads/p-0001/ab12.webp');
  });

  it('encodes each segment of a full key', () => {
    expect(resolveMediaUrl('uploads/p 1/a b.webp')).toBe('/media/uploads/p%201/a%20b.webp');
  });
});
```

- [ ] **Step 2: Run — expect FAIL**

Run: `npm --prefix src/frontend test -- mediaUrl`
Expected: FAIL (`resolveMediaUrl` missing).

- [ ] **Step 3: Implement**

Append to `mediaUrl.ts`:

```ts
/**
 * Resolves a stored media reference to its same-origin URL. Seed assets are bare
 * filenames under the implicit `portraits/` prefix; uploaded assets are full R2 keys
 * (they contain a `/`) served verbatim under `/media/`.
 */
export function resolveMediaUrl(keyOrName: string): string {
  if (keyOrName.includes('/')) {
    return `/media/${keyOrName.split('/').map(encodeURIComponent).join('/')}`;
  }
  return mediaUrl('portraits', keyOrName);
}
```

In `types/family.ts` add/adjust:

```ts
export interface Photo {
  id: string;
  full: string;
  thumb: string;
}
```

and in `PersonDetail` change `gallery: string[]` → `gallery: Photo[]`, add `portraitThumb?: string` next to `portrait?: string`. (If `Photo` isn't exported elsewhere, export it.)

- [ ] **Step 4: Run — expect PASS; type-check**

Run: `npm --prefix src/frontend test -- mediaUrl && npm --prefix src/frontend run build`
Expected: tests PASS; `vue-tsc` may flag consumers of `gallery`/`portrait` — fix in Task 15.

- [ ] **Step 5: Commit**

```bash
git add src/frontend/src/media/mediaUrl.ts src/frontend/src/media/mediaUrl.spec.ts src/frontend/src/types/family.ts
git commit -m "feat(web): resolveMediaUrl + Photo type"
```

---

## Task 14: Frontend `photosApi`

**Files:**
- Create: `src/frontend/src/api/photosApi.ts`
- Test: `src/frontend/src/api/photosApi.spec.ts`

**Interfaces:**
- Produces:
  - `uploadPhoto(personId, file: File, role: 'portrait' | 'gallery', baseUrl?): Promise<PersonDetail>`
  - `deletePortrait(personId, baseUrl?): Promise<PersonDetail>`
  - `deleteGalleryPhoto(personId, photoId, baseUrl?): Promise<PersonDetail>`
  - `promoteGalleryPhoto(personId, photoId, baseUrl?): Promise<PersonDetail>`
  - All `credentials: 'include'`; throw on non-OK (so the UI keeps state + offers retry, like `biographyApi`).

- [ ] **Step 1: Write the failing test**

```ts
// src/frontend/src/api/photosApi.spec.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { uploadPhoto, deletePortrait, promoteGalleryPhoto } from './photosApi';

const ok = (body: unknown) => Promise.resolve({ ok: true, json: () => Promise.resolve(body) } as Response);

describe('photosApi', () => {
  beforeEach(() => { vi.restoreAllMocks(); });

  it('uploadPhoto posts multipart with credentials', async () => {
    const fetchMock = vi.fn().mockReturnValue(ok({ id: 'p-0001' }));
    vi.stubGlobal('fetch', fetchMock);
    const file = new File([new Uint8Array([1, 2, 3])], 'x.png', { type: 'image/png' });

    await uploadPhoto('p-0001', file, 'portrait');

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('/api/people/p-0001/photos');
    expect(init.method).toBe('POST');
    expect(init.credentials).toBe('include');
    expect(init.body).toBeInstanceOf(FormData);
    expect((init.body as FormData).get('role')).toBe('portrait');
  });

  it('throws on non-OK', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 403 } as Response));
    const file = new File([new Uint8Array([1])], 'x.png', { type: 'image/png' });
    await expect(uploadPhoto('p-0001', file, 'gallery')).rejects.toThrow();
  });

  it('promoteGalleryPhoto posts to the promote route', async () => {
    const fetchMock = vi.fn().mockReturnValue(ok({ id: 'p-0001' }));
    vi.stubGlobal('fetch', fetchMock);
    await promoteGalleryPhoto('p-0001', 'h2');
    expect(fetchMock.mock.calls[0][0]).toBe('/api/people/p-0001/photos/gallery/h2/promote');
  });

  it('deletePortrait calls DELETE', async () => {
    const fetchMock = vi.fn().mockReturnValue(ok({ id: 'p-0001' }));
    vi.stubGlobal('fetch', fetchMock);
    await deletePortrait('p-0001');
    expect(fetchMock.mock.calls[0][1].method).toBe('DELETE');
  });
});
```

- [ ] **Step 2: Run — expect FAIL**

Run: `npm --prefix src/frontend test -- photosApi`
Expected: FAIL.

- [ ] **Step 3: Implement**

```ts
// src/frontend/src/api/photosApi.ts
import type { PersonDetail } from '../types/family';

async function asPersonDetail(response: Response, action: string): Promise<PersonDetail> {
  if (!response.ok) {
    throw new Error(`Failed to ${action}: ${response.status}`);
  }
  return (await response.json()) as PersonDetail;
}

export async function uploadPhoto(
  personId: string,
  file: File,
  role: 'portrait' | 'gallery',
  baseUrl = ''
): Promise<PersonDetail> {
  const form = new FormData();
  form.append('file', file);
  form.append('role', role);
  // No Content-Type header: the browser sets the multipart boundary.
  const response = await fetch(`${baseUrl}/api/people/${personId}/photos`, {
    method: 'POST',
    credentials: 'include',
    body: form
  });
  return asPersonDetail(response, 'upload photo');
}

export async function deletePortrait(personId: string, baseUrl = ''): Promise<PersonDetail> {
  const response = await fetch(`${baseUrl}/api/people/${personId}/photos/portrait`, {
    method: 'DELETE',
    credentials: 'include'
  });
  return asPersonDetail(response, 'delete portrait');
}

export async function deleteGalleryPhoto(personId: string, photoId: string, baseUrl = ''): Promise<PersonDetail> {
  const response = await fetch(`${baseUrl}/api/people/${personId}/photos/gallery/${encodeURIComponent(photoId)}`, {
    method: 'DELETE',
    credentials: 'include'
  });
  return asPersonDetail(response, 'delete photo');
}

export async function promoteGalleryPhoto(personId: string, photoId: string, baseUrl = ''): Promise<PersonDetail> {
  const response = await fetch(`${baseUrl}/api/people/${personId}/photos/gallery/${encodeURIComponent(photoId)}/promote`, {
    method: 'POST',
    credentials: 'include'
  });
  return asPersonDetail(response, 'promote photo');
}
```

- [ ] **Step 4: Run — expect PASS**

Run: `npm --prefix src/frontend test -- photosApi`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/frontend/src/api/photosApi.ts src/frontend/src/api/photosApi.spec.ts
git commit -m "feat(web): photosApi (upload/delete/promote)"
```

---

## Task 15: Render uploaded portraits/thumbs (medallion + header)

**Files:**
- Modify: `src/frontend/src/components/PersonMedallion.vue:23-25`
- Modify: `src/frontend/src/components/PersonHeader.vue:36-39`
- Modify: any `PersonSummary`/layout type carrying `portrait` to also carry `portraitThumb` (graph DTO) — see note.
- Test: extend each component's spec if present; otherwise a focused spec for the portrait href.

**Interfaces:**
- Consumes: `resolveMediaUrl` (Task 13).
- The tree medallion prefers `portraitThumb` when present, else `portrait`, resolved via `resolveMediaUrl`. The detail header resolves `portrait` (full) via `resolveMediaUrl`.

> **Backend note:** the tree graph endpoint serializes a person *summary* (not `PersonDto`). To let medallions use uploaded portraits + thumbs, add `Portrait`/`PortraitThumb` (strings) to that summary DTO and its Mapster mapping, and confirm the graph/query path carries them. Check `PersonSummaryDto` and the `family/graph` query; if `Portrait` already flows there, just add `PortraitThumb`. Do this small backend change here (with a mapping test) so the medallion has data.

- [ ] **Step 1: Update `PersonMedallion.vue`**

Replace the `portraitHref` computed:

```ts
import { resolveMediaUrl } from '../media/resolveMediaUrl'; // or '../media/mediaUrl' if exported there
// ...
const portraitHref = computed(() => {
  const p = props.node.person;
  const ref = p.portraitThumb ?? p.portrait;
  return ref ? resolveMediaUrl(ref) : null;
});
```

(Use the actual export location from Task 13 — `resolveMediaUrl` lives in `mediaUrl.ts`.) Ensure the layout `person` type exposes `portraitThumb`.

- [ ] **Step 2: Update `PersonHeader.vue`**

```ts
const stillUrl = computed(() =>
  props.detail.portrait && !imageFailed.value ? resolveMediaUrl(props.detail.portrait) : null);
const videoUrl = computed(() =>
  props.detail.portraitVideo && !videoFailed.value ? resolveMediaUrl(props.detail.portraitVideo) : null);
```

Import `resolveMediaUrl`. (Seed video filenames are bare → still resolve via the `portraits/` branch; uploaded portraits are full keys → resolved verbatim.)

- [ ] **Step 3: Run the frontend suite + type-check**

Run: `npm --prefix src/frontend test && npm --prefix src/frontend run build`
Expected: PASS (fix any remaining `gallery`/`portrait` type usages surfaced by `vue-tsc`).

- [ ] **Step 4: Commit**

```bash
git add src/frontend/src/components/PersonMedallion.vue src/frontend/src/components/PersonHeader.vue src/backend
git commit -m "feat(web): render uploaded portraits and thumbnails"
```

---

## Task 16: `PhotoManager` editor UI + `GalleryViewer` + popup mount

**Files:**
- Create: `src/frontend/src/components/PhotoManager.vue`
- Create: `src/frontend/src/components/GalleryViewer.vue`
- Modify: the popup component hosting `BiographyEditor` (find via `grep -rn "BiographyEditor" src/frontend/src`)
- Test: `src/frontend/src/components/PhotoManager.spec.ts`, `GalleryViewer.spec.ts`

**Interfaces:**
- Consumes: `photosApi` (Task 14), `resolveMediaUrl`, `PersonDetail`/`Photo` types, the auth store's `canEdit`, the family store's "apply updated PersonDetail" action (the same one `BiographyEditor` calls after a save — reuse it).
- `PhotoManager` props: `{ detail: PersonDetail }`. Emits/commits the updated `PersonDetail` returned by each API call (so the popup re-renders). Editor-only (rendered behind `v-if="canEdit"`).
- `GalleryViewer` props: `{ photos: Photo[]; name: string }` — read-only grid; clicking opens the existing `MediaLightbox` (reuse `MediaItem[]`).

- [ ] **Step 1: Write `GalleryViewer` test first (pure render)**

```ts
// src/frontend/src/components/GalleryViewer.spec.ts
import { describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';
import GalleryViewer from './GalleryViewer.vue';

const photos = [
  { id: 'h2', full: 'uploads/p-0001/h2.webp', thumb: 'uploads/p-0001/h2.thumb.webp' }
];

describe('GalleryViewer', () => {
  it('renders a thumbnail per photo using the thumb key', () => {
    const wrapper = mount(GalleryViewer, { props: { photos, name: 'A B' } });
    const img = wrapper.get('[data-test="gallery-thumb"]');
    expect(img.attributes('src')).toBe('/media/uploads/p-0001/h2.thumb.webp');
  });

  it('renders nothing when empty', () => {
    const wrapper = mount(GalleryViewer, { props: { photos: [], name: 'A B' } });
    expect(wrapper.find('[data-test="gallery-thumb"]').exists()).toBe(false);
  });
});
```

- [ ] **Step 2: Run — expect FAIL, then implement `GalleryViewer.vue`**

`GalleryViewer.vue` renders a `<button>`/`<img :src="resolveMediaUrl(photo.thumb)" data-test="gallery-thumb">` grid; clicking sets a lightbox index and teleports `MediaLightbox` with `items` mapped to `{ kind: 'image', src: resolveMediaUrl(photo.full) }`. Match the existing `PersonHeader.vue` lightbox usage. Run `npm --prefix src/frontend test -- GalleryViewer` → PASS.

- [ ] **Step 3: Write `PhotoManager` test (upload + promote + delete happy paths)**

```ts
// src/frontend/src/components/PhotoManager.spec.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import PhotoManager from './PhotoManager.vue';
import * as photosApi from '../api/photosApi';

const detail = {
  id: 'p-0001', givenName: { en: 'A' }, surname: { en: 'B' }, sex: 'M',
  birth: {}, vocation: '', portrait: undefined, portraitThumb: undefined,
  gallery: [], links: [], residences: [], parents: {}, marriedIntoFamily: false, isDefaultRoot: false
} as any;

describe('PhotoManager', () => {
  beforeEach(() => vi.restoreAllMocks());

  it('uploads a chosen file as a gallery photo and emits the updated detail', async () => {
    const updated = { ...detail, gallery: [{ id: 'h2', full: 'uploads/p-0001/h2.webp', thumb: 'uploads/p-0001/h2.thumb.webp' }] };
    const spy = vi.spyOn(photosApi, 'uploadPhoto').mockResolvedValue(updated);
    const wrapper = mount(PhotoManager, { props: { detail }, global: { stubs: { Teleport: true } } });

    const file = new File([new Uint8Array([1, 2, 3])], 'x.png', { type: 'image/png' });
    const input = wrapper.get('[data-test="gallery-input"]');
    Object.defineProperty(input.element, 'files', { value: [file] });
    await input.trigger('change');
    await flushPromises();

    expect(spy).toHaveBeenCalledWith('p-0001', file, 'gallery');
    expect(wrapper.emitted('updated')?.[0]?.[0]).toEqual(updated);
  });

  it('shows an error and keeps the UI when upload fails', async () => {
    vi.spyOn(photosApi, 'uploadPhoto').mockRejectedValue(new Error('403'));
    const wrapper = mount(PhotoManager, { props: { detail }, global: { stubs: { Teleport: true } } });
    const file = new File([new Uint8Array([1])], 'x.png', { type: 'image/png' });
    const input = wrapper.get('[data-test="portrait-input"]');
    Object.defineProperty(input.element, 'files', { value: [file] });
    await input.trigger('change');
    await flushPromises();
    expect(wrapper.get('[data-test="photo-error"]').isVisible()).toBe(true);
  });
});
```

- [ ] **Step 4: Run — expect FAIL, then implement `PhotoManager.vue`**

Implement: a portrait slot (current portrait via `resolveMediaUrl(detail.portraitThumb ?? detail.portrait)` or an "Add portrait" file input `data-test="portrait-input"`), a gallery file input `data-test="gallery-input"`, gallery thumbnails each with "Make portrait" (`promoteGalleryPhoto`) and delete (`deleteGalleryPhoto`, with a confirm) actions, a portrait delete action (`deletePortrait`), a busy flag disabling inputs during a request, and an error banner `data-test="photo-error"` on rejection (never clears the chosen state). Each successful call does `emit('updated', updatedDetail)`. Run `npm --prefix src/frontend test -- PhotoManager` → PASS.

- [ ] **Step 5: Mount in the popup**

In the popup component that renders `BiographyEditor`, render (editors only) `<PhotoManager :detail="detail" @updated="onDetailUpdated" />` and, for all visitors, `<GalleryViewer :photos="detail.gallery" :name="fullName" />`. Wire `onDetailUpdated` to the same store action `BiographyEditor`'s save uses to replace the open `PersonDetail` (reuse it; do not invent a second path). Confirm `canEdit` comes from the existing auth store.

- [ ] **Step 6: Full frontend suite + build**

Run: `npm --prefix src/frontend test && npm --prefix src/frontend run build`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/frontend/src/components/PhotoManager.vue src/frontend/src/components/GalleryViewer.vue src/frontend/src/components/*.spec.ts <popup-file>
git commit -m "feat(web): photo manager + gallery viewer in the popup"
```

---

## Task 17: End-to-end manual verification (local)

**Files:** none (verification only).

- [ ] **Step 1: Run the app**

Use the run-app skill / `node scripts/dev.mjs` (custom ports per memory — never the defaults). Sign in as an editor (requires the Google client id per `docs/ci-cd/google-signin-setup.md`; if unavailable locally, skip the UI auth check and rely on the integration tests for the auth gate).

- [ ] **Step 2: Verify (preview tools)**

Open a person popup as an editor → upload a portrait → confirm the medallion + header update and a file appears under the local `media/uploads/p-XXXX/` folder. Add a gallery photo → confirm it shows in the gallery grid and lightbox. Promote a gallery photo → confirm the portrait swaps and the old portrait moves into the gallery. Delete a photo → confirm it disappears. Use `preview_console_logs`/`preview_network` to confirm no errors and the POST/DELETE return 200.

- [ ] **Step 3: Confirm visitor view**

Sign out → confirm the gallery viewer still renders for visitors but no upload/delete/promote controls are present.

---

## Task 18: Documentation

**Files:**
- Modify: `docs/reference/` (the media + editor-capabilities pages — find the existing media reference)
- Modify: `docs/ci-cd/` (new R2 access-key + Cloud Run secret page, or extend the deploy doc)
- Modify: `README.md` + `CLAUDE.md` overview paragraph

- [ ] **Step 1: Reference docs**

Document the new endpoints (`POST/DELETE/promote`), the processing guarantees (WebP, EXIF-stripped, ≤2000px, thumbnail), accepted formats (jpeg/png/webp; HEIC rejected), the 15 MiB limit, the `uploads/` key convention, and that uploaded photos persist as overrides (not in the seed). Update the QA reference (live-vs-roadmap) to mark photo upload as shipped.

- [ ] **Step 2: CI/CD doc**

Document creating an R2 API token/access key scoped to `family-tree-media` (object read+write), and wiring `R2__AccountId/Bucket/AccessKeyId/SecretAccessKey` as Cloud Run secrets — **one var per `--update-env-vars` call** (PowerShell comma gotcha, per memory). Note `R2__LocalMediaDirectory` is dev-only.

- [ ] **Step 3: Overview**

In `README.md` and `CLAUDE.md`, update the product overview: editors can now upload a portrait and gallery photos in-app; bytes go to R2 via the API; the existing `scripts/upload-media.mjs` bulk path remains for seed media.

- [ ] **Step 4: Commit**

```bash
git add docs README.md CLAUDE.md
git commit -m "docs: editor photo upload (endpoints, R2 setup, overview)"
```

---

## Self-Review

**Spec coverage:**
- Portrait + gallery upload → Tasks 11, 12, 16. ✓
- .NET API writes to R2 (S3 API) → Tasks 8–10 (`R2MediaStore`, DI). ✓
- Re-encode + strip EXIF + auto-orient + cap + **thumbnail** → Task 6. ✓
- Delete a photo → Tasks 11 (`DeletePersonPhotoHandler`), 12, 16. ✓
- Promote gallery → portrait (previous portrait preserved) → Tasks 11, 12, 16. ✓
- Override-layer persistence (Firestore + in-memory), snapshot merge → Tasks 2, 3, 4. ✓
- Seed-vs-uploaded path rule + thumbnails to client → Tasks 4, 7, 13, 15. ✓
- `LocalFileMediaStore` for dev (no R2 creds) → Tasks 8, 10, 17. ✓
- Auth gates (anon/non-editor) → Task 12 integration tests. ✓
- Gallery viewer for visitors → Task 16. ✓
- Config/secrets (R2 keys, request size) → Tasks 9, 10, 18. ✓
- Docs in the same PR → Task 18. ✓
- Non-goals (reorder, captions, video, HEIC) → excluded throughout; HEIC rejection documented (18). ✓

**Open implementation checks flagged inline (resolve during execution, not plan gaps):**
1. `MediaKeyGenerator` namespace — move to Domain if Application doesn't reference Infrastructure (Task 11 note).
2. `PersonSummaryDto` / `family/graph` carries `Portrait` (+ add `PortraitThumb`) for medallions (Task 15 note).
3. Exact `FamilyGraph`/`LifeEvent`/DTO constructor shapes for test fixtures (Tasks 4, 11 notes).
4. `RequestLimits.MaxRequestBodyBytes` current default ≥ 16 MiB (Task 10).
5. AWSSDK R2 payload-signing flag name for the resolved package version (Task 9 note).
6. `R2Options.LocalMediaDirectory` spelling (typo flagged in Task 8).
7. The exact popup component hosting `BiographyEditor` and the store action it calls to replace the open `PersonDetail` (Task 16).

**Type consistency:** `Photo(Id, Full, Thumb)` and `PhotoDto(Id, Full, Thumb)` names match for Mapster auto-map; `PersonMediaOverride(Portrait, Gallery)` used identically across store/merge/handlers; `PhotoRole { Portrait, Gallery }` and the `"portrait"`/`"gallery"` wire strings are bridged in the controller (`Enum.TryParse`, ignoreCase) and delete routes use the literal `"portrait"` target; frontend `resolveMediaUrl` is the single resolver used by medallion, header, gallery, and manager.
