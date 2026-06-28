# Photo Grid Refinements Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make seed media removable (per-person hide), surface the living-portrait video as a grid tile, hide the lone-portrait grid in read-only contexts, and fix two CSS bugs (icon centering, Film badge contrast).

**Architecture:** Seed media can't be physically deleted, so "remove" records the seed key in a new `PersonMediaOverride.HiddenSeeds` list; the snapshot merge omits hidden seeds (portrait → initials fallback, video → null). A new role-based `DELETE …/photos/seed/{role}` endpoint drives suppression. The frontend grid composes a video tile from `portraitVideo`, routes seed/video removal to the new endpoint, and hides itself read-only when it has ≤1 tile.

**Tech Stack:** .NET 10 (MediatR, Mapster, xUnit + Moq + AwesomeAssertions), Vue 3 + TS (Pinia, Vitest + @vue/test-utils), SCSS.

## Global Constraints

- **Seed vs uploaded rule:** a seed key is a **bare filename (no `/`)**; an uploaded key **contains `/`**. Every seed-vs-uploaded decision keys off `Full.Contains('/')` / `key.includes('/')`. Apply identically backend and frontend.
- **Media cap = 5**, counted as `(Portrait?1:0) + Gallery.Count + (PortraitVideo?1:0)` (backend) / `items.length` incl. the video tile (frontend). Constant names: `MaxMediaPerPerson` (handler), `MAX_PHOTOS` (component).
- **Suppression is internal:** `HiddenSeeds` is an `init` property on `PersonMediaOverride` defaulting to `[]`; it is never serialized to the client (the DTO shape is unchanged). No data migration — an absent Firestore field reads back as `[]`.
- **No video upload** — `portraitVideo` is seed-only (always a bare filename). The video tile is never promotable to portrait.
- **Endpoint:** `DELETE /api/people/{id}/photos/seed/{role}`, `role ∈ { portrait, video }`, `[Authorize(Policy = "CanEdit")]`. Unknown role → 400; unknown person → 404.
- **No in-app un-hide.** Removing a seed is permanent for that person (consistent with deleting an uploaded photo).
- **C#:** file-scoped namespaces; brace all control statements; `_camelCase` private readonly fields; `Async` suffix; nullable enabled; structured logging with named placeholders only; **never log PII/secrets** (person id and role are fine; no email/name/token); test naming `<Method>_When<Cond>_Should<Result>`; concise doc comments.
- **Frontend:** `<script setup lang="ts">`; concise TSDoc; `npm run build` runs `vue-tsc` (keep types clean). No new i18n keys (reuse `photos.view` / `photos.remove` / `photos.confirmRemove` / `photos.setPortrait`).
- **Ports:** run the app on non-default ports for any live check (never 5037/5173).

---

### Task 1: Domain `HiddenSeeds` + store persistence

**Files:**
- Modify: `src/backend/FamilyTree.Domain/PersonMediaOverride.cs`
- Modify: `src/backend/FamilyTree.Infrastructure/FirestorePersonOverrideStore.cs`
- Test: `tests/unit/FamilyTree.UnitTests/Infrastructure/InMemoryPersonOverrideStoreTests.cs` (add; create if absent)

**Interfaces:**
- Produces: `PersonMediaOverride(Photo? Portrait, IReadOnlyList<Photo> Gallery) { IReadOnlyList<string> HiddenSeeds { get; init; } = []; }` — the bare seed keys hidden for a person. Construct existing 2-arg form unchanged; add seeds via `with { HiddenSeeds = [...] }`.

- [ ] **Step 1: Write the failing in-memory round-trip test**

Add to `InMemoryPersonOverrideStoreTests.cs` (create the file with this content if it does not exist — match the namespace `FamilyTree.UnitTests.Infrastructure` and the using style of sibling tests):

```csharp
using FamilyTree.Domain;
using FamilyTree.Infrastructure;

namespace FamilyTree.UnitTests.Infrastructure;

public class InMemoryPersonOverrideStoreTests
{
    [Fact]
    public async Task AppendMediaAsync_WhenHiddenSeedsSet_ShouldRoundTripHiddenSeeds()
    {
        var store = new InMemoryPersonOverrideStore();
        var media = new PersonMediaOverride(null, []) { HiddenSeeds = ["p-0001.jpg"] };

        await store.AppendMediaAsync("p-0001", media, "e@x.com", default);
        var latest = await store.GetLatestMediaAsync("p-0001", default);

        latest!.HiddenSeeds.Should().ContainSingle().Which.Should().Be("p-0001.jpg");
    }
}
```

> If the file already exists, append only the `[Fact]` method. AwesomeAssertions + xUnit are global-using'd in the test project; if the new file errors on `Should()`/`Fact`, add `using Xunit;` and `using AwesomeAssertions;` to match a sibling test file.

- [ ] **Step 2: Run — expect FAIL**

Run: `dotnet test tests/unit/FamilyTree.UnitTests --filter InMemoryPersonOverrideStoreTests`
Expected: FAIL (compile error — `HiddenSeeds` does not exist).

- [ ] **Step 3: Add `HiddenSeeds` to the domain record**

Replace the body of `src/backend/FamilyTree.Domain/PersonMediaOverride.cs`:

```csharp
namespace FamilyTree.Domain;

/// <summary>An editor's media override for one person: the portrait (if set), the gallery photos,
/// and the bare seed keys the editor has hidden (seed media can't be deleted, only suppressed).</summary>
public sealed record PersonMediaOverride(Photo? Portrait, IReadOnlyList<Photo> Gallery)
{
    /// <summary>Bare seed filenames (no '/') the editor has hidden for this person — a hidden seed
    /// portrait falls back to an uploaded portrait or initials; a hidden seed video is dropped.</summary>
    public IReadOnlyList<string> HiddenSeeds { get; init; } = [];
}
```

The in-memory store stores the whole record, so it round-trips `HiddenSeeds` with no store change.

- [ ] **Step 4: Run — expect PASS**

Run: `dotnet test tests/unit/FamilyTree.UnitTests --filter InMemoryPersonOverrideStoreTests`
Expected: PASS.

- [ ] **Step 5: Persist `HiddenSeeds` in Firestore**

In `src/backend/FamilyTree.Infrastructure/FirestorePersonOverrideStore.cs`:

In `AddMediaAsync`'s snapshot dictionary (the `AppendMediaAsync` method), add the `hiddenSeeds` field:

```csharp
        var snapshot = new Dictionary<string, object?>
        {
            ["portrait"] = media.Portrait is null ? null : PhotoMap(media.Portrait),
            ["gallery"] = media.Gallery.Select(PhotoMap).ToList(),
            ["hiddenSeeds"] = media.HiddenSeeds.ToList(),
            ["editorEmail"] = editorEmail,
            ["editedAt"] = FieldValue.ServerTimestamp
        };
```

In `MediaFrom`, read it back and attach via `with`:

```csharp
        var gallery = new List<Photo>();
        if (doc.TryGetValue<List<object>>("gallery", out var arr) && arr is not null)
        {
            foreach (var item in arr.OfType<Dictionary<string, object>>())
            {
                gallery.Add(ReadPhoto(item));
            }
        }

        var hiddenSeeds = new List<string>();
        if (doc.TryGetValue<List<object>>("hiddenSeeds", out var hidden) && hidden is not null)
        {
            hiddenSeeds.AddRange(hidden.OfType<string>());
        }

        return new PersonMediaOverride(portrait, gallery) { HiddenSeeds = hiddenSeeds };
```

(`FirestorePersonOverrideStore` is `[ExcludeFromCodeCoverage]` and emulator-verified only — no unit test, consistent with the existing convention. The in-memory test above proves the record carries the field.)

- [ ] **Step 6: Full backend suite + commit**

Run: `dotnet test`
Expected: PASS.

```bash
git add src/backend tests/unit/FamilyTree.UnitTests/Infrastructure/InMemoryPersonOverrideStoreTests.cs
git commit -m "feat(domain): add HiddenSeeds to the per-person media override"
```

---

### Task 2: Media cap counts the living-portrait video

**Files:**
- Modify: `src/backend/FamilyTree.Application/People/AddPersonPhotoHandler.cs:45`
- Test: `tests/unit/FamilyTree.UnitTests/Application/AddPersonPhotoHandlerTests.cs` (add)

**Interfaces:**
- Consumes: `MediaLimitExceededException` (already exists from the prior feature).

- [ ] **Step 1: Write the failing handler test**

Add to `AddPersonPhotoHandlerTests.cs` (reuse the file's `BuildMapper()` / `NewPerson` / Moq setup — mirror the existing `Handle_WhenPersonAlreadyHasFiveMedia_*` test, which constructs the mocks and handler the same way):

```csharp
[Fact]
public async Task Handle_WhenPortraitVideoAndFourPhotosPresent_ShouldThrowMediaLimitExceeded()
{
    var service = new Mock<IFamilyQueryService>();
    var atLimit = NewPerson("p-0001") with
    {
        Portrait = "uploads/p-0001/a.webp",
        PortraitVideo = "p-0001.mp4", // seed video counts toward the cap
        Gallery =
        [
            new Photo("b", "uploads/p-0001/b.webp", "uploads/p-0001/b.thumb.webp"),
            new Photo("c", "uploads/p-0001/c.webp", "uploads/p-0001/c.thumb.webp"),
            new Photo("d", "uploads/p-0001/d.webp", "uploads/p-0001/d.thumb.webp")
        ] // portrait + video + 3 gallery = 5
    };
    service.Setup(s => s.GetPersonAsync("p-0001", It.IsAny<CancellationToken>())).ReturnsAsync(atLimit);
    var processor = new Mock<IImageProcessor>();
    var media = new Mock<IMediaStore>();

    var handler = new AddPersonPhotoHandler(service.Object, Mock.Of<IPersonOverrideStore>(),
        Mock.Of<IFamilySnapshotProvider>(), media.Object, processor.Object, BuildMapper(),
        NullLogger<AddPersonPhotoHandler>.Instance);

    var act = () => handler.Handle(new AddPersonPhotoCommand("p-0001", PhotoRole.Gallery, [1, 2, 3], "e@x.com"), default);

    await act.Should().ThrowAsync<MediaLimitExceededException>();
    processor.Verify(p => p.Process(It.IsAny<ReadOnlyMemory<byte>>()), Times.Never);
}
```

- [ ] **Step 2: Run — expect FAIL**

Run: `dotnet test tests/unit/FamilyTree.UnitTests --filter AddPersonPhotoHandlerTests`
Expected: FAIL (count is 4 without the video, so it doesn't throw).

- [ ] **Step 3: Count the video in the cap check**

In `AddPersonPhotoHandler.Handle`, change the `mediaCount` line (currently line 45):

```csharp
        var mediaCount = (existing.Portrait is not null ? 1 : 0)
            + existing.Gallery.Count
            + (existing.PortraitVideo is not null ? 1 : 0);
```

- [ ] **Step 4: Run — expect PASS**

Run: `dotnet test tests/unit/FamilyTree.UnitTests --filter AddPersonPhotoHandlerTests`
Expected: PASS (new test + the existing cap tests).

- [ ] **Step 5: Commit**

```bash
git add src/backend/FamilyTree.Application/People/AddPersonPhotoHandler.cs tests/unit/FamilyTree.UnitTests/Application/AddPersonPhotoHandlerTests.cs
git commit -m "feat(app): count the living-portrait video toward the 5-item media cap"
```

---

### Task 3: Snapshot merge honors `HiddenSeeds`

**Files:**
- Modify: `src/backend/FamilyTree.Infrastructure/FamilySnapshotProvider.cs` (the media-merge block — currently the `if (media.TryGetValue(person.Id, out var m))` body)
- Test: `tests/unit/FamilyTree.UnitTests/Infrastructure/FamilySnapshotProviderMediaTests.cs` (add)

**Interfaces:**
- Consumes: `PersonMediaOverride.HiddenSeeds` (Task 1). `Person.Portrait`, `Person.PortraitThumb`, `Person.PortraitVideo` (all `string?`).
- Produces: a merged person where a hidden seed portrait → `Portrait` null (no virtual tile), a hidden seed video → `PortraitVideo` null.

- [ ] **Step 1: Write the failing merge tests**

Add to `FamilySnapshotProviderMediaTests.cs` (reuse the file's `Seed(id)` factory + provider-construction helper, exactly as the existing media tests do):

```csharp
[Fact]
public async Task GetAsync_WhenSeedPortraitHidden_ShouldFallBackToNoPortrait()
{
    var loader = new Mock<IFamilyDataLoader>();
    loader.Setup(l => l.LoadAsync(It.IsAny<CancellationToken>()))
        .ReturnsAsync(new FamilyGraph([Seed("p-0001") with { Portrait = "p-0001.jpg" }], []));
    var overrides = new Mock<IPersonOverrideStore>();
    overrides.Setup(o => o.GetLatestBiographiesAsync(It.IsAny<CancellationToken>()))
        .ReturnsAsync(new Dictionary<string, LocalizedText>());
    overrides.Setup(o => o.GetLatestMediaMapAsync(It.IsAny<CancellationToken>()))
        .ReturnsAsync(new Dictionary<string, PersonMediaOverride>
        {
            ["p-0001"] = new(null, []) { HiddenSeeds = ["p-0001.jpg"] }
        });

    var provider = NewProvider(loader, overrides);
    var person = (await provider.GetAsync(default)).People.Single();

    person.Portrait.Should().BeNull();          // hidden seed → initials
    person.Gallery.Should().BeEmpty();          // no virtual seed tile
}

[Fact]
public async Task GetAsync_WhenSeedVideoHidden_ShouldClearPortraitVideo()
{
    var loader = new Mock<IFamilyDataLoader>();
    loader.Setup(l => l.LoadAsync(It.IsAny<CancellationToken>()))
        .ReturnsAsync(new FamilyGraph(
            [Seed("p-0001") with { Portrait = "p-0001.jpg", PortraitVideo = "p-0001.mp4" }], []));
    var overrides = new Mock<IPersonOverrideStore>();
    overrides.Setup(o => o.GetLatestBiographiesAsync(It.IsAny<CancellationToken>()))
        .ReturnsAsync(new Dictionary<string, LocalizedText>());
    overrides.Setup(o => o.GetLatestMediaMapAsync(It.IsAny<CancellationToken>()))
        .ReturnsAsync(new Dictionary<string, PersonMediaOverride>
        {
            ["p-0001"] = new(null, []) { HiddenSeeds = ["p-0001.mp4"] }
        });

    var provider = NewProvider(loader, overrides);
    var person = (await provider.GetAsync(default)).People.Single();

    person.PortraitVideo.Should().BeNull();     // hidden seed video dropped
    person.Portrait.Should().Be("p-0001.jpg");  // portrait seed untouched
}
```

> Match the existing tests' provider construction (inline `Options`/`TimeProvider`/`NullLogger` if there's no `NewProvider` helper). `Seed("p-0001") with { … }` sets seed fields.

- [ ] **Step 2: Run — expect FAIL**

Run: `dotnet test tests/unit/FamilyTree.UnitTests --filter FamilySnapshotProviderMediaTests`
Expected: FAIL (hidden seeds are not yet honored).

- [ ] **Step 3: Honor `HiddenSeeds` in the merge**

Replace the `if (media.TryGetValue(person.Id, out var m))` body in `FamilySnapshotProvider.cs` with:

```csharp
                    if (media.TryGetValue(person.Id, out var m))
                    {
                        var seedPortraitHidden = person.Portrait is not null && m.HiddenSeeds.Contains(person.Portrait);
                        var seedVideoHidden = person.PortraitVideo is not null && m.HiddenSeeds.Contains(person.PortraitVideo);

                        var gallery = m.Gallery;
                        // Surface a displaced, non-hidden seed portrait as a re-selectable virtual gallery
                        // tile. Computed each merge, so clearing the override portrait reverts the seed with
                        // no duplicate; a hidden seed is never surfaced.
                        if (m.Portrait is not null && person.Portrait is not null && !seedPortraitHidden)
                        {
                            gallery = [.. m.Gallery, SeedTile(person.Portrait, person.PortraitThumb)];
                        }
                        updated = updated with
                        {
                            Portrait = m.Portrait?.Full ?? (seedPortraitHidden ? null : updated.Portrait),
                            PortraitThumb = m.Portrait?.Thumb,
                            Gallery = gallery,
                            PortraitVideo = seedVideoHidden ? null : updated.PortraitVideo
                        };
                    }
```

- [ ] **Step 4: Run — expect PASS**

Run: `dotnet test tests/unit/FamilyTree.UnitTests --filter FamilySnapshotProviderMediaTests`
Expected: PASS (new tests + the existing virtual-seed-tile tests, which are unaffected because their overrides have empty `HiddenSeeds`).

- [ ] **Step 5: Commit**

```bash
git add src/backend/FamilyTree.Infrastructure/FamilySnapshotProvider.cs tests/unit/FamilyTree.UnitTests/Infrastructure/FamilySnapshotProviderMediaTests.cs
git commit -m "feat(infra): drop hidden seed portrait/video in the snapshot merge"
```

---

### Task 4: Suppress-seed command, handler & endpoint

**Files:**
- Create: `src/backend/FamilyTree.Application/People/SuppressSeedMediaCommand.cs`
- Create: `src/backend/FamilyTree.Application/People/SuppressSeedMediaHandler.cs`
- Modify: `src/backend/FamilyTree.Api/Controllers/PeopleController.cs` (add the endpoint after `PromoteGalleryPhoto`)
- Test: `tests/unit/FamilyTree.UnitTests/Application/SuppressSeedMediaHandlerTests.cs` (create); `tests/integration/FamilyTree.IntegrationTests/PhotoEndpointsTests.cs` (add)

**Interfaces:**
- Consumes: `IFamilyQueryService.GetPersonAsync(id, ct)` → `Person?` (domain entity with `Portrait`/`PortraitVideo`/`Gallery`); `IPersonOverrideStore`; `IFamilySnapshotProvider.RefreshAsync`; `IMapper`. `PersonMediaOverride.HiddenSeeds` (Task 1).
- Produces: `SuppressSeedMediaCommand(string Id, string Role, string EditorEmail) : IRequest<PersonDto?>`; `DELETE /api/people/{id}/photos/seed/{role}`.

- [ ] **Step 1: Write the failing handler tests**

Create `SuppressSeedMediaHandlerTests.cs` (mirror `PromotePersonPhotoHandlerTests` for `BuildMapper()` / `NewPerson` / mock setup — copy its using block and helpers):

```csharp
using FamilyTree.Application.Abstractions;
using FamilyTree.Application.People;
using FamilyTree.Domain;
using Microsoft.Extensions.Logging.Abstractions;
using Moq;

namespace FamilyTree.UnitTests.Application;

public class SuppressSeedMediaHandlerTests
{
    // BuildMapper(): copy the helper from PromotePersonPhotoHandlerTests (same Mapster config).
    // NewPerson(id): copy the helper used by the other People handler tests.

    [Fact]
    public async Task Handle_WhenHidingActiveSeedPortrait_ShouldAddSeedKeyToHiddenSeeds()
    {
        var service = new Mock<IFamilyQueryService>();
        service.Setup(s => s.GetPersonAsync("p-0001", It.IsAny<CancellationToken>()))
            .ReturnsAsync(NewPerson("p-0001") with { Portrait = "p-0001.jpg" }); // seed portrait active
        var overrides = new Mock<IPersonOverrideStore>();
        overrides.Setup(o => o.GetLatestMediaAsync("p-0001", It.IsAny<CancellationToken>()))
            .ReturnsAsync((PersonMediaOverride?)null);
        var snapshot = new Mock<IFamilySnapshotProvider>();

        var handler = new SuppressSeedMediaHandler(service.Object, overrides.Object, snapshot.Object,
            BuildMapper(), NullLogger<SuppressSeedMediaHandler>.Instance);
        await handler.Handle(new SuppressSeedMediaCommand("p-0001", "portrait", "e@x.com"), default);

        overrides.Verify(o => o.AppendMediaAsync("p-0001",
            It.Is<PersonMediaOverride>(mo => mo.HiddenSeeds.Count == 1 && mo.HiddenSeeds[0] == "p-0001.jpg"),
            "e@x.com", It.IsAny<CancellationToken>()), Times.Once);
    }

    [Fact]
    public async Task Handle_WhenHidingSeedVideo_ShouldAddVideoKeyToHiddenSeeds()
    {
        var service = new Mock<IFamilyQueryService>();
        service.Setup(s => s.GetPersonAsync("p-0001", It.IsAny<CancellationToken>()))
            .ReturnsAsync(NewPerson("p-0001") with { PortraitVideo = "p-0001.mp4" });
        var overrides = new Mock<IPersonOverrideStore>();
        overrides.Setup(o => o.GetLatestMediaAsync("p-0001", It.IsAny<CancellationToken>()))
            .ReturnsAsync((PersonMediaOverride?)null);

        var handler = new SuppressSeedMediaHandler(service.Object, overrides.Object,
            new Mock<IFamilySnapshotProvider>().Object, BuildMapper(),
            NullLogger<SuppressSeedMediaHandler>.Instance);
        await handler.Handle(new SuppressSeedMediaCommand("p-0001", "video", "e@x.com"), default);

        overrides.Verify(o => o.AppendMediaAsync("p-0001",
            It.Is<PersonMediaOverride>(mo => mo.HiddenSeeds.Contains("p-0001.mp4")),
            "e@x.com", It.IsAny<CancellationToken>()), Times.Once);
    }

    [Fact]
    public async Task Handle_WhenNoSuchSeed_ShouldNotAppend()
    {
        var service = new Mock<IFamilyQueryService>();
        service.Setup(s => s.GetPersonAsync("p-0001", It.IsAny<CancellationToken>()))
            .ReturnsAsync(NewPerson("p-0001") with { Portrait = "uploads/p-0001/a.webp" }); // uploaded, not seed
        var overrides = new Mock<IPersonOverrideStore>();
        overrides.Setup(o => o.GetLatestMediaAsync("p-0001", It.IsAny<CancellationToken>()))
            .ReturnsAsync((PersonMediaOverride?)null);

        var handler = new SuppressSeedMediaHandler(service.Object, overrides.Object,
            new Mock<IFamilySnapshotProvider>().Object, BuildMapper(),
            NullLogger<SuppressSeedMediaHandler>.Instance);
        await handler.Handle(new SuppressSeedMediaCommand("p-0001", "video", "e@x.com"), default);

        overrides.Verify(o => o.AppendMediaAsync(It.IsAny<string>(), It.IsAny<PersonMediaOverride>(),
            It.IsAny<string>(), It.IsAny<CancellationToken>()), Times.Never);
    }
}
```

- [ ] **Step 2: Run — expect FAIL**

Run: `dotnet test tests/unit/FamilyTree.UnitTests --filter SuppressSeedMediaHandlerTests`
Expected: FAIL (`SuppressSeedMediaCommand` / handler do not exist).

- [ ] **Step 3: Create the command**

`src/backend/FamilyTree.Application/People/SuppressSeedMediaCommand.cs`:

```csharp
namespace FamilyTree.Application.People;

/// <summary>Hides a person's seed portrait or seed video (the seed file is never deleted, only suppressed).</summary>
/// <param name="Id">The person's identifier.</param>
/// <param name="Role"><c>"portrait"</c> or <c>"video"</c> — which seed to hide.</param>
/// <param name="EditorEmail">Email of the authenticated editor — stored on the revision, not logged.</param>
public sealed record SuppressSeedMediaCommand(string Id, string Role, string EditorEmail)
    : IRequest<PersonDto?>;
```

- [ ] **Step 4: Create the handler**

`src/backend/FamilyTree.Application/People/SuppressSeedMediaHandler.cs`:

```csharp
using FamilyTree.Application.Abstractions;
using Microsoft.Extensions.Logging;

namespace FamilyTree.Application.People;

/// <summary>Records a seed portrait or seed video as hidden for one person, then refreshes the snapshot.</summary>
public sealed class SuppressSeedMediaHandler : IRequestHandler<SuppressSeedMediaCommand, PersonDto?>
{
    private readonly IFamilyQueryService _service;
    private readonly IPersonOverrideStore _overrides;
    private readonly IFamilySnapshotProvider _snapshot;
    private readonly IMapper _mapper;
    private readonly ILogger<SuppressSeedMediaHandler> _logger;

    public SuppressSeedMediaHandler(
        IFamilyQueryService service,
        IPersonOverrideStore overrides,
        IFamilySnapshotProvider snapshot,
        IMapper mapper,
        ILogger<SuppressSeedMediaHandler> logger)
    {
        _service = service;
        _overrides = overrides;
        _snapshot = snapshot;
        _mapper = mapper;
        _logger = logger;
    }

    public async Task<PersonDto?> Handle(SuppressSeedMediaCommand request, CancellationToken cancellationToken)
    {
        var existing = await _service.GetPersonAsync(request.Id, cancellationToken);
        if (existing is null)
        {
            return null;
        }

        var seedKey = ResolveSeedKey(existing, request.Role);
        if (seedKey is null)
        {
            // Nothing to hide (no such seed) — return the current merged person unchanged.
            return _mapper.Map<PersonDto>(existing);
        }

        var current = await _overrides.GetLatestMediaAsync(request.Id, cancellationToken)
            ?? new PersonMediaOverride(null, []);
        if (current.HiddenSeeds.Contains(seedKey))
        {
            return _mapper.Map<PersonDto>(existing); // already hidden — idempotent no-op
        }

        var next = current with { HiddenSeeds = [.. current.HiddenSeeds, seedKey] };
        await _overrides.AppendMediaAsync(request.Id, next, request.EditorEmail, cancellationToken);
        await _snapshot.RefreshAsync(cancellationToken);

        var merged = await _service.GetPersonAsync(request.Id, cancellationToken);
        _logger.LogInformation("Seed media hidden for person {PersonId} (role={Role}).", request.Id, request.Role);
        return merged is null ? null : _mapper.Map<PersonDto>(merged);
    }

    /// <summary>Recovers the bare seed key to hide from the merged person: the active bare-filename
    /// portrait or the displaced virtual seed gallery tile (role=portrait), or the seed video (role=video).</summary>
    private static string? ResolveSeedKey(Person person, string role) => role switch
    {
        "portrait" => person.Portrait is { } p && !p.Contains('/')
            ? p
            : person.Gallery.FirstOrDefault(g => !g.Full.Contains('/'))?.Full,
        "video" => person.PortraitVideo,
        _ => null
    };
}
```

> `Person` and `Photo` resolve via the Application project's `global using FamilyTree.Domain;` (the other handlers use `Person` unqualified). If the build can't find `Person`, confirm that global using exists.

- [ ] **Step 5: Run — expect PASS**

Run: `dotnet test tests/unit/FamilyTree.UnitTests --filter SuppressSeedMediaHandlerTests`
Expected: PASS.

- [ ] **Step 6: Add the controller endpoint**

In `PeopleController.cs`, add after the `PromoteGalleryPhoto` method (before the closing brace of the class):

```csharp
    [HttpDelete("{id}/photos/seed/{role}")]
    [Authorize(Policy = "CanEdit")]
    public async Task<ActionResult<PersonDto>> SuppressSeedMedia(string id, string role, CancellationToken cancellationToken)
    {
        if (role is not ("portrait" or "video"))
        {
            return BadRequest(new { title = "role must be 'portrait' or 'video'." });
        }

        var editorEmail = User.FindFirstValue(ClaimTypes.Email) ?? "";
        var person = await _sender.Send(new SuppressSeedMediaCommand(id, role, editorEmail), cancellationToken);
        return person is null ? NotFound() : Ok(person);
    }
```

- [ ] **Step 7: Write the failing integration tests**

Add to `PhotoEndpointsTests.cs` (reuse `_factory.CreateCookieClient()`, the editor sign-in pattern via `FakeGoogleIdTokenValidator.EditorIdToken` + `LoginRequest`, and a guest client — match the existing 403/404 tests in the file):

```csharp
[Fact]
public async Task SuppressSeed_WhenGuest_ShouldReturn403()
{
    var client = _factory.CreateCookieClient(); // not signed in
    var response = await client.DeleteAsync("/api/people/p-0001/photos/seed/portrait");
    response.StatusCode.Should().Be(HttpStatusCode.Forbidden);
}

[Fact]
public async Task SuppressSeed_WhenInvalidRole_ShouldReturn400()
{
    var client = _factory.CreateCookieClient();
    await client.PostAsJsonAsync("/api/auth/session", new LoginRequest(FakeGoogleIdTokenValidator.EditorIdToken));
    var response = await client.DeleteAsync("/api/people/p-0001/photos/seed/banner");
    response.StatusCode.Should().Be(HttpStatusCode.BadRequest);
}

[Fact]
public async Task SuppressSeed_WhenUnknownPerson_ShouldReturn404()
{
    var client = _factory.CreateCookieClient();
    await client.PostAsJsonAsync("/api/auth/session", new LoginRequest(FakeGoogleIdTokenValidator.EditorIdToken));
    var response = await client.DeleteAsync("/api/people/p-9999/photos/seed/portrait");
    response.StatusCode.Should().Be(HttpStatusCode.NotFound);
}
```

> Confirm the guest client helper name and the editor-login helper by reading the existing tests in `PhotoEndpointsTests.cs`; match them exactly (the auth-gate 403 test for the upload endpoint is the template). Pick a person id that exists in `Fixtures/family.test.json` for the 400 case and one that doesn't (e.g. `p-9999`) for 404.

- [ ] **Step 8: Run — expect PASS**

Run: `dotnet test tests/integration/FamilyTree.IntegrationTests --filter PhotoEndpointsTests`
Expected: PASS (MediatR auto-discovers the new handler; no DI registration needed).

- [ ] **Step 9: Full backend suite + commit**

Run: `dotnet test`
Expected: PASS.

```bash
git add src/backend tests/unit/FamilyTree.UnitTests/Application/SuppressSeedMediaHandlerTests.cs tests/integration/FamilyTree.IntegrationTests/PhotoEndpointsTests.cs
git commit -m "feat(api): add DELETE photos/seed/{role} to hide seed portrait or video"
```

---

### Task 5: Frontend — video tile, removable seeds, read-only hide

**Files:**
- Modify: `src/frontend/src/api/photosApi.ts`
- Modify: `src/frontend/src/components/PersonPhotos.vue`
- Test: `src/frontend/src/components/PersonPhotos.spec.ts` (add)

**Interfaces:**
- Consumes: `DELETE /api/people/{id}/photos/seed/{role}` (Task 4); `PersonDetail.portraitVideo: string | null`; `resolveMediaUrl`; `MediaItem` (`{ kind: 'video'|'image'; src; poster? }`).
- Produces: `suppressSeed(personId, role: 'portrait' | 'video', baseUrl?)` in `photosApi`.

- [ ] **Step 1: Add the failing tests**

Append to `PersonPhotos.spec.ts` (reuse its `empty` fixture + `mountPhotos(detail, canEdit)` helper; if `suppressSeed` needs mocking, mock the `photosApi` module the same way the file already mocks `uploadPhoto`/`deleteGalleryPhoto` — match the existing `vi.mock('../api/photosApi', …)` block and add `suppressSeed: vi.fn()` returning a `PersonDetail`):

```ts
it('renders a removable video tile (no set-portrait star) when portraitVideo is set', () => {
  const withVideo: PersonDetail = {
    ...empty,
    portrait: 'uploads/p-0001/p.webp', portraitThumb: 'uploads/p-0001/p.thumb.webp',
    portraitVideo: 'p-0001.mp4'
  };
  const w = mountPhotos(withVideo, true);
  expect(w.find('[data-test="remove-portrait-video"]').exists()).toBe(true);     // removable
  expect(w.find('[data-test="set-portrait-null"]').exists()).toBe(false);        // no star on the video
});

it('makes a seed gallery tile removable (it was not before)', () => {
  const seedInGallery: PersonDetail = {
    ...empty,
    portrait: 'uploads/p-0001/h1.webp', portraitThumb: 'uploads/p-0001/h1.thumb.webp',
    gallery: [{ id: 'seed-abc', full: 'p-0001.jpg', thumb: 'p-0001.jpg' }]
  };
  const w = mountPhotos(seedInGallery, true);
  expect(w.find('[data-test="remove-seed-abc"]').exists()).toBe(true);           // now removable
  expect(w.find('[data-test="set-portrait-seed-abc"]').exists()).toBe(true);     // still promotable
});

it('hides the read-only grid when it would show only the single portrait tile', () => {
  const onePhoto: PersonDetail = { ...empty, portrait: 'uploads/p-0001/p.webp' };
  expect(mountPhotos(onePhoto, false).find('[data-test="person-photos"]').exists()).toBe(false);

  const twoPhotos: PersonDetail = {
    ...onePhoto,
    gallery: [{ id: 'g1', full: 'uploads/p-0001/g.webp', thumb: 'uploads/p-0001/g.thumb.webp' }]
  };
  expect(mountPhotos(twoPhotos, false).find('[data-test="person-photos"]').exists()).toBe(true);
  // editor always sees the grid even with one tile:
  expect(mountPhotos(onePhoto, true).find('[data-test="person-photos"]').exists()).toBe(true);
});
```

> The remove-button `data-test` is `remove-${tile.key}`; the portrait-video tile's key is `portrait-video`, and a seed gallery tile keeps its id key (`seed-abc`). The star `data-test` is `set-portrait-${tile.galleryId}` (the video tile has `galleryId: null`, so the absence check uses `set-portrait-null`).

- [ ] **Step 2: Run — expect FAIL**

Run: `npm --prefix src/frontend test -- PersonPhotos`
Expected: FAIL (no video tile; seed gallery tile not removable; read-only grid still shows at 1 item).

- [ ] **Step 3: Add `suppressSeed` to the API**

Append to `src/frontend/src/api/photosApi.ts`:

```ts
/**
 * Hides a person's seed portrait or seed video (a per-person suppression — the seed
 * file is never deleted). Returns the updated `PersonDetail`.
 *
 * @param personId - The person's ID.
 * @param role - `'portrait'` or `'video'`.
 * @param baseUrl - Optional base URL prefix.
 * @throws If the response is not OK.
 */
export async function suppressSeed(
  personId: string,
  role: 'portrait' | 'video',
  baseUrl = ''
): Promise<PersonDetail> {
  const response = await fetch(`${baseUrl}/api/people/${personId}/photos/seed/${role}`, {
    method: 'DELETE',
    credentials: 'include'
  });
  return asPersonDetail(response, 'hide seed media');
}
```

- [ ] **Step 4: Rework the tile model in `PersonPhotos.vue`**

In the `<script setup>`: add `suppressSeed` to the `photosApi` import, extend `PhotoTile`, and rebuild `items` + `lightboxItems` + `onRemove`.

Import — add `suppressSeed`:

```ts
import {
  uploadPhoto,
  deletePortrait,
  deleteGalleryPhoto,
  promoteGalleryPhoto,
  suppressSeed
} from '../api/photosApi';
```

Extend the `PhotoTile` interface:

```ts
interface PhotoTile {
  key: string;
  thumbUrl: string;
  fullUrl: string;
  isPortrait: boolean;
  galleryId: string | null;
  removable: boolean;
  kind: 'image' | 'video';
  seed: boolean;
}
```

Replace the `items` computed:

```ts
const items = computed<PhotoTile[]>(() => {
  const list: PhotoTile[] = [];
  const portrait = props.detail.portrait;
  if (portrait) {
    const thumb = props.detail.portraitThumb ?? portrait;
    list.push({
      key: 'portrait',
      thumbUrl: resolveMediaUrl(thumb),
      fullUrl: resolveMediaUrl(portrait),
      isPortrait: true,
      galleryId: null,
      removable: true,
      kind: 'image',
      seed: !portrait.includes('/')
    });
  }
  const video = props.detail.portraitVideo;
  if (video) {
    list.push({
      key: 'portrait-video',
      thumbUrl: portrait ? resolveMediaUrl(props.detail.portraitThumb ?? portrait) : '',
      fullUrl: resolveMediaUrl(video),
      isPortrait: false,
      galleryId: null,
      removable: true,
      kind: 'video',
      seed: true
    });
  }
  for (const photo of props.detail.gallery) {
    list.push({
      key: photo.id,
      thumbUrl: resolveMediaUrl(photo.thumb),
      fullUrl: resolveMediaUrl(photo.full),
      isPortrait: false,
      galleryId: photo.id,
      removable: true,
      kind: 'image',
      seed: !photo.full.includes('/')
    });
  }
  return list;
});
```

Replace the `lightboxItems` computed so the video tile yields a video item:

```ts
const lightboxItems = computed<MediaItem[]>(() =>
  items.value.map(i =>
    i.kind === 'video'
      ? { kind: 'video' as const, src: i.fullUrl, poster: i.thumbUrl || undefined }
      : { kind: 'image' as const, src: i.fullUrl }
  )
);
```

Replace `onRemove` to route by tile kind:

```ts
function onRemove(tile: PhotoTile): void {
  void run(() => {
    if (tile.kind === 'video') {
      return suppressSeed(props.detail.id, 'video');
    }
    if (tile.seed) {
      return suppressSeed(props.detail.id, 'portrait');
    }
    return tile.galleryId === null
      ? deletePortrait(props.detail.id)
      : deleteGalleryPhoto(props.detail.id, tile.galleryId);
  });
}
```

- [ ] **Step 5: Update the template (read-only hide, star condition, video poster + ▶)**

Change the grid root `v-if` (currently `v-if="canEdit || items.length"`):

```vue
  <div v-if="canEdit || items.length > 1" class="person-photos" data-test="person-photos">
```

Restrict the set-portrait star to non-portrait **image** tiles (currently `v-if="!tile.isPortrait"`):

```vue
          <button
            v-if="!tile.isPortrait && tile.kind === 'image'"
            type="button"
            class="person-photos__act"
            :data-test="`set-portrait-${tile.galleryId}`"
```

Make the tile thumbnail handle a missing poster and overlay a ▶ on video tiles. Replace the `<img …>` inside `.person-photos__open` with:

```vue
          <img v-if="tile.thumbUrl" :src="tile.thumbUrl" class="person-photos__img" alt="" />
          <span v-else class="person-photos__img person-photos__img--placeholder" aria-hidden="true"></span>
          <span v-if="tile.kind === 'video'" class="person-photos__play" aria-hidden="true">▶</span>
```

Add the styles (inside `<style scoped>`):

```scss
.person-photos__img--placeholder { background: var(--parchment-2); }
.person-photos__play {
  position: absolute; inset: 0; display: grid; place-items: center;
  font-size: 20px; color: #fff; text-shadow: 0 1px 3px rgba(0, 0, 0, 0.6);
  pointer-events: none;
}
```

> `.person-photos__open` is already `position: relative`-able via its tile; the play glyph is absolutely positioned over the thumbnail. Keep the existing `data-test="photo-open-${index}"` button and the lightbox wiring unchanged.

- [ ] **Step 6: Run the tests + build**

Run: `npm --prefix src/frontend test -- PersonPhotos`
Expected: PASS (new + existing PersonPhotos tests).

Run: `npm --prefix src/frontend run build`
Expected: PASS (type-check clean).

- [ ] **Step 7: Commit**

```bash
git add src/frontend/src/api/photosApi.ts src/frontend/src/components/PersonPhotos.vue src/frontend/src/components/PersonPhotos.spec.ts
git commit -m "feat(web): video grid tile, removable seeds, hide lone-portrait grid read-only"
```

---

### Task 6: CSS fixes — action-icon centering & Film badge contrast (live-verified)

**Files:**
- Modify: `src/frontend/src/components/PersonPhotos.vue` (styles only)
- Throwaway (created then deleted): a temporary dev harness to view the editor controls without auth.

**Interfaces:** none (CSS only; no script/template behavior change).

- [ ] **Step 1: Stand up a throwaway harness to see the editor controls**

The action icons are editor-gated (`canEdit`), so they don't render for an anonymous live session. Create a temporary route/page that mounts `PersonPhotos` with `:can-edit="true"` and a fixture detail that has a portrait, a `portraitVideo`, and a couple of gallery photos (so star/trash/confirm/cancel/plus/▶ all render). Example — add a temporary `src/frontend/src/views/_PhotoHarness.vue` and a dev-only route, OR (simpler) temporarily set `editable` true on the rail `PersonDossier`. Keep a note of every file you touch so Step 5 reverts them.

Start the app on non-default ports (e.g. `node scripts/dev.mjs --instance 7`), open the harness, and take a baseline `preview_screenshot` of the action buttons zoomed in.

- [ ] **Step 2: Diagnose and fix the centering**

Inspect the computed box of `.person-photos__act` and its `svg` with `preview_inspect`. The buttons are `24px` round, `display: grid; place-items: center`, with a `1px` border and a `14px` svg. Apply the fix and re-screenshot until each glyph is optically centered. Start from this change to `.person-photos__act` (replace the `display`/`place-items` and svg rule):

```scss
.person-photos__act {
  width: 24px; height: 24px; border-radius: 50%;
  display: inline-flex; align-items: center; justify-content: center;
  padding: 0; line-height: 0; cursor: pointer;
  border: 1px solid var(--glass-border);
  background: var(--parchment-2); color: var(--ink-soft);
  &:not(:disabled):hover { background: var(--control-hover); }
  &:focus-visible { outline: 2px solid var(--leaf-deep); outline-offset: 1px; }
  &:disabled { opacity: 0.45; cursor: default; }
  svg { width: 14px; height: 14px; display: block; }
  &--danger { color: var(--umber); }
}
```

If a specific glyph is still off, correct that icon's SVG path so it is symmetric about x=12 within the `0 0 24 24` viewBox (e.g. the check `M5 12l5 5L20 7` spans x 5–20; recenter to `M6 12l4 4L18 8` if needed). Verify all six icons (star, trash, check, cancel, plus, ▶) by screenshot.

- [ ] **Step 3: Fix the "Portrait" badge contrast on the Film (eighties) theme**

The badge (`.person-photos__badge`) uses `background: var(--gilt); color: var(--gilt-deep)`, which reads low-contrast on the dark Film canvas. Find where the theme class is applied to the DOM (the app sets a theme from `uiStore.theme` — `'eighties'` | `'classic'`; locate the class/attribute on the app root, e.g. via `preview_eval('document.documentElement.className')` or grep the app shell). Add a Film-scoped badge override in `PersonPhotos.vue`'s `<style scoped>` using a `:global(...)` selector keyed on that theme class, e.g.:

```scss
:global(.theme-eighties) .person-photos__badge,
:global([data-theme='eighties']) .person-photos__badge {
  background: rgba(20, 22, 24, 0.85);
  color: #f3efe7;
}
```

Keep whichever selector matches the real DOM (delete the other). Verify the badge is legible on the Film theme via `preview_screenshot` (the badge shows for everyone — no auth needed; open a person with a portrait).

- [ ] **Step 4: Run the frontend suite + build**

Run: `npm --prefix src/frontend test -- PersonPhotos && npm --prefix src/frontend run build`
Expected: PASS (CSS-only change; tests still green, types clean).

- [ ] **Step 5: Revert the harness, keep only the CSS**

Remove the temporary harness view/route (or revert the `editable` flip) from Step 1 so the diff contains **only** the `PersonPhotos.vue` style changes. Confirm with `git status` / `git diff --stat` that no harness file remains.

- [ ] **Step 6: Commit**

```bash
git add src/frontend/src/components/PersonPhotos.vue
git commit -m "fix(web): center photo action icons; legible Portrait badge on the Film theme"
```

---

### Task 7: Documentation + final verification

**Files:**
- Modify: `docs/reference/features/person-details.md`
- Verification only: full automated gate.

- [ ] **Step 1: Update the reference doc**

In `docs/reference/features/person-details.md`, update the **Photo grid** section and the relevant QA edge cases to state:
- Seed media (portrait **and** living-portrait video) is now **removable** by editors — a per-person *hide* (`DELETE /api/people/{id}/photos/seed/{role}`, `role = portrait|video`), since the seed file can't be deleted. A hidden seed portrait falls back to an uploaded portrait or **initials**; a hidden seed video disappears from the header, medallion, grid, and lightbox.
- The **living-portrait video** appears as a grid tile (poster + ▶, opens in the lightbox as a video); it is **not** promotable to portrait and **counts toward the 5-item cap** (the cap is `portrait + gallery + video`).
- The read-only grid (rail panel and a visitor's popup) is **hidden when it would show only the single portrait tile** (already shown in the header); it appears once there are ≥2 tiles. Editors always see the grid.
- Correct any now-stale line (e.g. the earlier "a seed portrait shows the badge but no remove action" / "seed media stays managed via the seed" — seeds are now removable via suppression; the seed is hidden per-person, not deleted from `family.json`).

Keep the existing tone and links.

- [ ] **Step 2: Commit the doc**

```bash
git add docs/reference/features/person-details.md
git commit -m "docs: removable seed media, video grid tile, read-only grid hide rule"
```

- [ ] **Step 3: Final verification gate**

Run the full suites and build, report counts:

```bash
dotnet test
npm --prefix src/frontend test
npm --prefix src/frontend run build
```

Expected: all green. (Live editor-gated browser E2E needs the owner's Google OAuth client locally; the CSS items were verified live in Task 6, and the rest is covered by the handler/integration/component tests added in Tasks 1–5 — mirror this branch's established Task 17 approach and note it in the report.)

---

## Self-Review

**Spec coverage:**
- §1 Seed removable (suppression) → Task 1 (`HiddenSeeds` + persistence), Task 3 (merge honors it), Task 4 (endpoint/handler), Task 5 (frontend routing). ✓
- §2 Cap counts video → Task 2. ✓
- §3 Video grid tile → Task 5 (tile model + lightbox video item). ✓
- §4 Read-only hide at ≤1 tile → Task 5 (Step 5 `items.length > 1`). ✓
- §5 CSS centering + Film badge → Task 6. ✓
- Docs → Task 7. ✓

**Placeholder scan:** none — every code step carries complete code; verification steps name exact commands. Task 6's diagnose-live steps include a concrete starting fix plus a screenshot acceptance check (the recurrence risk the spec flagged).

**Type/selector consistency:** `HiddenSeeds: IReadOnlyList<string>` (init, default `[]`) used identically in Domain (Task 1), Firestore map (Task 1), merge (Task 3), handler `with { HiddenSeeds = [.. …] }` (Task 4). The seed rule `!Full.Contains('/')` / `!includes('/')` is identical in the merge, `ResolveSeedKey`, and the frontend tile `seed` flag. `SuppressSeedMediaCommand(Id, Role, EditorEmail)` matches between command, handler, and controller. The endpoint path `…/photos/seed/{role}` matches between controller (Task 4) and `suppressSeed` (Task 5). `role ∈ {portrait, video}` enforced in the controller (400) and switched in `ResolveSeedKey`. Frontend `data-test` selectors (`remove-${key}`, `set-portrait-${galleryId}`, `person-photos`, `remove-portrait-video`, `remove-seed-abc`) match the tests in Task 5.
