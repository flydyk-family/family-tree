# Photo Improvements Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Five fixes to the unified person-photo grid — a 5-item media cap (front + back), an icon-only delete-confirm, centered action icons, live medallion updates on a portrait change, and keeping a displaced seed portrait in the gallery (re-selectable).

**Architecture:** Backend — the upload handler enforces a 5-item cap; the snapshot merge surfaces a displaced seed portrait as a *virtual* gallery tile (computed each merge, no stored state), and the promote handler becomes seed-aware. Frontend — `PersonPhotos.vue` hides the Add tile at the cap, uses an icon confirm, and treats bare-filename gallery tiles as non-removable; a new `familyStore` action mutates the medallion's portrait in place so the tree updates without a relayout.

**Tech Stack:** .NET 10, MediatR, Mapster, FluentValidation, xUnit + Moq + AwesomeAssertions; Vue 3 + TypeScript + Pinia + Vitest.

## Global Constraints

- **Media cap = 5** total grid items per person (portrait + gallery, including a displaced seed tile). One constant each side: `MaxMediaPerPerson` (handler), `MAX_PHOTOS` (`PersonPhotos.vue`); keep both at `5`.
- **Seed-vs-uploaded rule:** a media key containing `/` is an uploaded `uploads/…` key; a bare filename is a seed asset. Uploaded ⇒ removable; seed ⇒ not removable, never deleted from R2.
- **No data migration, no DTO change** — the virtual seed tile exists only in the merged read model.
- **C#:** file-scoped namespaces; `is null`/`is not null`; always brace; structured logging, no PII; `CancellationToken` last; new exceptions in `FamilyTree.Domain` (like `InvalidImageException`). Unit-test naming `<Method>_When<Conditions>_Should<ExpectedResult>`.
- **Backend tests** mirror existing handler tests: `BuildMapper()` (real Mapster via `MappingConfig.Register`) + Moq for `IFamilyQueryService`/`IPersonOverrideStore`/`IFamilySnapshotProvider`/`IMediaStore`/`IImageProcessor` + `NullLogger<T>`. Merge tests mirror `FamilySnapshotProviderMediaTests` (Moq `IFamilyDataLoader` + `IPersonOverrideStore`, real `FamilySnapshotProvider`).
- **Frontend tests:** Vitest, `vi.mock('../api/photosApi', …)`, `i18n` from `../i18n`, `global: { plugins: [i18n], stubs: { teleport: true } }`, file-input trick.
- **i18n parity** across `en`/`ru`/`be` (`messages.spec.ts`).
- Run from repo root (`dotnet test`) and `src/frontend` (`npm test`, `npm run build`). Commit frequently.

---

## File Structure

- **Backend (item 1):** `FamilyTree.Domain/MediaLimitExceededException.cs` (new); `AddPersonPhotoHandler.cs` (cap check); `PeopleController.cs` (catch → 400).
- **Backend (item 5):** `FamilySnapshotProvider.cs` (append virtual seed in the media merge); `PromotePersonPhotoHandler.cs` (seed-aware rewrite); `DeletePersonPhotoHandler.cs` (byte-delete guard).
- **Frontend (items 1,2,3,5-fe):** `PersonPhotos.vue` (cap → hide Add; icon confirm; svg centering; gallery `removable` rule); `i18n/messages/{en,ru,be}.ts` (reword `photos.confirmRemove`).
- **Frontend (item 4):** `stores/familyStore.ts` (`applyPersonMedia`); `components/PersonDossier.vue` (wire it from `onDetailUpdated`).
- **Docs/verify:** `docs/reference/features/person-details.md`; live verification.

---

## Task 1: Backend — media cap of 5 (item 1)

**Files:**
- Create: `src/backend/FamilyTree.Domain/MediaLimitExceededException.cs`
- Modify: `src/backend/FamilyTree.Application/People/AddPersonPhotoHandler.cs`
- Modify: `src/backend/FamilyTree.Api/Controllers/PeopleController.cs`
- Test: `tests/unit/FamilyTree.UnitTests/Application/AddPersonPhotoHandlerTests.cs` (add); `tests/integration/FamilyTree.IntegrationTests/PhotoEndpointsTests.cs` (add)

**Interfaces:**
- Produces: `MediaLimitExceededException(int limit) : Exception`; `AddPersonPhotoHandler` throws it when the person already has `MaxMediaPerPerson` (5) media items; `PeopleController.AddPhoto` maps it to `400`.

- [ ] **Step 1: Write the failing handler test**

Add to `AddPersonPhotoHandlerTests.cs` (reuse the file's existing `BuildMapper()`/Moq setup; if it has a `NewPerson` helper, use it — otherwise construct a `Person` the same way the other tests in the file do):

```csharp
[Fact]
public async Task Handle_WhenPersonAlreadyHasFiveMedia_ShouldThrowMediaLimitExceeded()
{
    var service = new Mock<IFamilyQueryService>();
    var atLimit = NewPerson("p-0001") with
    {
        Portrait = "uploads/p-0001/a.webp",
        Gallery =
        [
            new Photo("b", "uploads/p-0001/b.webp", "uploads/p-0001/b.thumb.webp"),
            new Photo("c", "uploads/p-0001/c.webp", "uploads/p-0001/c.thumb.webp"),
            new Photo("d", "uploads/p-0001/d.webp", "uploads/p-0001/d.thumb.webp"),
            new Photo("e", "uploads/p-0001/e.webp", "uploads/p-0001/e.thumb.webp")
        ] // portrait + 4 gallery = 5
    };
    service.Setup(s => s.GetPersonAsync("p-0001", It.IsAny<CancellationToken>())).ReturnsAsync(atLimit);
    var processor = new Mock<IImageProcessor>();
    var media = new Mock<IMediaStore>();

    var handler = new AddPersonPhotoHandler(service.Object, Mock.Of<IPersonOverrideStore>(),
        Mock.Of<IFamilySnapshotProvider>(), media.Object, processor.Object, BuildMapper(),
        NullLogger<AddPersonPhotoHandler>.Instance);

    var act = () => handler.Handle(new AddPersonPhotoCommand("p-0001", PhotoRole.Gallery, [1, 2, 3], "e@x.com"), default);

    await act.Should().ThrowAsync<MediaLimitExceededException>();
    processor.Verify(p => p.Process(It.IsAny<ReadOnlyMemory<byte>>()), Times.Never);   // rejected before processing
    media.Verify(m => m.PutAsync(It.IsAny<string>(), It.IsAny<ReadOnlyMemory<byte>>(), It.IsAny<string>(), It.IsAny<CancellationToken>()), Times.Never);
}
```

> If `NewPerson`/`BuildMapper` differ in the file, match what the existing tests use. `Person` requires `Id`, `GivenName`, `Surname`, `Birth` at minimum.

- [ ] **Step 2: Run — expect FAIL**

Run: `dotnet test tests/unit/FamilyTree.UnitTests --filter AddPersonPhotoHandlerTests`
Expected: FAIL (`MediaLimitExceededException` does not exist).

- [ ] **Step 3: Add the exception and the cap check**

```csharp
// src/backend/FamilyTree.Domain/MediaLimitExceededException.cs
namespace FamilyTree.Domain;

/// <summary>Thrown when adding a photo would exceed the per-person media cap.</summary>
public sealed class MediaLimitExceededException(int limit)
    : Exception($"A person can have at most {limit} photos.");
```

In `AddPersonPhotoHandler.cs`: add the constant beside `WebpContentType`:

```csharp
    private const int MaxMediaPerPerson = 5;
```

and insert the cap check right after the `existing is null` guard (after line 43), before processing:

```csharp
        var mediaCount = (existing.Portrait is not null ? 1 : 0) + existing.Gallery.Count;
        if (mediaCount >= MaxMediaPerPerson)
        {
            throw new MediaLimitExceededException(MaxMediaPerPerson);
        }
```

(`existing.Gallery` already includes any virtual seed tile from the merge, so the count matches the grid.) Add `using FamilyTree.Domain;` if the file does not already pull `Photo`/`Person` from a global using (check the project's `GlobalUsings.cs` — Application has `global using FamilyTree.Domain;`, so no new using is needed).

- [ ] **Step 4: Run — expect PASS**

Run: `dotnet test tests/unit/FamilyTree.UnitTests --filter AddPersonPhotoHandlerTests`
Expected: PASS.

- [ ] **Step 5: Map the exception to 400 in the controller**

In `PeopleController.AddPhoto`, broaden the existing `catch (InvalidImageException ex)` to also handle the new exception (add a second catch above/below it):

```csharp
        catch (MediaLimitExceededException ex)
        {
            return BadRequest(new { title = ex.Message });
        }
```

(`using FamilyTree.Domain;` is already present for `InvalidImageException`.)

- [ ] **Step 6: Write + run the failing integration test**

Add to `PhotoEndpointsTests.cs` (uses the existing `AuthApiFactory` + `PngUpload` helper + editor sign-in):

```csharp
[Fact]
public async Task PostPhoto_WhenSixthUpload_ShouldReturn400()
{
    var client = _factory.CreateCookieClient();
    await client.PostAsJsonAsync("/api/auth/session", new LoginRequest(FakeGoogleIdTokenValidator.EditorIdToken));

    // p-0002 has no seed portrait in the fixture; upload 5 gallery photos (the cap), then a 6th.
    for (var i = 0; i < 5; i++)
    {
        using var ok = PngUpload("gallery");
        (await client.PostAsync("/api/people/p-0002/photos", ok)).StatusCode.Should().Be(HttpStatusCode.OK);
    }

    using var overflow = PngUpload("gallery");
    var response = await client.PostAsync("/api/people/p-0002/photos", overflow);
    response.StatusCode.Should().Be(HttpStatusCode.BadRequest);
}
```

> Confirm `p-0002` exists in `tests/integration/FamilyTree.IntegrationTests/Fixtures/family.test.json` and pick a person with no seed portrait (so the 5 gallery uploads reach the cap exactly). If every fixture person has a seed portrait, use one and upload 4 gallery photos (portrait+4 = 5) then a 5th gallery → 400; adjust the loop count and assertion accordingly. Each `PngUpload` is a fresh 64×64 PNG, so the 5 uploads produce distinct content hashes.

Run: `dotnet test tests/integration/FamilyTree.IntegrationTests --filter PhotoEndpointsTests`
Expected: PASS (after the controller change).

- [ ] **Step 7: Full backend suite + commit**

Run: `dotnet test`
Expected: PASS.

```bash
git add src/backend tests/unit/FamilyTree.UnitTests/Application/AddPersonPhotoHandlerTests.cs tests/integration/FamilyTree.IntegrationTests/PhotoEndpointsTests.cs
git commit -m "feat(api): cap person media at 5 with a 400 on overflow"
```

---

## Task 2: Backend — seed portrait stays in the gallery, re-selectable (item 5)

**Files:**
- Modify: `src/backend/FamilyTree.Infrastructure/FamilySnapshotProvider.cs:116-135`
- Modify: `src/backend/FamilyTree.Application/People/PromotePersonPhotoHandler.cs`
- Modify: `src/backend/FamilyTree.Application/People/DeletePersonPhotoHandler.cs:85-89`
- Test: `tests/unit/FamilyTree.UnitTests/Infrastructure/FamilySnapshotProviderMediaTests.cs` (add); `tests/unit/FamilyTree.UnitTests/Application/PromotePersonPhotoHandlerTests.cs` (add)

**Interfaces:**
- Produces: the merged person's `Gallery` includes a virtual seed `Photo` (`full` = the seed filename, no `/`) whenever an uploaded override portrait displaces a seed portrait. `PromotePersonPhotoHandler` finds its target in the **merged** gallery and special-cases the seed.

- [ ] **Step 1: Write the failing merge tests**

Add to `FamilySnapshotProviderMediaTests.cs` (mirror the file's existing setup — a Moq `IFamilyDataLoader` returning a `FamilyGraph`, a Moq `IPersonOverrideStore` returning the media map, and a real `FamilySnapshotProvider`):

```csharp
[Fact]
public async Task GetAsync_WhenOverridePortraitDisplacesSeed_ShouldSurfaceSeedAsVirtualGalleryTile()
{
    var loader = new Mock<IFamilyDataLoader>();
    loader.Setup(l => l.LoadAsync(It.IsAny<CancellationToken>()))
        .ReturnsAsync(new FamilyGraph([Seed("p-0001") with { Portrait = "p-0001.jpg" }], []));
    var overrides = new Mock<IPersonOverrideStore>();
    overrides.Setup(o => o.GetLatestBiographiesAsync(It.IsAny<CancellationToken>()))
        .ReturnsAsync(new Dictionary<string, LocalizedText>());
    var portrait = new Photo("h1", "uploads/p-0001/h1.webp", "uploads/p-0001/h1.thumb.webp");
    overrides.Setup(o => o.GetLatestMediaMapAsync(It.IsAny<CancellationToken>()))
        .ReturnsAsync(new Dictionary<string, PersonMediaOverride> { ["p-0001"] = new(portrait, []) });

    var provider = NewProvider(loader, overrides);
    var person = (await provider.GetAsync(default)).People.Single();

    person.Portrait.Should().Be("uploads/p-0001/h1.webp");
    person.Gallery.Should().ContainSingle();
    person.Gallery[0].Full.Should().Be("p-0001.jpg");          // seed surfaced
    person.Gallery[0].Id.Should().NotBeNullOrEmpty();           // stable synthetic id
}

[Fact]
public async Task GetAsync_WhenSeedIsStillTheEffectivePortrait_ShouldNotAppendVirtualSeed()
{
    var loader = new Mock<IFamilyDataLoader>();
    loader.Setup(l => l.LoadAsync(It.IsAny<CancellationToken>()))
        .ReturnsAsync(new FamilyGraph([Seed("p-0001") with { Portrait = "p-0001.jpg" }], []));
    var overrides = new Mock<IPersonOverrideStore>();
    overrides.Setup(o => o.GetLatestBiographiesAsync(It.IsAny<CancellationToken>()))
        .ReturnsAsync(new Dictionary<string, LocalizedText>());
    var b = new Photo("b", "uploads/p-0001/b.webp", "uploads/p-0001/b.thumb.webp");
    overrides.Setup(o => o.GetLatestMediaMapAsync(It.IsAny<CancellationToken>()))
        .ReturnsAsync(new Dictionary<string, PersonMediaOverride> { ["p-0001"] = new(null, [b]) }); // portrait override null

    var provider = NewProvider(loader, overrides);
    var person = (await provider.GetAsync(default)).People.Single();

    person.Portrait.Should().Be("p-0001.jpg");       // seed is still the portrait
    person.Gallery.Should().ContainSingle().Which.Id.Should().Be("b"); // only the uploaded photo, no virtual seed
}
```

> Reuse the file's existing `Seed(id)` factory and the provider-construction helper. If the file builds the provider inline (Options/TimeProvider/NullLogger) rather than via a `NewProvider` helper, do the same inline — match the existing tests exactly. `Seed("p-0001") with { Portrait = "p-0001.jpg" }` sets the seed portrait.

- [ ] **Step 2: Run — expect FAIL**

Run: `dotnet test tests/unit/FamilyTree.UnitTests --filter FamilySnapshotProviderMediaTests`
Expected: FAIL (gallery does not yet include the virtual seed).

- [ ] **Step 3: Append the virtual seed in the merge**

In `FamilySnapshotProvider.cs`, replace the media-merge block (lines 125-133) with:

```csharp
                    if (media.TryGetValue(person.Id, out var m))
                    {
                        var gallery = m.Gallery;
                        // When an uploaded portrait displaces a seed portrait, surface the seed as a
                        // virtual gallery tile so it stays visible and re-selectable. Computed each
                        // merge, so clearing the override portrait reverts the seed with no duplicate.
                        if (m.Portrait is not null && person.Portrait is not null)
                        {
                            gallery = [.. m.Gallery, SeedTile(person.Portrait, person.PortraitThumb)];
                        }
                        updated = updated with
                        {
                            Portrait = m.Portrait?.Full ?? updated.Portrait,
                            PortraitThumb = m.Portrait?.Thumb,
                            Gallery = gallery
                        };
                    }
```

Add a private static helper (near the bottom of the class) plus the two `using`s it needs (`System.Security.Cryptography`, `System.Text`) at the top of the file:

```csharp
    /// <summary>Builds the virtual gallery tile for a displaced seed portrait. Its key is a bare
    /// filename (no '/'), which the editor UI and the promote/delete handlers use to recognize a
    /// seed (never deletable, re-selectable). The id is deterministic so the front end can promote it.</summary>
    private static Photo SeedTile(string seedFull, string? seedThumb)
    {
        var hash = SHA256.HashData(Encoding.UTF8.GetBytes(seedFull));
        var id = "seed-" + Convert.ToHexStringLower(hash)[..16];
        return new Photo(id, seedFull, seedThumb ?? seedFull);
    }
```

- [ ] **Step 4: Run — expect PASS**

Run: `dotnet test tests/unit/FamilyTree.UnitTests --filter FamilySnapshotProviderMediaTests`
Expected: PASS.

- [ ] **Step 5: Write the failing promote tests**

Add to `PromotePersonPhotoHandlerTests.cs` (reuse `BuildMapper()`/`NewPerson`/Moq setup from the file):

```csharp
[Fact]
public async Task Handle_WhenPromotingUploadedPhotoOverSeed_ShouldSetPortraitAndLeaveSeedToMerge()
{
    var a = new Photo("a", "uploads/p-0001/a.webp", "uploads/p-0001/a.thumb.webp");
    var service = new Mock<IFamilyQueryService>();
    // Merged person: seed is the portrait, A is in the gallery (override portrait is null).
    service.Setup(s => s.GetPersonAsync("p-0001", It.IsAny<CancellationToken>()))
        .ReturnsAsync(NewPerson("p-0001") with { Portrait = "p-0001.jpg", Gallery = [a] });
    var overrides = new Mock<IPersonOverrideStore>();
    overrides.Setup(o => o.GetLatestMediaAsync("p-0001", It.IsAny<CancellationToken>()))
        .ReturnsAsync(new PersonMediaOverride(null, [a]));
    var snapshot = new Mock<IFamilySnapshotProvider>();

    var handler = new PromotePersonPhotoHandler(service.Object, overrides.Object, snapshot.Object,
        BuildMapper(), NullLogger<PromotePersonPhotoHandler>.Instance);
    await handler.Handle(new PromotePersonPhotoCommand("p-0001", "a", "e@x.com"), default);

    overrides.Verify(o => o.AppendMediaAsync("p-0001",
        It.Is<PersonMediaOverride>(mo => mo.Portrait!.Id == "a" && mo.Gallery.Count == 0),
        "e@x.com", It.IsAny<CancellationToken>()), Times.Once);
}

[Fact]
public async Task Handle_WhenPromotingTheVirtualSeed_ShouldClearPortraitAndMoveUploadedToGallery()
{
    var a = new Photo("a", "uploads/p-0001/a.webp", "uploads/p-0001/a.thumb.webp");
    var seedTile = new Photo("seed-abc", "p-0001.jpg", "p-0001.jpg");
    var service = new Mock<IFamilyQueryService>();
    // Merged person: A is the portrait, the gallery holds the virtual seed (full has no '/').
    service.Setup(s => s.GetPersonAsync("p-0001", It.IsAny<CancellationToken>()))
        .ReturnsAsync(NewPerson("p-0001") with { Portrait = "uploads/p-0001/a.webp", Gallery = [seedTile] });
    var overrides = new Mock<IPersonOverrideStore>();
    overrides.Setup(o => o.GetLatestMediaAsync("p-0001", It.IsAny<CancellationToken>()))
        .ReturnsAsync(new PersonMediaOverride(a, [])); // override portrait A, no gallery
    var snapshot = new Mock<IFamilySnapshotProvider>();

    var handler = new PromotePersonPhotoHandler(service.Object, overrides.Object, snapshot.Object,
        BuildMapper(), NullLogger<PromotePersonPhotoHandler>.Instance);
    await handler.Handle(new PromotePersonPhotoCommand("p-0001", "seed-abc", "e@x.com"), default);

    // Override portrait cleared (merge falls back to the seed); A moved into the gallery.
    overrides.Verify(o => o.AppendMediaAsync("p-0001",
        It.Is<PersonMediaOverride>(mo => mo.Portrait == null && mo.Gallery.Count == 1 && mo.Gallery[0].Id == "a"),
        "e@x.com", It.IsAny<CancellationToken>()), Times.Once);
}
```

- [ ] **Step 6: Run — expect FAIL, then rewrite the promote handler**

Run: `dotnet test tests/unit/FamilyTree.UnitTests --filter PromotePersonPhotoHandlerTests`
Expected: FAIL (current handler looks in the override gallery and can't find the virtual seed; the uploaded-over-seed case also still pushes the wrong gallery).

Replace the body of `PromotePersonPhotoHandler.Handle` (lines 29-60) with:

```csharp
    public async Task<PersonDto?> Handle(PromotePersonPhotoCommand request, CancellationToken cancellationToken)
    {
        var existing = await _service.GetPersonAsync(request.Id, cancellationToken);
        if (existing is null)
        {
            return null;
        }

        // Find the target in the MERGED gallery — it includes the virtual seed tile.
        var target = existing.Gallery.FirstOrDefault(p => p.Id == request.PhotoId);
        if (target is null)
        {
            return _mapper.Map<PersonDto>(existing);
        }

        var current = await _overrides.GetLatestMediaAsync(request.Id, cancellationToken)
            ?? new PersonMediaOverride(null, []);

        PersonMediaOverride next;
        if (!target.Full.Contains('/'))
        {
            // Re-select the seed as portrait: clear the override portrait (the merge falls back to
            // the seed) and move the currently-uploaded portrait into the override gallery front.
            var gallery = current.Portrait is null
                ? current.Gallery.ToList()
                : [current.Portrait, .. current.Gallery];
            next = new PersonMediaOverride(null, gallery);
        }
        else
        {
            // Promote an uploaded gallery photo to portrait; move the previous override portrait (if
            // any) to the gallery front. A previous SEED portrait needs nothing — the merge re-adds it.
            var gallery = current.Gallery.Where(p => p.Id != target.Id).ToList();
            if (current.Portrait is not null)
            {
                gallery.Insert(0, current.Portrait);
            }
            next = new PersonMediaOverride(target, gallery);
        }

        await _overrides.AppendMediaAsync(request.Id, next, request.EditorEmail, cancellationToken);
        await _snapshot.RefreshAsync(cancellationToken);

        var merged = await _service.GetPersonAsync(request.Id, cancellationToken);
        _logger.LogInformation("Gallery photo promoted to portrait for person {PersonId}.", request.Id);
        return merged is null ? null : _mapper.Map<PersonDto>(merged);
    }
```

Update the class doc-comment (line 6) to: `<summary>Promotes a gallery photo to portrait; the previous portrait moves to the gallery (a displaced seed is re-surfaced by the merge). The seed itself is re-selectable.</summary>`.

- [ ] **Step 7: Run — expect PASS (promote tests + the existing promote tests)**

Run: `dotnet test tests/unit/FamilyTree.UnitTests --filter PromotePersonPhotoHandlerTests`
Expected: PASS. If a pre-existing promote test asserted the old "push previous portrait" behavior for the seed case, update it to the new behavior (the merge handles the seed) — keep tests for uploaded-photo promotion unchanged.

- [ ] **Step 8: Guard seed keys in the delete byte-cleanup**

In `DeletePersonPhotoHandler.BestEffortDeleteAsync`, change the `stillUsed` guard (lines 79-83) to also skip bare-filename (seed) keys — defense in depth, so a seed asset is never deleted from R2:

```csharp
        var stillUsed = next.Portrait?.Id == removed.Id || next.Gallery.Any(p => p.Id == removed.Id);
        if (stillUsed || !removed.Full.Contains('/'))
        {
            return;
        }
```

- [ ] **Step 9: Full backend suite + commit**

Run: `dotnet test`
Expected: PASS.

```bash
git add src/backend tests/unit/FamilyTree.UnitTests
git commit -m "feat(app): keep a displaced seed portrait as a re-selectable gallery tile"
```

---

## Task 3: Frontend — `PersonPhotos.vue` (cap, icon confirm, centering, seed non-removable)

**Files:**
- Modify: `src/frontend/src/components/PersonPhotos.vue`
- Modify: `src/frontend/src/i18n/messages/en.ts`, `ru.ts`, `be.ts` (reword `photos.confirmRemove`)
- Test: `src/frontend/src/components/PersonPhotos.spec.ts` (add)

**Interfaces:**
- Consumes the `PersonDetail`/gallery shape (unchanged). The seed gallery tile arrives as a `Photo` whose `full` has no `/`.

- [ ] **Step 1: Add the failing tests**

Append to `PersonPhotos.spec.ts` (reuse its fixtures/helpers; add a seed-gallery fixture):

```ts
it('hides the Add tile when the person already has 5 media items', () => {
  const five: PersonDetail = {
    ...empty,
    portrait: 'uploads/p-0001/p.webp', portraitThumb: 'uploads/p-0001/p.thumb.webp',
    gallery: ['a', 'b', 'c', 'd'].map(k => ({ id: k, full: `uploads/p-0001/${k}.webp`, thumb: `uploads/p-0001/${k}.thumb.webp` }))
  };
  const w = mountPhotos(five, true);
  expect(w.findAll('[data-test="photo-open-0"]').length).toBe(1);
  expect(w.find('[data-test="photo-add-input"]').exists()).toBe(false);

  const four: PersonDetail = { ...five, gallery: five.gallery.slice(0, 3) }; // portrait + 3 = 4
  expect(mountPhotos(four, true).find('[data-test="photo-add-input"]').exists()).toBe(true);
});

it('shows a star but no remove on a seed gallery tile (bare filename)', () => {
  const seedInGallery: PersonDetail = {
    ...empty,
    portrait: 'uploads/p-0001/h1.webp', portraitThumb: 'uploads/p-0001/h1.thumb.webp',
    gallery: [{ id: 'seed-abc', full: 'p-0001.jpg', thumb: 'p-0001.jpg' }]
  };
  const w = mountPhotos(seedInGallery, true);
  expect(w.find('[data-test="set-portrait-seed-abc"]').exists()).toBe(true);   // promotable
  expect(w.find('[data-test="remove-seed-abc"]').exists()).toBe(false);        // not removable
});
```

- [ ] **Step 2: Run — expect FAIL**

Run: `npm --prefix src/frontend test -- PersonPhotos`
Expected: FAIL (Add tile still shows at 5; seed tile still shows a remove button).

- [ ] **Step 3: Cap (item 1) + seed non-removable (item 5-fe)**

In `PersonPhotos.vue` script, add the cap constant after the imports (above `const props`):

```ts
const MAX_PHOTOS = 5;
```

Change the gallery-tile `removable` (line 58) from `removable: true` to:

```ts
      removable: photo.full.includes('/')
```

Change the Add `<label>` condition (line 208) from `v-if="canEdit"` to:

```vue
      <label v-if="canEdit && items.length < MAX_PHOTOS" class="person-photos__tile person-photos__add">
```

- [ ] **Step 4: Icon confirm (item 2)**

Replace the confirm text-pill button (lines 176-182) with an icon-only check button (keep the `data-test` and `@click` so existing tests pass):

```vue
              <button
                type="button"
                class="person-photos__act person-photos__act--danger"
                :data-test="`remove-confirm-${tile.key}`"
                :disabled="busy"
                :title="t('photos.confirmRemove')"
                :aria-label="t('photos.confirmRemove')"
                @click="onRemove(tile)"
              >
                <svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12l5 5L20 7"/></svg>
              </button>
```

Delete the now-unused `&--warn` style block (lines 284-288).

Reword `photos.confirmRemove` in all three locales (it is now the confirm icon's label/tooltip, not a visible word):
- `en.ts`: `confirmRemove: 'Confirm remove'`
- `ru.ts`: `confirmRemove: 'Подтвердить удаление'`
- `be.ts`: `confirmRemove: 'Пацвердзіць выдаленне'`

- [ ] **Step 5: Center the action icons (item 3)**

In the `.person-photos__act` rule, change the svg line (line 282) to add `display: block`:

```scss
  svg { width: 14px; height: 14px; display: block; }
```

(`display: block` removes the inline-svg baseline offset that pushed the glyph off-center under `place-items: center`.)

- [ ] **Step 6: Run the tests + build**

Run: `npm --prefix src/frontend test -- PersonPhotos && npm --prefix src/frontend test -- messages`
Expected: PASS (new + existing PersonPhotos tests; locale parity holds).

Run: `npm --prefix src/frontend run build`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/frontend/src/components/PersonPhotos.vue src/frontend/src/components/PersonPhotos.spec.ts src/frontend/src/i18n/messages
git commit -m "feat(web): cap photo grid at 5, icon delete-confirm, center action icons, seed tile non-removable"
```

---

## Task 4: Frontend — live medallion update on a portrait change (item 4)

**Files:**
- Modify: `src/frontend/src/stores/familyStore.ts`
- Modify: `src/frontend/src/components/PersonDossier.vue`
- Test: `src/frontend/src/stores/familyStore.spec.ts` (add or create)

**Interfaces:**
- Produces `familyStore.applyPersonMedia(id: string, portrait: string | null, portraitThumb?: string | null): void` — mutates that person's `portrait`/`portraitThumb` in place in `state.people` so the medallion's `computed` re-renders without a relayout (the layout never reads `.portrait`). `PersonDossier.onDetailUpdated` calls it alongside `selection.applyDetail`.

- [ ] **Step 1: Write the failing store test**

```ts
// src/frontend/src/stores/familyStore.spec.ts (add this test; create the file with the standard Pinia setup if absent)
import { describe, it, expect, beforeEach } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { useFamilyStore } from './familyStore';
import type { PersonSummary } from '../types/family';

function person(id: string, portrait: string | null): PersonSummary {
  return {
    id, givenName: { ru: null, be: null, en: 'A' }, surname: { ru: null, be: null, en: 'B' },
    maidenName: null, sex: 'M', birthYear: 1900, deathYear: null, vocation: '',
    portrait, portraitVideo: null, parents: { motherId: null, fatherId: null },
    marriedIntoFamily: false, isDefaultRoot: false
  };
}

describe('familyStore.applyPersonMedia', () => {
  beforeEach(() => setActivePinia(createPinia()));

  it('updates the matching person portrait/thumb in place and leaves others untouched', () => {
    const store = useFamilyStore();
    store.people = [person('p-0001', 'old.jpg'), person('p-0002', 'keep.jpg')];

    store.applyPersonMedia('p-0001', 'uploads/p-0001/new.webp', 'uploads/p-0001/new.thumb.webp');

    expect(store.people[0].portrait).toBe('uploads/p-0001/new.webp');
    expect(store.people[0].portraitThumb).toBe('uploads/p-0001/new.thumb.webp');
    expect(store.people[1].portrait).toBe('keep.jpg');
  });

  it('is a no-op for an unknown id', () => {
    const store = useFamilyStore();
    store.people = [person('p-0001', 'old.jpg')];
    expect(() => store.applyPersonMedia('p-9999', 'x', null)).not.toThrow();
    expect(store.people[0].portrait).toBe('old.jpg');
  });
});
```

> `PersonSummary` may not declare `portraitThumb` yet (it was added in a prior task — confirm in `src/frontend/src/types/family.ts`; it is `portraitThumb?: string | null`). The store assigns it; the fixture omitting it is fine (optional).

- [ ] **Step 2: Run — expect FAIL**

Run: `npm --prefix src/frontend test -- familyStore`
Expected: FAIL (`applyPersonMedia` is not a function).

- [ ] **Step 3: Add the action**

In `familyStore.ts`, add to `actions` (after `setFocus`):

```ts
    /**
     * Patch one person's portrait media in place so the tree medallion updates immediately
     * after a photo edit — without refetching the graph or recomputing the layout (the layout
     * never reads `portrait`, so mutating it does not trigger a relayout).
     */
    applyPersonMedia(id: string, portrait: string | null, portraitThumb?: string | null): void {
      const person = this.people.find(p => p.id === id);
      if (person) {
        person.portrait = portrait;
        person.portraitThumb = portraitThumb ?? null;
      }
    }
```

- [ ] **Step 4: Run — expect PASS**

Run: `npm --prefix src/frontend test -- familyStore`
Expected: PASS.

- [ ] **Step 5: Wire it from the popup update handler**

In `PersonDossier.vue` script: import the family store and call the action in `onDetailUpdated`.

Add the import (beside the existing `useSelectionStore` import, line 13):

```ts
import { useFamilyStore } from '../stores/familyStore';
```

Add the store instance (beside `const selection = useSelectionStore();`, line 19):

```ts
const family = useFamilyStore();
```

Change `onDetailUpdated` (lines 35-37) to also patch the tree:

```ts
function onDetailUpdated(updated: PersonDetail): void {
  selection.applyDetail(updated);
  family.applyPersonMedia(updated.id, updated.portrait ?? null, updated.portraitThumb ?? null);
}
```

- [ ] **Step 6: Run the full frontend suite + build**

Run: `npm --prefix src/frontend test`
Expected: PASS.

Run: `npm --prefix src/frontend run build`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/frontend/src/stores/familyStore.ts src/frontend/src/stores/familyStore.spec.ts src/frontend/src/components/PersonDossier.vue
git commit -m "feat(web): update the tree medallion immediately on a portrait change"
```

---

## Task 5: Documentation + live verification

**Files:**
- Modify: `docs/reference/features/person-details.md`
- Verification only: run the app, exercise all five.

- [ ] **Step 1: Update the reference doc**

In `docs/reference/features/person-details.md`, in the photo-grid section, add/adjust:
- The grid holds at most **5** media items per person; the Add tile disappears at the cap; the API returns **400** for an over-cap upload.
- Promoting a new portrait keeps a previously-seeded portrait visible **in the gallery** (re-selectable); the seed tile has no remove (seed media is never deleted in-app).
- A portrait change reflects on the tree medallion **immediately** (no reload).
Keep it tight and consistent with the existing tone.

- [ ] **Step 2: Commit the doc**

```bash
git add docs/reference/features/person-details.md
git commit -m "docs: photo cap, seed-stays-in-gallery, live medallion update"
```

- [ ] **Step 3: Live verification (run-app skill / scripts/dev.mjs on non-default ports)**

Start the API + frontend (per the run-app skill; custom ports). Sign in as an editor (requires the Google client id locally, per `docs/ci-cd/google-signin-setup.md`; if unavailable, rely on the integration/unit tests for the backend behaviors and verify the pure-UI items below without auth where possible). Confirm with the preview tools:
1. **Limit:** a person with 5 media shows no Add tile; the grid is one row.
2. **Confirm:** clicking remove shows a clearly-readable ✓/✕ (not clipped); confirm deletes.
3. **Icons:** star/trash/✓/✕/＋ are visually centered in their buttons (`preview_screenshot`).
4. **Medallion:** changing the portrait in the popup updates the tree medallion immediately, no reload, no tree jump/relayout.
5. **Seed:** for a person with a seed portrait, upload a photo and promote it — the seed stays in the gallery (no remove on it) and can be re-selected as portrait.

(Items 3-5 are the live-only checks; 1-2 also have automated coverage.)

---

## Self-Review

**Spec coverage:**
- Item 1 (limit 5, hide Add, backend validate, 400) → Task 1 (backend) + Task 3 Step 3 (hide Add). ✓
- Item 2 (confirm readability/clipping) → Task 3 Step 4 (icon confirm) + i18n reword. ✓
- Item 3 (icon centering) → Task 3 Step 5 (`display: block`). ✓
- Item 4 (live medallion) → Task 4 (`applyPersonMedia` mutate-in-place + wiring) + Task 5 live check. ✓
- Item 5 (seed stays, re-selectable) → Task 2 (merge virtual seed + promote rewrite + delete guard) + Task 3 (seed tile non-removable, star retained). ✓
- Docs → Task 5. ✓

**Placeholder scan:** none — every step has concrete code/commands.

**Type/selector consistency:** `MediaLimitExceededException(int)` used identically in handler + controller + tests. Cap constant `5` in `MaxMediaPerPerson` (handler) and `MAX_PHOTOS` (component). The virtual seed `Photo` has `full` = a bare seed filename (no `/`); the merge produces it, the promote handler keys off `target.Full.Contains('/')`, the delete guard off `removed.Full.Contains('/')`, and the frontend `removable: photo.full.includes('/')` — one consistent rule. Selectors `set-portrait-${galleryId}` / `remove-${key}` / `remove-confirm-${key}` / `photo-add-input` / `photo-open-${index}` match the existing component and specs. `applyPersonMedia(id, portrait, portraitThumb?)` signature matches between the store, its test, and the `PersonDossier` call.
