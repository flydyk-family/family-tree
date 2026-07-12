# Members Page — Cut 1a Implementation Plan (read-only page + profile-override backend)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a read-only, theme-aware `/members` roster (compact searchable index → per-person dossier + immediate-family cluster) and the full profile-override backend behind it, proven end-to-end by curl before any editor UI exists.

**Architecture:** A new `PersonProfileOverride` mirrors the existing append-only biography/media override pattern and merges at the **snapshot layer** in `FamilySnapshotProvider`, so a corrected birth year moves the person everywhere (oak layout + era frame + graph), not just on the Members page. The frontend adds a read-only master-detail page reusing the existing family graph, `PersonPhotos` gallery, and the reserved `TabNav` slot. The editor UI is deliberately **not** in this cut — the backend `PUT`/`GET` profile endpoints ship dormant and are validated by curl.

**Tech Stack:** .NET 10 (MediatR request/handler, FluentValidation, Mapster, Firestore SDK), Vue 3 + TypeScript + Pinia + vue-router + vue-i18n, xUnit + Moq + AwesomeAssertions (backend), Vitest (frontend).

## Global Constraints

- **No writes to `family.json`.** All edits persist through the override layer only.
- **Snapshot-layer merge is mandatory.** Profile overrides merge in `FamilySnapshotProvider`, never in a Members-only read model (prevents the birth-year split-brain).
- **Override field semantics: `null` = inherit seed** (per field; per-locale for `LocalizedText`). No "intentionally empty distinct from seed" in this cut; clearing a field = revert to seed.
- **Profile override carries only the editable scalar subset** — given/surname/maiden name, sex, birth year, death year, vocation. Never biography or media (kept disjoint so overrides can't clobber each other).
- **Editor auth:** mutating endpoints use `[Authorize(Policy = "CanEdit")]`, exactly like the biography endpoint.
- **Person id pattern:** `^p-\d+$` (matches the biography validator).
- **Structured logging only**, named placeholders, never PII (no editor email in logs). C# file-scoped namespaces, `_camelCase` private fields, `Async` suffix, braces on all control statements.
- **Localized:** names are `LocalizedText { ru, be, en }`; the roster searches/displays in the active locale.
- **NOT in this cut (see design doc):** the scalar-field editor UI (cut 1b), residence editing + map picker (cut 1c), add/remove people + relationships (cut 2), residence-place search, birth/death place editing, the animated census-card shuffle.

**Spec:** `docs/superpowers/specs/2026-07-03-members-page-design.md` (design + design-review + eng-review decisions).

---

## File Structure

**Backend (Lane A):**
- Create `src/backend/FamilyTree.Domain/PersonProfileOverride.cs` — the editable-scalar override record.
- Modify `src/backend/FamilyTree.Domain/IPersonOverrideStore.cs` — add 3 profile methods.
- Modify `src/backend/FamilyTree.Infrastructure/InMemoryPersonOverrideStore.cs` — profile revisions.
- Modify `src/backend/FamilyTree.Infrastructure/FirestorePersonOverrideStore.cs` — profile persistence.
- Modify `src/backend/FamilyTree.Infrastructure/FamilySnapshotProvider.cs` — merge profile overrides.
- Create `src/backend/FamilyTree.Application/Dtos/PersonProfileDto.cs` — the wire shape of an override.
- Create `src/backend/FamilyTree.Application/People/GetPersonProfileQuery.cs` + `...Handler.cs`.
- Create `src/backend/FamilyTree.Application/People/UpdatePersonProfileCommand.cs` + `...Handler.cs` + `...Validator.cs`.
- Create `src/backend/FamilyTree.Domain/IFamilyGraphValidator.cs` + `src/backend/FamilyTree.Infrastructure/FamilyGraphValidator.cs` — cross-entity (birth-order) checks.
- Modify `src/backend/FamilyTree.Application/Mapping/MappingConfig.cs` — `PersonProfileOverride`↔`PersonProfileDto`.
- Modify `src/backend/FamilyTree.Api/Controllers/PeopleController.cs` — `GET`/`PUT` `/{id}/profile`.
- Modify `src/backend/FamilyTree.Infrastructure/InfrastructureServiceCollectionExtensions.cs` — register `IFamilyGraphValidator`.

**Frontend (Lane B, read-only):**
- Modify `src/frontend/src/composables/useSearchMatches.ts` — extend `personMatchesQuery` to maiden name.
- Create `src/frontend/src/composables/useRelatives.ts` — derive parents/siblings/spouses/children.
- Create `src/frontend/src/views/MembersView.vue` — the master-detail page shell.
- Create `src/frontend/src/components/MembersIndex.vue` — searchable roster list.
- Create `src/frontend/src/components/MemberDetail.vue` — read-only dossier.
- Create `src/frontend/src/components/MemberFamilySheet.vue` — bottom-sheet family cluster (read-only, layout-ready for cut-2 add-slots, none rendered).
- Modify `src/frontend/src/router/index.ts` — add `/members/:slug?`.
- Modify `src/frontend/src/components/TabNav.vue` — enable the `members` tab + `activeId`.
- Modify `src/frontend/src/i18n/*` — new strings (all three locales).

Lanes A and B share only the API contract and can run in parallel worktrees. Backend tasks are risk-first and land before the editor cut (1b).

---

## Task 1: `PersonProfileOverride` record + interface

**Files:**
- Create: `src/backend/FamilyTree.Domain/PersonProfileOverride.cs`
- Modify: `src/backend/FamilyTree.Domain/IPersonOverrideStore.cs`

**Interfaces:**
- Produces: `PersonProfileOverride` (record, all fields nullable, `null` = inherit seed); `IPersonOverrideStore.AppendProfileAsync(string, PersonProfileOverride, string, CancellationToken)`, `GetLatestProfileAsync(string, CancellationToken) : Task<PersonProfileOverride?>`, `GetLatestProfilesAsync(CancellationToken) : Task<IReadOnlyDictionary<string, PersonProfileOverride>>`.

- [ ] **Step 1: Create the record**

`src/backend/FamilyTree.Domain/PersonProfileOverride.cs`:

```csharp
namespace FamilyTree.Domain;

/// <summary>An editor's override of one person's editable scalar fields, layered over the
/// JSON seed. Every field is nullable and a <c>null</c> field means "inherit the seed value"
/// (per locale for the <see cref="LocalizedText"/> names). Carries no biography or media —
/// those are separate overrides — so the three override kinds never clobber one another.</summary>
public sealed record PersonProfileOverride
{
    public LocalizedText? GivenName { get; init; }
    public LocalizedText? Surname { get; init; }
    public LocalizedText? MaidenName { get; init; }
    public Sex? Sex { get; init; }
    public int? BirthYear { get; init; }
    public int? DeathYear { get; init; }
    public Vocation? Vocation { get; init; }
}
```

- [ ] **Step 2: Extend the store interface**

In `src/backend/FamilyTree.Domain/IPersonOverrideStore.cs`, add after the media methods (before the closing brace):

```csharp
    Task AppendProfileAsync(string personId, PersonProfileOverride profile, string editorEmail, CancellationToken cancellationToken);
    Task<PersonProfileOverride?> GetLatestProfileAsync(string personId, CancellationToken cancellationToken);
    Task<IReadOnlyDictionary<string, PersonProfileOverride>> GetLatestProfilesAsync(CancellationToken cancellationToken);
```

- [ ] **Step 3: Verify it compiles-fails (both stores now unimplemented)**

Run: `dotnet build src/backend/FamilyTree.slnx`
Expected: FAIL — `InMemoryPersonOverrideStore` and `FirestorePersonOverrideStore` do not implement the new interface members. This confirms the interface is wired and both stores must be updated (Tasks 2 and 4).

- [ ] **Step 4: Commit**

```bash
git add src/backend/FamilyTree.Domain/PersonProfileOverride.cs src/backend/FamilyTree.Domain/IPersonOverrideStore.cs
git commit -m "feat(domain): add PersonProfileOverride + store interface methods"
```

---

## Task 2: `InMemoryPersonOverrideStore` profile revisions

**Files:**
- Modify: `src/backend/FamilyTree.Infrastructure/InMemoryPersonOverrideStore.cs`
- Test: `tests/unit/FamilyTree.UnitTests/Infrastructure/InMemoryPersonOverrideStoreTests.cs` (create if absent; otherwise add to the existing file)

**Interfaces:**
- Consumes: `PersonProfileOverride`, `IPersonOverrideStore` profile methods (Task 1).
- Produces: a working in-memory profile store for local dev + tests.

- [ ] **Step 1: Write the failing test**

`tests/unit/FamilyTree.UnitTests/Infrastructure/InMemoryPersonOverrideStoreTests.cs`:

```csharp
using FamilyTree.Domain;
using FamilyTree.Infrastructure;

namespace FamilyTree.UnitTests.Infrastructure;

public sealed class InMemoryPersonOverrideStoreTests
{
    [Fact]
    public async Task GetLatestProfileAsync_WhenTwoRevisionsAppended_ShouldReturnLatest()
    {
        var store = new InMemoryPersonOverrideStore();
        await store.AppendProfileAsync("p-1", new PersonProfileOverride { BirthYear = 1900 }, "e@x", CancellationToken.None);
        await store.AppendProfileAsync("p-1", new PersonProfileOverride { BirthYear = 1897 }, "e@x", CancellationToken.None);

        var latest = await store.GetLatestProfileAsync("p-1", CancellationToken.None);

        latest.Should().NotBeNull();
        latest!.BirthYear.Should().Be(1897);
    }

    [Fact]
    public async Task GetLatestProfileAsync_WhenNoOverride_ShouldReturnNull()
    {
        var store = new InMemoryPersonOverrideStore();
        var latest = await store.GetLatestProfileAsync("p-1", CancellationToken.None);
        latest.Should().BeNull();
    }

    [Fact]
    public async Task GetLatestProfilesAsync_WhenMultiplePeople_ShouldReturnLatestPerPerson()
    {
        var store = new InMemoryPersonOverrideStore();
        await store.AppendProfileAsync("p-1", new PersonProfileOverride { BirthYear = 1900 }, "e@x", CancellationToken.None);
        await store.AppendProfileAsync("p-2", new PersonProfileOverride { DeathYear = 1980 }, "e@x", CancellationToken.None);

        var all = await store.GetLatestProfilesAsync(CancellationToken.None);

        all.Should().HaveCount(2);
        all["p-1"].BirthYear.Should().Be(1900);
        all["p-2"].DeathYear.Should().Be(1980);
    }
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `dotnet test tests/unit/FamilyTree.UnitTests --filter InMemoryPersonOverrideStoreTests`
Expected: FAIL to compile — `AppendProfileAsync` not implemented on `InMemoryPersonOverrideStore`.

- [ ] **Step 3: Implement the profile revisions**

In `src/backend/FamilyTree.Infrastructure/InMemoryPersonOverrideStore.cs`, add before the final closing brace (mirrors the media revision block):

```csharp
    private sealed record ProfileRevision(PersonProfileOverride Profile, string EditorEmail, DateTimeOffset EditedAt);

    private readonly ConcurrentDictionary<string, List<ProfileRevision>> _profiles = new(StringComparer.Ordinal);

    public Task AppendProfileAsync(string personId, PersonProfileOverride profile, string editorEmail, CancellationToken cancellationToken)
    {
        var revision = new ProfileRevision(profile, editorEmail, DateTimeOffset.UtcNow);
        var revisions = _profiles.GetOrAdd(personId, _ => new List<ProfileRevision>());
        lock (revisions)
        {
            revisions.Add(revision);
        }

        return Task.CompletedTask;
    }

    public Task<PersonProfileOverride?> GetLatestProfileAsync(string personId, CancellationToken cancellationToken)
    {
        if (!_profiles.TryGetValue(personId, out var revisions))
        {
            return Task.FromResult<PersonProfileOverride?>(null);
        }

        lock (revisions)
        {
            return Task.FromResult<PersonProfileOverride?>(revisions.Count > 0 ? revisions[^1].Profile : null);
        }
    }

    public Task<IReadOnlyDictionary<string, PersonProfileOverride>> GetLatestProfilesAsync(CancellationToken cancellationToken)
    {
        var latest = new Dictionary<string, PersonProfileOverride>(StringComparer.Ordinal);
        foreach (var entry in _profiles)
        {
            lock (entry.Value)
            {
                if (entry.Value.Count > 0)
                {
                    latest[entry.Key] = entry.Value[^1].Profile;
                }
            }
        }

        return Task.FromResult<IReadOnlyDictionary<string, PersonProfileOverride>>(latest);
    }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `dotnet test tests/unit/FamilyTree.UnitTests --filter InMemoryPersonOverrideStoreTests`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/backend/FamilyTree.Infrastructure/InMemoryPersonOverrideStore.cs tests/unit/FamilyTree.UnitTests/Infrastructure/InMemoryPersonOverrideStoreTests.cs
git commit -m "feat(infra): in-memory profile override revisions"
```

---

## Task 3: Merge profile overrides in `FamilySnapshotProvider` (the split-brain killer)

**Files:**
- Modify: `src/backend/FamilyTree.Infrastructure/FamilySnapshotProvider.cs`
- Test: `tests/unit/FamilyTree.UnitTests/Infrastructure/FamilySnapshotProviderTests.cs` (add to existing file)

**Interfaces:**
- Consumes: `IPersonOverrideStore.GetLatestProfilesAsync` (Task 2).
- Produces: a merged snapshot where a profile override's non-null fields replace seed values (per-locale for names), while biography/media overrides continue to apply.

- [ ] **Step 1: Write the failing test**

Add to `tests/unit/FamilyTree.UnitTests/Infrastructure/FamilySnapshotProviderTests.cs`. This is the test that proves the birth-year correction reaches the merged graph (the value the oak layout reads). Use the existing test's construction style for `FamilySnapshotProvider` (loader mock + override store + `FakeTimeProvider` + options); the profile store used here is the real `InMemoryPersonOverrideStore` seeded before the snapshot builds.

```csharp
[Fact]
public async Task GetAsync_WhenProfileOverridesBirthYear_ShouldReflectItInMergedGraph()
{
    var seedPerson = TestPeople.Person("p-1", birthYear: 1898); // helper: builds a Person with given id + birth year
    var loader = new StubFamilyDataLoader(new FamilyGraph([seedPerson], []));
    var overrides = new InMemoryPersonOverrideStore();
    await overrides.AppendProfileAsync("p-1", new PersonProfileOverride { BirthYear = 1897 }, "e@x", CancellationToken.None);
    var provider = BuildProvider(loader, overrides); // helper wiring options + FakeTimeProvider + NullLogger

    var graph = await provider.GetAsync(CancellationToken.None);

    graph.People.Single(p => p.Id == "p-1").Birth.Year.Should().Be(1897);
}

[Fact]
public async Task GetAsync_WhenProfileOverridesOneNameLocale_ShouldKeepOtherSeedLocales()
{
    var seedPerson = TestPeople.Person("p-1", surname: new LocalizedText { Ru = "Иванов", Be = "Іваноў", En = "Ivanov" });
    var loader = new StubFamilyDataLoader(new FamilyGraph([seedPerson], []));
    var overrides = new InMemoryPersonOverrideStore();
    await overrides.AppendProfileAsync("p-1",
        new PersonProfileOverride { Surname = new LocalizedText { Ru = "Іваноў", Be = null, En = null } },
        "e@x", CancellationToken.None);
    var provider = BuildProvider(loader, overrides);

    var merged = (await provider.GetAsync(CancellationToken.None)).People.Single(p => p.Id == "p-1");

    merged.Surname.Ru.Should().Be("Іваноў");   // overridden locale
    merged.Surname.Be.Should().Be("Іваноў");   // Be seed... see note below
    merged.Surname.En.Should().Be("Ivanov");   // untouched locale falls back to seed
}
```

> If `TestPeople.Person`/`StubFamilyDataLoader`/`BuildProvider` helpers do not already exist in the test file, add them next to the new tests. `TestPeople.Person` returns a `Person` with all required fields defaulted (`GivenName`/`Surname` = a `LocalizedText` with all three locales set, `Birth = new LifeEvent { Year = birthYear }`, `Sex = Sex.Unknown`, `Vocation = Vocation.Unknown`) and the named overrides applied. Fix the second test's `Be` expectation to the seed value `"Іваноў"` only if the seed `Be` equals it; otherwise assert the seed `Be` string you passed.

- [ ] **Step 2: Run test to verify it fails**

Run: `dotnet test tests/unit/FamilyTree.UnitTests --filter FamilySnapshotProviderTests`
Expected: FAIL — merged birth year is still 1898 (profile overrides not yet merged).

- [ ] **Step 3: Implement the merge**

In `src/backend/FamilyTree.Infrastructure/FamilySnapshotProvider.cs`, inside `RebuildAsync`:

3a. Pull the profiles alongside the other overrides (in the same `try` block):

```csharp
IReadOnlyDictionary<string, PersonProfileOverride> profiles;
```
and
```csharp
profiles = await _overrides.GetLatestProfilesAsync(cancellationToken);
```

3b. Widen the short-circuit so a profile-only override still triggers the per-person merge:

```csharp
var people = (latest.Count == 0 && media.Count == 0 && profiles.Count == 0)
    ? seed.People
    : seed.People.Select(person =>
    {
        var updated = person;
        if (profiles.TryGetValue(person.Id, out var profile))
        {
            updated = ApplyProfile(updated, profile);
        }
        if (latest.TryGetValue(person.Id, out var biography))
        {
            updated = updated with { Biography = biography };
        }
        // ... existing media block unchanged ...
        return updated;
    }).ToList();
```

3c. Add the pure merge helpers (below `SeedTile`):

```csharp
/// <summary>Applies a profile override to a seed person. Every override field is coalesced
/// with the seed: a null field (or null locale) inherits the seed value, so a partial edit
/// never drops data. Names merge per locale.</summary>
private static Person ApplyProfile(Person seed, PersonProfileOverride profile) => seed with
{
    GivenName = MergeText(profile.GivenName, seed.GivenName),
    Surname = MergeText(profile.Surname, seed.Surname),
    MaidenName = profile.MaidenName is null ? seed.MaidenName : MergeText(profile.MaidenName, seed.MaidenName ?? new LocalizedText()),
    Sex = profile.Sex ?? seed.Sex,
    Vocation = profile.Vocation ?? seed.Vocation,
    Birth = profile.BirthYear is null ? seed.Birth : seed.Birth with { Year = profile.BirthYear },
    Death = profile.DeathYear is null
        ? seed.Death
        : (seed.Death is null ? new LifeEvent { Year = profile.DeathYear } : seed.Death with { Year = profile.DeathYear })
};

private static LocalizedText MergeText(LocalizedText? over, LocalizedText seed)
{
    if (over is null)
    {
        return seed;
    }

    return new LocalizedText
    {
        Ru = over.Ru ?? seed.Ru,
        Be = over.Be ?? seed.Be,
        En = over.En ?? seed.En
    };
}
```

> Confirm the exact shape of `LifeEvent` and `LocalizedText` while implementing — `LifeEvent` here is created with only `Year` set; the other members (`Month`/`Day`/`Approx`/`Place`) default. That matches "years-first."

- [ ] **Step 4: Run test to verify it passes**

Run: `dotnet test tests/unit/FamilyTree.UnitTests --filter FamilySnapshotProviderTests`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/backend/FamilyTree.Infrastructure/FamilySnapshotProvider.cs tests/unit/FamilyTree.UnitTests/Infrastructure/FamilySnapshotProviderTests.cs
git commit -m "feat(infra): merge profile overrides at the snapshot layer"
```

---

## Task 4: `FirestorePersonOverrideStore` profile persistence

**Files:**
- Modify: `src/backend/FamilyTree.Infrastructure/FirestorePersonOverrideStore.cs`
- Modify: `src/backend/FamilyTree.Infrastructure/FirestoreOptions.cs` (add `ProfileOverridesCollection`)

**Interfaces:**
- Consumes: `PersonProfileOverride`, `FirestoreOptions`.
- Produces: durable profile persistence in deployment (same parent-snapshot + versions-subcollection pattern as biography/media). This class is `[ExcludeFromCodeCoverage]` (thin SDK wrapper, emulator-verified only), so no unit test in CI — Task 6's integration test exercises the store selected by config.

- [ ] **Step 1: Add the collection option**

In `src/backend/FamilyTree.Infrastructure/FirestoreOptions.cs`, add a property mirroring `MediaOverridesCollection` (default e.g. `"profile-overrides"`):

```csharp
public string ProfileOverridesCollection { get; set; } = "profile-overrides";
```

- [ ] **Step 2: Add the collection field + constructor wiring**

In `FirestorePersonOverrideStore.cs`, add a field and initialize it in the constructor:

```csharp
    private readonly CollectionReference _profileOverrides;
```
```csharp
        _profileOverrides = db.Collection(options.Value.ProfileOverridesCollection);
```

- [ ] **Step 3: Implement the three profile methods**

Add to `FirestorePersonOverrideStore.cs` (mirrors `AppendMediaAsync`/`GetLatestMediaAsync`/`GetLatestMediaMapAsync`). Nullable scalar fields are written with a sentinel-free scheme: absent field = inherit. Store years as `long?`→ Firestore number, names as three strings per field, sex/vocation as their enum string or absent.

```csharp
    public async Task AppendProfileAsync(string personId, PersonProfileOverride profile, string editorEmail, CancellationToken cancellationToken)
    {
        var snapshot = new Dictionary<string, object?>
        {
            ["givenNameRu"] = profile.GivenName?.Ru,
            ["givenNameBe"] = profile.GivenName?.Be,
            ["givenNameEn"] = profile.GivenName?.En,
            ["surnameRu"] = profile.Surname?.Ru,
            ["surnameBe"] = profile.Surname?.Be,
            ["surnameEn"] = profile.Surname?.En,
            ["maidenNameRu"] = profile.MaidenName?.Ru,
            ["maidenNameBe"] = profile.MaidenName?.Be,
            ["maidenNameEn"] = profile.MaidenName?.En,
            ["sex"] = profile.Sex?.ToString(),
            ["birthYear"] = profile.BirthYear.HasValue ? (long?)profile.BirthYear.Value : null,
            ["deathYear"] = profile.DeathYear.HasValue ? (long?)profile.DeathYear.Value : null,
            ["vocation"] = profile.Vocation?.ToString(),
            ["editorEmail"] = editorEmail,
            ["editedAt"] = FieldValue.ServerTimestamp
        };

        var parent = _profileOverrides.Document(personId);
        var batch = _db.StartBatch();
        batch.Set(parent, snapshot);
        batch.Create(parent.Collection(VersionsSubcollection).Document(), snapshot);
        await OperationDeadline.RunAsync(OperationTimeout, cancellationToken,
            ct => batch.CommitAsync(ct), "Firestore profile write");
    }

    public async Task<PersonProfileOverride?> GetLatestProfileAsync(string personId, CancellationToken cancellationToken)
    {
        var snapshot = await OperationDeadline.RunAsync(OperationTimeout, cancellationToken,
            ct => _profileOverrides.Document(personId).GetSnapshotAsync(ct), "Firestore profile read");
        return snapshot.Exists ? ProfileFrom(snapshot) : null;
    }

    public async Task<IReadOnlyDictionary<string, PersonProfileOverride>> GetLatestProfilesAsync(CancellationToken cancellationToken)
    {
        var result = new Dictionary<string, PersonProfileOverride>(StringComparer.Ordinal);
        var snapshot = await OperationDeadline.RunAsync(OperationTimeout, cancellationToken,
            ct => _profileOverrides.GetSnapshotAsync(ct), "Firestore profile overrides read");
        foreach (var doc in snapshot.Documents)
        {
            var profile = ProfileFrom(doc);
            if (profile is not null)
            {
                result[doc.Id] = profile;
            }
        }

        return result;
    }

    private static PersonProfileOverride? ProfileFrom(DocumentSnapshot doc)
    {
        LocalizedText? Name(string prefix)
        {
            var ru = NullableString(doc, prefix + "Ru");
            var be = NullableString(doc, prefix + "Be");
            var en = NullableString(doc, prefix + "En");
            return (ru is null && be is null && en is null) ? null : new LocalizedText { Ru = ru, Be = be, En = en };
        }

        var given = Name("givenName");
        var surname = Name("surname");
        var maiden = Name("maidenName");
        var sex = Enum.TryParse<Sex>(NullableString(doc, "sex"), out var s) ? s : (Sex?)null;
        var vocation = Enum.TryParse<Vocation>(NullableString(doc, "vocation"), out var v) ? v : (Vocation?)null;
        var birth = doc.TryGetValue<long>("birthYear", out var by) ? (int?)by : null;
        var death = doc.TryGetValue<long>("deathYear", out var dy) ? (int?)dy : null;

        if (given is null && surname is null && maiden is null && sex is null && vocation is null && birth is null && death is null)
        {
            return null;
        }

        return new PersonProfileOverride
        {
            GivenName = given, Surname = surname, MaidenName = maiden,
            Sex = sex, Vocation = vocation, BirthYear = birth, DeathYear = death
        };
    }

    private static string? NullableString(DocumentSnapshot doc, string field) =>
        doc.TryGetValue<string>(field, out var value) && !string.IsNullOrEmpty(value) ? value : null;
```

- [ ] **Step 4: Verify build**

Run: `dotnet build src/backend/FamilyTree.slnx`
Expected: PASS — both stores now implement the interface.

- [ ] **Step 5: Commit**

```bash
git add src/backend/FamilyTree.Infrastructure/FirestorePersonOverrideStore.cs src/backend/FamilyTree.Infrastructure/FirestoreOptions.cs
git commit -m "feat(infra): Firestore profile override persistence"
```

---

## Task 5: `PersonProfileDto` + mapping

**Files:**
- Create: `src/backend/FamilyTree.Application/Dtos/PersonProfileDto.cs`
- Modify: `src/backend/FamilyTree.Application/Mapping/MappingConfig.cs`
- Test: `tests/unit/FamilyTree.UnitTests/Mapping/PersonProfileMappingTests.cs`

**Interfaces:**
- Produces: `PersonProfileDto(LocalizedTextDto? GivenName, LocalizedTextDto? Surname, LocalizedTextDto? MaidenName, string? Sex, int? BirthYear, int? DeathYear, string? Vocation)`; Mapster config both directions.

- [ ] **Step 1: Write the failing test**

`tests/unit/FamilyTree.UnitTests/Mapping/PersonProfileMappingTests.cs`:

```csharp
using FamilyTree.Application.Dtos;
using FamilyTree.Application.Mapping;
using FamilyTree.Domain;
using Mapster;

namespace FamilyTree.UnitTests.Mapping;

public sealed class PersonProfileMappingTests
{
    private static TypeAdapterConfig NewConfig()
    {
        var config = new TypeAdapterConfig();
        MappingConfig.Register(config);
        return config;
    }

    [Fact]
    public void Map_DtoToDomain_ShouldParseSexAndVocationCaseInsensitively()
    {
        var config = NewConfig();
        var dto = new PersonProfileDto(null, null, null, "male", 1897, null, "farmer");

        var domain = dto.Adapt<PersonProfileOverride>(config);

        domain.Sex.Should().Be(Sex.Male);
        domain.Vocation.Should().Be(Vocation.Farmer);
        domain.BirthYear.Should().Be(1897);
        domain.DeathYear.Should().BeNull();
    }

    [Fact]
    public void Map_DtoToDomain_WhenSexNull_ShouldLeaveSexNull()
    {
        var config = NewConfig();
        var dto = new PersonProfileDto(null, null, null, null, null, null, null);
        dto.Adapt<PersonProfileOverride>(config).Sex.Should().BeNull();
    }
}
```

> Use the real enum member names for `Vocation` (`Farmer` is illustrative — substitute a value that exists in the `Vocation` enum).

- [ ] **Step 2: Run test to verify it fails**

Run: `dotnet test tests/unit/FamilyTree.UnitTests --filter PersonProfileMappingTests`
Expected: FAIL — `PersonProfileDto` does not exist.

- [ ] **Step 3: Create the DTO + mapping**

`src/backend/FamilyTree.Application/Dtos/PersonProfileDto.cs`:

```csharp
namespace FamilyTree.Application.Dtos;

/// <summary>The wire shape of a <c>PersonProfileOverride</c>: the editable scalar fields, each
/// nullable. A null field means "inherit the seed value"; the editor submits the full set.</summary>
public sealed record PersonProfileDto(
    LocalizedTextDto? GivenName,
    LocalizedTextDto? Surname,
    LocalizedTextDto? MaidenName,
    string? Sex,
    int? BirthYear,
    int? DeathYear,
    string? Vocation);
```

In `MappingConfig.Register`, add (Sex/Vocation are nullable enum↔string; parse case-insensitively, emit lowercase like the Person mappings):

```csharp
        config.NewConfig<PersonProfileOverride, PersonProfileDto>()
            .Map(dest => dest.Sex, src => src.Sex == null ? null : src.Sex.ToString()!.ToLowerInvariant())
            .Map(dest => dest.Vocation, src => src.Vocation == null ? null : src.Vocation.ToString()!.ToLowerInvariant());

        config.NewConfig<PersonProfileDto, PersonProfileOverride>()
            .Map(dest => dest.Sex, src => ParseSex(src.Sex))
            .Map(dest => dest.Vocation, src => ParseVocation(src.Vocation));
```

Add the two private parse helpers to `MappingConfig` (static class):

```csharp
    private static Sex? ParseSex(string? value) =>
        Enum.TryParse<Sex>(value, ignoreCase: true, out var s) ? s : null;

    private static Vocation? ParseVocation(string? value) =>
        Enum.TryParse<Vocation>(value, ignoreCase: true, out var v) ? v : null;
```

- [ ] **Step 4: Run test to verify it passes**

Run: `dotnet test tests/unit/FamilyTree.UnitTests --filter PersonProfileMappingTests`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/backend/FamilyTree.Application/Dtos/PersonProfileDto.cs src/backend/FamilyTree.Application/Mapping/MappingConfig.cs tests/unit/FamilyTree.UnitTests/Mapping/PersonProfileMappingTests.cs
git commit -m "feat(app): PersonProfileDto + Mapster mapping"
```

---

## Task 6: `IFamilyGraphValidator` (cross-entity birth-order)

**Files:**
- Create: `src/backend/FamilyTree.Domain/IFamilyGraphValidator.cs`
- Create: `src/backend/FamilyTree.Infrastructure/FamilyGraphValidator.cs`
- Modify: `src/backend/FamilyTree.Infrastructure/InfrastructureServiceCollectionExtensions.cs`
- Test: `tests/unit/FamilyTree.UnitTests/Infrastructure/FamilyGraphValidatorTests.cs`

**Interfaces:**
- Produces: `IFamilyGraphValidator.ValidateBirthYear(FamilyGraph graph, string personId, int? newBirthYear) : GraphValidationResult` where `GraphValidationResult(bool IsValid, string? Error)`. Rejects a birth year that is not strictly greater than every parent's known birth year, or not strictly less than every child's known birth year. Unknown (null) years on the other party are skipped.

- [ ] **Step 1: Write the failing test**

`tests/unit/FamilyTree.UnitTests/Infrastructure/FamilyGraphValidatorTests.cs`:

```csharp
using FamilyTree.Domain;
using FamilyTree.Infrastructure;

namespace FamilyTree.UnitTests.Infrastructure;

public sealed class FamilyGraphValidatorTests
{
    [Fact]
    public void ValidateBirthYear_WhenBeforeParentBirth_ShouldFail()
    {
        var parent = TestPeople.Person("p-1", birthYear: 1900);
        var child = TestPeople.Person("p-2", birthYear: 1925, fatherId: "p-1");
        var graph = new FamilyGraph([parent, child], []);

        var result = new FamilyGraphValidator().ValidateBirthYear(graph, "p-2", 1890);

        result.IsValid.Should().BeFalse();
        result.Error.Should().NotBeNullOrEmpty();
    }

    [Fact]
    public void ValidateBirthYear_WhenAfterChildBirth_ShouldFail()
    {
        var parent = TestPeople.Person("p-1", birthYear: 1900);
        var child = TestPeople.Person("p-2", birthYear: 1925, fatherId: "p-1");
        var graph = new FamilyGraph([parent, child], []);

        new FamilyGraphValidator().ValidateBirthYear(graph, "p-1", 1930).IsValid.Should().BeFalse();
    }

    [Fact]
    public void ValidateBirthYear_WhenConsistent_ShouldPass()
    {
        var parent = TestPeople.Person("p-1", birthYear: 1900);
        var child = TestPeople.Person("p-2", birthYear: 1925, fatherId: "p-1");
        var graph = new FamilyGraph([parent, child], []);

        new FamilyGraphValidator().ValidateBirthYear(graph, "p-2", 1922).IsValid.Should().BeTrue();
    }

    [Fact]
    public void ValidateBirthYear_WhenNull_ShouldPass()
    {
        var graph = new FamilyGraph([TestPeople.Person("p-1", birthYear: 1900)], []);
        new FamilyGraphValidator().ValidateBirthYear(graph, "p-1", null).IsValid.Should().BeTrue();
    }
}
```

> `TestPeople.Person(..., fatherId:)` sets `Parents = new Parents { FatherId = fatherId }`. Reuse/extend the helper from Task 3.

- [ ] **Step 2: Run test to verify it fails**

Run: `dotnet test tests/unit/FamilyTree.UnitTests --filter FamilyGraphValidatorTests`
Expected: FAIL — types do not exist.

- [ ] **Step 3: Implement**

`src/backend/FamilyTree.Domain/IFamilyGraphValidator.cs`:

```csharp
namespace FamilyTree.Domain;

public readonly record struct GraphValidationResult(bool IsValid, string? Error)
{
    public static GraphValidationResult Ok() => new(true, null);
    public static GraphValidationResult Fail(string error) => new(false, error);
}

/// <summary>Cross-entity validation that a single-record validator cannot do: it needs the
/// whole graph to check a person's proposed birth year against parents and children.</summary>
public interface IFamilyGraphValidator
{
    GraphValidationResult ValidateBirthYear(FamilyGraph graph, string personId, int? newBirthYear);
}
```

`src/backend/FamilyTree.Infrastructure/FamilyGraphValidator.cs`:

```csharp
using FamilyTree.Domain;

namespace FamilyTree.Infrastructure;

/// <summary>
/// Rejects a temporally impossible birth year:
///
///   parent.birth  &lt;  person.birth  &lt;  child.birth
///
/// Unknown (null) years on the other party are skipped — we only reject a KNOWN violation.
/// </summary>
public sealed class FamilyGraphValidator : IFamilyGraphValidator
{
    public GraphValidationResult ValidateBirthYear(FamilyGraph graph, string personId, int? newBirthYear)
    {
        if (newBirthYear is null)
        {
            return GraphValidationResult.Ok();
        }

        var byId = graph.People.ToDictionary(p => p.Id, StringComparer.Ordinal);
        if (!byId.TryGetValue(personId, out var person))
        {
            return GraphValidationResult.Ok();
        }

        foreach (var parentId in new[] { person.Parents.FatherId, person.Parents.MotherId })
        {
            if (parentId is not null && byId.TryGetValue(parentId, out var parent) && parent.Birth.Year is { } py && newBirthYear <= py)
            {
                return GraphValidationResult.Fail($"Birth year {newBirthYear} must be after a parent's birth year ({py}).");
            }
        }

        foreach (var child in graph.People)
        {
            if ((child.Parents.FatherId == personId || child.Parents.MotherId == personId)
                && child.Birth.Year is { } cy && newBirthYear >= cy)
            {
                return GraphValidationResult.Fail($"Birth year {newBirthYear} must be before a child's birth year ({cy}).");
            }
        }

        return GraphValidationResult.Ok();
    }
}
```

- [ ] **Step 4: Register + run test**

In `InfrastructureServiceCollectionExtensions.cs` `AddInfrastructure`, add:

```csharp
        services.AddSingleton<IFamilyGraphValidator, FamilyGraphValidator>();
```

Run: `dotnet test tests/unit/FamilyTree.UnitTests --filter FamilyGraphValidatorTests`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/backend/FamilyTree.Domain/IFamilyGraphValidator.cs src/backend/FamilyTree.Infrastructure/FamilyGraphValidator.cs src/backend/FamilyTree.Infrastructure/InfrastructureServiceCollectionExtensions.cs tests/unit/FamilyTree.UnitTests/Infrastructure/FamilyGraphValidatorTests.cs
git commit -m "feat: cross-entity birth-order validator"
```

---

## Task 7: `GetPersonProfileQuery` + handler

**Files:**
- Create: `src/backend/FamilyTree.Application/People/GetPersonProfileQuery.cs`
- Create: `src/backend/FamilyTree.Application/People/GetPersonProfileHandler.cs`
- Test: `tests/unit/FamilyTree.UnitTests/People/GetPersonProfileHandlerTests.cs`

**Interfaces:**
- Consumes: `IPersonOverrideStore.GetLatestProfileAsync`, `IFamilyQueryService.GetPersonAsync`, `IMapper`.
- Produces: `GetPersonProfileQuery(string Id) : IRequest<PersonProfileDto?>`. Returns the raw latest override mapped to a DTO, or an **empty** DTO (all-null) when the person exists but has no override, or `null` when the person does not exist. (The editor in cut 1b needs the raw override to know which fields are currently overridden.)

- [ ] **Step 1: Write the failing test**

`tests/unit/FamilyTree.UnitTests/People/GetPersonProfileHandlerTests.cs`:

```csharp
using FamilyTree.Application.Abstractions;
using FamilyTree.Application.Dtos;
using FamilyTree.Application.Mapping;
using FamilyTree.Application.People;
using FamilyTree.Domain;
using Mapster;
using MapsterMapper;
using Microsoft.Extensions.Logging.Abstractions;
using Moq;

namespace FamilyTree.UnitTests.People;

public sealed class GetPersonProfileHandlerTests
{
    private static IMapper Mapper()
    {
        var config = new TypeAdapterConfig();
        MappingConfig.Register(config);
        return new Mapper(config);
    }

    [Fact]
    public async Task Handle_WhenPersonMissing_ShouldReturnNull()
    {
        var service = new Mock<IFamilyQueryService>();
        service.Setup(s => s.GetPersonAsync("p-9", It.IsAny<CancellationToken>())).ReturnsAsync((Person?)null);
        var store = new Mock<IPersonOverrideStore>();
        var handler = new GetPersonProfileHandler(service.Object, store.Object, Mapper());

        var result = await handler.Handle(new GetPersonProfileQuery("p-9"), CancellationToken.None);

        result.Should().BeNull();
    }

    [Fact]
    public async Task Handle_WhenOverrideExists_ShouldReturnIt()
    {
        var service = new Mock<IFamilyQueryService>();
        service.Setup(s => s.GetPersonAsync("p-1", It.IsAny<CancellationToken>())).ReturnsAsync(TestPeople.Person("p-1"));
        var store = new Mock<IPersonOverrideStore>();
        store.Setup(s => s.GetLatestProfileAsync("p-1", It.IsAny<CancellationToken>()))
             .ReturnsAsync(new PersonProfileOverride { BirthYear = 1897 });
        var handler = new GetPersonProfileHandler(service.Object, store.Object, Mapper());

        var result = await handler.Handle(new GetPersonProfileQuery("p-1"), CancellationToken.None);

        result!.BirthYear.Should().Be(1897);
    }
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `dotnet test tests/unit/FamilyTree.UnitTests --filter GetPersonProfileHandlerTests`
Expected: FAIL — query/handler do not exist.

- [ ] **Step 3: Implement**

`src/backend/FamilyTree.Application/People/GetPersonProfileQuery.cs`:

```csharp
namespace FamilyTree.Application.People;

public sealed record GetPersonProfileQuery(string Id) : IRequest<PersonProfileDto?>;
```

`src/backend/FamilyTree.Application/People/GetPersonProfileHandler.cs`:

```csharp
using FamilyTree.Application.Abstractions;
using FamilyTree.Domain;

namespace FamilyTree.Application.People;

public sealed class GetPersonProfileHandler : IRequestHandler<GetPersonProfileQuery, PersonProfileDto?>
{
    private readonly IFamilyQueryService _service;
    private readonly IPersonOverrideStore _overrides;
    private readonly IMapper _mapper;

    public GetPersonProfileHandler(IFamilyQueryService service, IPersonOverrideStore overrides, IMapper mapper)
    {
        _service = service;
        _overrides = overrides;
        _mapper = mapper;
    }

    public async Task<PersonProfileDto?> Handle(GetPersonProfileQuery request, CancellationToken cancellationToken)
    {
        var person = await _service.GetPersonAsync(request.Id, cancellationToken);
        if (person is null)
        {
            return null;
        }

        var profile = await _overrides.GetLatestProfileAsync(request.Id, cancellationToken)
                      ?? new PersonProfileOverride();
        return _mapper.Map<PersonProfileDto>(profile);
    }
}
```

> `IRequest`/`IRequestHandler`/`IMapper` come from the same usings as the biography handler (`FamilyTree.Application.Abstractions` re-exports or global usings). Match the biography handler's using list.

- [ ] **Step 4: Run test to verify it passes**

Run: `dotnet test tests/unit/FamilyTree.UnitTests --filter GetPersonProfileHandlerTests`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/backend/FamilyTree.Application/People/GetPersonProfileQuery.cs src/backend/FamilyTree.Application/People/GetPersonProfileHandler.cs tests/unit/FamilyTree.UnitTests/People/GetPersonProfileHandlerTests.cs
git commit -m "feat(app): GetPersonProfile query + handler"
```

---

## Task 8: `UpdatePersonProfileCommand` + validator

**Files:**
- Create: `src/backend/FamilyTree.Application/People/UpdatePersonProfileCommand.cs`
- Create: `src/backend/FamilyTree.Application/People/UpdatePersonProfileValidator.cs`
- Test: `tests/unit/FamilyTree.UnitTests/People/UpdatePersonProfileValidatorTests.cs`

**Interfaces:**
- Produces: `UpdatePersonProfileCommand(string Id, PersonProfileDto Profile, string EditorEmail) : IRequest<PersonDto?>`. Validator enforces single-record rules: id `^p-\d+$`; `BirthYear`/`DeathYear` within `[1000, 2100]` when present; `BirthYear <= DeathYear` when both present; each provided name `LocalizedTextDto` has at least one non-empty locale (a provided name cannot be all-blank — a null name field is fine, it means "inherit").

- [ ] **Step 1: Write the failing test**

`tests/unit/FamilyTree.UnitTests/People/UpdatePersonProfileValidatorTests.cs`:

```csharp
using FamilyTree.Application.Dtos;
using FamilyTree.Application.People;

namespace FamilyTree.UnitTests.People;

public sealed class UpdatePersonProfileValidatorTests
{
    private static UpdatePersonProfileCommand Cmd(PersonProfileDto profile, string id = "p-1") =>
        new(id, profile, "e@x");

    private static readonly UpdatePersonProfileValidator Validator = new();

    [Fact]
    public void Validate_WhenBirthAfterDeath_ShouldFail()
    {
        var result = Validator.Validate(Cmd(new PersonProfileDto(null, null, null, null, 1950, 1900, null)));
        result.IsValid.Should().BeFalse();
    }

    [Fact]
    public void Validate_WhenYearOutOfBounds_ShouldFail()
    {
        Validator.Validate(Cmd(new PersonProfileDto(null, null, null, null, 3000, null, null))).IsValid.Should().BeFalse();
    }

    [Fact]
    public void Validate_WhenProvidedNameAllBlank_ShouldFail()
    {
        var blank = new LocalizedTextDto("", "", "");
        Validator.Validate(Cmd(new PersonProfileDto(null, blank, null, null, null, null, null))).IsValid.Should().BeFalse();
    }

    [Fact]
    public void Validate_WhenOnlyBirthYearSet_ShouldPass()
    {
        Validator.Validate(Cmd(new PersonProfileDto(null, null, null, null, 1897, null, null))).IsValid.Should().BeTrue();
    }

    [Fact]
    public void Validate_WhenIdMalformed_ShouldFail()
    {
        Validator.Validate(Cmd(new PersonProfileDto(null, null, null, null, 1897, null, null), id: "bad")).IsValid.Should().BeFalse();
    }
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `dotnet test tests/unit/FamilyTree.UnitTests --filter UpdatePersonProfileValidatorTests`
Expected: FAIL — command/validator do not exist.

- [ ] **Step 3: Implement**

`src/backend/FamilyTree.Application/People/UpdatePersonProfileCommand.cs`:

```csharp
namespace FamilyTree.Application.People;

public sealed record UpdatePersonProfileCommand(
    string Id,
    PersonProfileDto Profile,
    string EditorEmail) : IRequest<PersonDto?>;
```

`src/backend/FamilyTree.Application/People/UpdatePersonProfileValidator.cs`:

```csharp
using FamilyTree.Application.Dtos;
using FluentValidation;

namespace FamilyTree.Application.People;

public sealed class UpdatePersonProfileValidator : AbstractValidator<UpdatePersonProfileCommand>
{
    private const int MinYear = 1000;
    private const int MaxYear = 2100;

    public UpdatePersonProfileValidator()
    {
        RuleFor(c => c.Id).NotEmpty().Matches("^p-\\d+$")
            .WithMessage("Person id must match the pattern 'p-<number>'.");
        RuleFor(c => c.EditorEmail).NotEmpty();
        RuleFor(c => c.Profile).NotNull();

        When(c => c.Profile is not null, () =>
        {
            RuleFor(c => c.Profile.BirthYear).InclusiveBetween(MinYear, MaxYear).When(c => c.Profile.BirthYear.HasValue);
            RuleFor(c => c.Profile.DeathYear).InclusiveBetween(MinYear, MaxYear).When(c => c.Profile.DeathYear.HasValue);
            RuleFor(c => c.Profile)
                .Must(p => !(p.BirthYear.HasValue && p.DeathYear.HasValue) || p.BirthYear!.Value <= p.DeathYear!.Value)
                .WithMessage("Birth year must not be after death year.");
            RuleFor(c => c.Profile.GivenName).Must(HaveLocaleWhenProvided).WithMessage("A provided given name must have at least one locale set.");
            RuleFor(c => c.Profile.Surname).Must(HaveLocaleWhenProvided).WithMessage("A provided surname must have at least one locale set.");
            RuleFor(c => c.Profile.MaidenName).Must(HaveLocaleWhenProvided).WithMessage("A provided maiden name must have at least one locale set.");
        });
    }

    // null name = "inherit seed" (fine). A provided name object must carry at least one locale.
    private static bool HaveLocaleWhenProvided(LocalizedTextDto? name)
    {
        if (name is null)
        {
            return true;
        }

        return !string.IsNullOrWhiteSpace(name.Ru)
            || !string.IsNullOrWhiteSpace(name.Be)
            || !string.IsNullOrWhiteSpace(name.En);
    }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `dotnet test tests/unit/FamilyTree.UnitTests --filter UpdatePersonProfileValidatorTests`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add src/backend/FamilyTree.Application/People/UpdatePersonProfileCommand.cs src/backend/FamilyTree.Application/People/UpdatePersonProfileValidator.cs tests/unit/FamilyTree.UnitTests/People/UpdatePersonProfileValidatorTests.cs
git commit -m "feat(app): UpdatePersonProfile command + validator"
```

---

## Task 9: `UpdatePersonProfileHandler` (append + cross-entity check + refresh)

**Files:**
- Create: `src/backend/FamilyTree.Application/People/UpdatePersonProfileHandler.cs`
- Test: `tests/unit/FamilyTree.UnitTests/People/UpdatePersonProfileHandlerTests.cs`

**Interfaces:**
- Consumes: `IFamilyQueryService` (`GetPersonAsync`, `GetGraphAsync`), `IPersonOverrideStore.AppendProfileAsync`, `IFamilySnapshotProvider.RefreshAsync`, `IFamilyGraphValidator.ValidateBirthYear`, `IMapper`, `ILogger<UpdatePersonProfileHandler>`.
- Produces: appends the override, refreshes the snapshot, returns the merged `PersonDto`. On a cross-entity violation it throws `ValidationException` (so the pipeline/controller maps it to 400) **before** appending. Returns `null` when the person does not exist.

- [ ] **Step 1: Write the failing test**

`tests/unit/FamilyTree.UnitTests/People/UpdatePersonProfileHandlerTests.cs`:

```csharp
using FamilyTree.Application.Abstractions;
using FamilyTree.Application.Dtos;
using FamilyTree.Application.Mapping;
using FamilyTree.Application.People;
using FamilyTree.Domain;
using FluentValidation;
using Mapster;
using MapsterMapper;
using Microsoft.Extensions.Logging.Abstractions;
using Moq;

namespace FamilyTree.UnitTests.People;

public sealed class UpdatePersonProfileHandlerTests
{
    private static IMapper Mapper()
    {
        var config = new TypeAdapterConfig();
        MappingConfig.Register(config);
        return new Mapper(config);
    }

    [Fact]
    public async Task Handle_WhenValid_ShouldAppendAndRefreshAndReturnMerged()
    {
        var person = TestPeople.Person("p-1", birthYear: 1898);
        var service = new Mock<IFamilyQueryService>();
        service.Setup(s => s.GetPersonAsync("p-1", It.IsAny<CancellationToken>())).ReturnsAsync(person);
        service.Setup(s => s.GetGraphAsync(It.IsAny<CancellationToken>())).ReturnsAsync(new FamilyGraph([person], []));
        var store = new Mock<IPersonOverrideStore>();
        var snapshot = new Mock<IFamilySnapshotProvider>();
        var validator = new Mock<IFamilyGraphValidator>();
        validator.Setup(v => v.ValidateBirthYear(It.IsAny<FamilyGraph>(), "p-1", 1897)).Returns(GraphValidationResult.Ok());
        var handler = new UpdatePersonProfileHandler(service.Object, store.Object, snapshot.Object, validator.Object, Mapper(), NullLogger<UpdatePersonProfileHandler>.Instance);

        var result = await handler.Handle(
            new UpdatePersonProfileCommand("p-1", new PersonProfileDto(null, null, null, null, 1897, null, null), "e@x"),
            CancellationToken.None);

        result.Should().NotBeNull();
        store.Verify(s => s.AppendProfileAsync("p-1", It.Is<PersonProfileOverride>(p => p.BirthYear == 1897), "e@x", It.IsAny<CancellationToken>()), Times.Once);
        snapshot.Verify(s => s.RefreshAsync(It.IsAny<CancellationToken>()), Times.Once);
    }

    [Fact]
    public async Task Handle_WhenCrossEntityInvalid_ShouldThrowAndNotAppend()
    {
        var person = TestPeople.Person("p-1", birthYear: 1898);
        var service = new Mock<IFamilyQueryService>();
        service.Setup(s => s.GetPersonAsync("p-1", It.IsAny<CancellationToken>())).ReturnsAsync(person);
        service.Setup(s => s.GetGraphAsync(It.IsAny<CancellationToken>())).ReturnsAsync(new FamilyGraph([person], []));
        var store = new Mock<IPersonOverrideStore>();
        var snapshot = new Mock<IFamilySnapshotProvider>();
        var validator = new Mock<IFamilyGraphValidator>();
        validator.Setup(v => v.ValidateBirthYear(It.IsAny<FamilyGraph>(), "p-1", 1500)).Returns(GraphValidationResult.Fail("bad"));
        var handler = new UpdatePersonProfileHandler(service.Object, store.Object, snapshot.Object, validator.Object, Mapper(), NullLogger<UpdatePersonProfileHandler>.Instance);

        var act = () => handler.Handle(
            new UpdatePersonProfileCommand("p-1", new PersonProfileDto(null, null, null, null, 1500, null, null), "e@x"),
            CancellationToken.None);

        await act.Should().ThrowAsync<ValidationException>();
        store.Verify(s => s.AppendProfileAsync(It.IsAny<string>(), It.IsAny<PersonProfileOverride>(), It.IsAny<string>(), It.IsAny<CancellationToken>()), Times.Never);
    }

    [Fact]
    public async Task Handle_WhenPersonMissing_ShouldReturnNull()
    {
        var service = new Mock<IFamilyQueryService>();
        service.Setup(s => s.GetPersonAsync("p-9", It.IsAny<CancellationToken>())).ReturnsAsync((Person?)null);
        var handler = new UpdatePersonProfileHandler(service.Object, Mock.Of<IPersonOverrideStore>(), Mock.Of<IFamilySnapshotProvider>(), Mock.Of<IFamilyGraphValidator>(), Mapper(), NullLogger<UpdatePersonProfileHandler>.Instance);

        var result = await handler.Handle(new UpdatePersonProfileCommand("p-9", new PersonProfileDto(null, null, null, null, 1897, null, null), "e@x"), CancellationToken.None);

        result.Should().BeNull();
    }
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `dotnet test tests/unit/FamilyTree.UnitTests --filter UpdatePersonProfileHandlerTests`
Expected: FAIL — handler does not exist.

- [ ] **Step 3: Implement**

`src/backend/FamilyTree.Application/People/UpdatePersonProfileHandler.cs`:

```csharp
using FamilyTree.Application.Abstractions;
using FamilyTree.Domain;
using FluentValidation;
using FluentValidation.Results;
using Microsoft.Extensions.Logging;

namespace FamilyTree.Application.People;

public sealed class UpdatePersonProfileHandler : IRequestHandler<UpdatePersonProfileCommand, PersonDto?>
{
    private readonly IFamilyQueryService _service;
    private readonly IPersonOverrideStore _overrides;
    private readonly IFamilySnapshotProvider _snapshot;
    private readonly IFamilyGraphValidator _graphValidator;
    private readonly IMapper _mapper;
    private readonly ILogger<UpdatePersonProfileHandler> _logger;

    public UpdatePersonProfileHandler(
        IFamilyQueryService service,
        IPersonOverrideStore overrides,
        IFamilySnapshotProvider snapshot,
        IFamilyGraphValidator graphValidator,
        IMapper mapper,
        ILogger<UpdatePersonProfileHandler> logger)
    {
        _service = service;
        _overrides = overrides;
        _snapshot = snapshot;
        _graphValidator = graphValidator;
        _mapper = mapper;
        _logger = logger;
    }

    public async Task<PersonDto?> Handle(UpdatePersonProfileCommand request, CancellationToken cancellationToken)
    {
        var existing = await _service.GetPersonAsync(request.Id, cancellationToken);
        if (existing is null)
        {
            return null;
        }

        // Cross-entity check needs the whole graph — a single-record validator cannot do it.
        var graph = await _service.GetGraphAsync(cancellationToken);
        var check = _graphValidator.ValidateBirthYear(graph, request.Id, request.Profile.BirthYear);
        if (!check.IsValid)
        {
            _logger.LogWarning("Rejected profile edit for {PersonId}: {Reason}", request.Id, check.Error);
            throw new ValidationException(new[] { new ValidationFailure("Profile.BirthYear", check.Error) });
        }

        var profile = _mapper.Map<PersonProfileOverride>(request.Profile);
        await _overrides.AppendProfileAsync(request.Id, profile, request.EditorEmail, cancellationToken);
        await _snapshot.RefreshAsync(cancellationToken);

        var merged = await _service.GetPersonAsync(request.Id, cancellationToken);
        _logger.LogInformation("Profile for person {PersonId} updated.", request.Id);
        return merged is null ? null : _mapper.Map<PersonDto>(merged);
    }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `dotnet test tests/unit/FamilyTree.UnitTests --filter UpdatePersonProfileHandlerTests`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/backend/FamilyTree.Application/People/UpdatePersonProfileHandler.cs tests/unit/FamilyTree.UnitTests/People/UpdatePersonProfileHandlerTests.cs
git commit -m "feat(app): UpdatePersonProfile handler with cross-entity check"
```

---

## Task 10: Controller endpoints `GET`/`PUT` `/api/people/{id}/profile` + integration test + curl proof

**Files:**
- Modify: `src/backend/FamilyTree.Api/Controllers/PeopleController.cs`
- Test: `tests/integration/FamilyTree.IntegrationTests/PeopleProfileEndpointsTests.cs`

**Interfaces:**
- Consumes: `GetPersonProfileQuery`, `UpdatePersonProfileCommand`.
- Produces: `GET /api/people/{id}/profile` → `PersonProfileDto` (200) / 404; `PUT /api/people/{id}/profile` (`[Authorize(Policy="CanEdit")]`) → merged `PersonDto` (200) / 404 / 400 (validation).

- [ ] **Step 1: Write the failing integration test**

`tests/integration/FamilyTree.IntegrationTests/PeopleProfileEndpointsTests.cs` — mirror the existing biography endpoint integration test's `WebApplicationFactory` + auth setup (reuse the test editor auth handler the biography tests use).

```csharp
using System.Net;
using System.Net.Http.Json;
using FamilyTree.Application.Dtos;

namespace FamilyTree.IntegrationTests;

public sealed class PeopleProfileEndpointsTests : IClassFixture<FamilyApiFactory>
{
    private readonly FamilyApiFactory _factory;
    public PeopleProfileEndpointsTests(FamilyApiFactory factory) => _factory = factory;

    [Fact]
    public async Task GetProfile_WhenPersonExists_ShouldReturn200()
    {
        var client = _factory.CreateClient();
        var response = await client.GetAsync("/api/people/p-1/profile");
        response.StatusCode.Should().Be(HttpStatusCode.OK);
    }

    [Fact]
    public async Task PutProfile_WhenNotSignedIn_ShouldReturn401()
    {
        var client = _factory.CreateClient();
        var response = await client.PutAsJsonAsync("/api/people/p-1/profile",
            new PersonProfileDto(null, null, null, null, 1897, null, null));
        response.StatusCode.Should().Be(HttpStatusCode.Unauthorized);
    }

    [Fact]
    public async Task PutProfile_WhenEditorEditsBirthYear_ShouldPersistAndReflectInGraph()
    {
        var client = _factory.CreateEditorClient(); // helper: authenticated as an allow-listed editor
        var put = await client.PutAsJsonAsync("/api/people/p-1/profile",
            new PersonProfileDto(null, null, null, null, 1897, null, null));
        put.StatusCode.Should().Be(HttpStatusCode.OK);

        // The corrected value is visible in the merged graph the tree reads (the split-brain check).
        var graph = await client.GetFromJsonAsync<FamilyGraphDto>("/api/family/graph");
        graph!.People.Single(p => p.Id == "p-1").BirthYear.Should().Be(1897);
    }
}
```

> Reuse the integration-test factory + editor-auth helper the biography endpoint tests use. If `CreateEditorClient` does not exist, add it to the factory the same way the biography tests authenticate an editor. Pick `p-1` (or any id present in the test `family.json`).

- [ ] **Step 2: Run test to verify it fails**

Run: `dotnet test tests/integration/FamilyTree.IntegrationTests --filter PeopleProfileEndpointsTests`
Expected: FAIL — endpoints return 404 (not yet mapped).

- [ ] **Step 3: Implement the endpoints**

In `PeopleController.cs`, add (after `UpdateBiography`, mirroring its shape):

```csharp
    [HttpGet("{id}/profile")]
    public async Task<ActionResult<PersonProfileDto>> GetProfile(string id, CancellationToken cancellationToken)
    {
        var profile = await _sender.Send(new GetPersonProfileQuery(id), cancellationToken);
        return profile is null ? NotFound() : Ok(profile);
    }

    [HttpPut("{id}/profile")]
    [Authorize(Policy = "CanEdit")]
    public async Task<ActionResult<PersonDto>> UpdateProfile(
        string id,
        [FromBody] PersonProfileDto profile,
        CancellationToken cancellationToken)
    {
        var editorEmail = User.FindFirstValue(ClaimTypes.Email) ?? "";
        var person = await _sender.Send(new UpdatePersonProfileCommand(id, profile, editorEmail), cancellationToken);
        return person is null ? NotFound() : Ok(person);
    }
```

Add `using FamilyTree.Application.Dtos;` if not already present.

> The `ValidationException` thrown by the handler is turned into a 400 by the existing `ValidationBehavior`/global exception handler (same path as biography validation). Confirm the biography endpoint returns 400 on invalid input and that this reuses it; if biography validation surfaces differently, match that.

- [ ] **Step 4: Run test to verify it passes**

Run: `dotnet test tests/integration/FamilyTree.IntegrationTests --filter PeopleProfileEndpointsTests`
Expected: PASS (3 tests).

- [ ] **Step 5: Prove it by curl (the risk-first checkpoint), then commit**

Start the API and (as an allow-listed editor session cookie) run the manual proof from the design doc's Next Steps:

```bash
# with the API running (see CLAUDE.md) and a valid editor session cookie in $COOKIE:
curl -s -X PUT http://localhost:5037/api/people/p-1/profile \
  -H 'Content-Type: application/json' -H "Cookie: $COOKIE" \
  -d '{"birthYear":1897}'
curl -s http://localhost:5037/api/family/graph | grep -o '"id":"p-1"[^}]*'
```
Expected: the graph shows the corrected birth year for `p-1`. This confirms the snapshot-layer merge end-to-end before any UI exists.

```bash
git add src/backend/FamilyTree.Api/Controllers/PeopleController.cs tests/integration/FamilyTree.IntegrationTests/PeopleProfileEndpointsTests.cs
git commit -m "feat(api): GET/PUT /api/people/{id}/profile endpoints"
```

---

## Task 11: Extend `personMatchesQuery` to maiden name

**Files:**
- Modify: `src/frontend/src/composables/useSearchMatches.ts`
- Test: `src/frontend/src/composables/useSearchMatches.spec.ts` (add cases; create if absent)

**Interfaces:**
- Consumes: `PersonSummary` (has `maidenName: LocalizedText | null`), `localize`.
- Produces: `personMatchesQuery` also matches a person's localized maiden name. This is the shared predicate — the change also improves the nav-bar tree search (intended, additive).

- [ ] **Step 1: Write the failing test**

Add to `src/frontend/src/composables/useSearchMatches.spec.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { personMatchesQuery } from './useSearchMatches';
import type { PersonSummary } from '../types/family';

function person(overrides: Partial<PersonSummary>): PersonSummary {
  return {
    id: 'p-1',
    givenName: { ru: 'Анна', be: 'Ганна', en: 'Anna' },
    surname: { ru: 'Петрова', be: 'Пятрова', en: 'Petrova' },
    maidenName: null,
    sex: 'female', birthYear: 1950, deathYear: null, vocation: 'unknown',
    portrait: null, portraitVideo: null,
    parents: { motherId: null, fatherId: null },
    marriedIntoFamily: false, isDefaultRoot: false,
    ...overrides
  };
}

describe('personMatchesQuery — maiden name', () => {
  it('matches the localized maiden name', () => {
    const p = person({ maidenName: { ru: 'Иванова', be: 'Іванова', en: 'Ivanova' } });
    expect(personMatchesQuery(p, 'Иванова', 'ru')).toBe(true);
  });

  it('does not throw when maiden name is null', () => {
    expect(personMatchesQuery(person({ maidenName: null }), 'Иванова', 'ru')).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm --prefix src/frontend test -- useSearchMatches`
Expected: FAIL — maiden name not matched.

- [ ] **Step 3: Implement**

In `useSearchMatches.ts`, extend `personMatchesQuery` to include the maiden name (localize returns `''` for a null field, so it is safe):

```typescript
  const given = localize(person.givenName, locale).toLowerCase();
  const surname = localize(person.surname, locale).toLowerCase();
  const maiden = person.maidenName ? localize(person.maidenName, locale).toLowerCase() : '';
  return (
    given.includes(q) ||
    surname.includes(q) ||
    (maiden !== '' && maiden.includes(q)) ||
    `${given} ${surname}`.includes(q) ||
    `${surname} ${given}`.includes(q)
  );
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm --prefix src/frontend test -- useSearchMatches`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/frontend/src/composables/useSearchMatches.ts src/frontend/src/composables/useSearchMatches.spec.ts
git commit -m "feat(search): match maiden name in the shared predicate"
```

---

## Task 12: `useRelatives` composable

**Files:**
- Create: `src/frontend/src/composables/useRelatives.ts`
- Test: `src/frontend/src/composables/useRelatives.spec.ts`

**Interfaces:**
- Consumes: `PersonSummary[]`, `Union[]` (from the family store / graph).
- Produces: `deriveRelatives(personId: string, people: PersonSummary[], unions: Union[]): Relatives` where `Relatives = { parents: PersonSummary[]; siblings: PersonSummary[]; spouses: PersonSummary[]; children: PersonSummary[] }`. Siblings = people sharing at least one parent id (excluding self). Spouses/children derived from unions the person partners in. Deterministic order: by birth year ascending, then id. Pure function (a thin `useRelatives(personId)` composable can wrap it over the store later; the pure function is what carries the tests).

- [ ] **Step 1: Write the failing test**

`src/frontend/src/composables/useRelatives.spec.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { deriveRelatives } from './useRelatives';
import type { PersonSummary, Union } from '../types/family';

function p(id: string, extra: Partial<PersonSummary> = {}): PersonSummary {
  return {
    id, givenName: { ru: id, be: id, en: id }, surname: { ru: '', be: '', en: '' },
    maidenName: null, sex: 'unknown', birthYear: null, deathYear: null, vocation: 'unknown',
    portrait: null, portraitVideo: null, parents: { motherId: null, fatherId: null },
    marriedIntoFamily: false, isDefaultRoot: false, ...extra
  };
}

describe('deriveRelatives', () => {
  const father = p('p-f', { birthYear: 1900 });
  const mother = p('p-m', { birthYear: 1902 });
  const self = p('p-1', { birthYear: 1925, parents: { fatherId: 'p-f', motherId: 'p-m' } });
  const sibling = p('p-2', { birthYear: 1928, parents: { fatherId: 'p-f', motherId: 'p-m' } });
  const halfSibling = p('p-3', { birthYear: 1930, parents: { fatherId: 'p-f', motherId: null } });
  const spouse = p('p-s', { birthYear: 1924 });
  const child = p('p-c', { birthYear: 1950 });
  const people = [father, mother, self, sibling, halfSibling, spouse, child];
  const unions: Union[] = [{ id: 'u-1', partnerIds: ['p-1', 'p-s'], marriageYear: 1948, childIds: ['p-c'] }];

  it('derives parents', () => {
    expect(deriveRelatives('p-1', people, unions).parents.map(x => x.id)).toEqual(['p-f', 'p-m']);
  });

  it('derives siblings including half-siblings (shares >=1 parent), excluding self', () => {
    expect(deriveRelatives('p-1', people, unions).siblings.map(x => x.id)).toEqual(['p-2', 'p-3']);
  });

  it('derives spouses and children from unions', () => {
    const r = deriveRelatives('p-1', people, unions);
    expect(r.spouses.map(x => x.id)).toEqual(['p-s']);
    expect(r.children.map(x => x.id)).toEqual(['p-c']);
  });

  it('returns empty arrays for an unknown person', () => {
    const r = deriveRelatives('p-x', people, unions);
    expect(r).toEqual({ parents: [], siblings: [], spouses: [], children: [] });
  });

  it('does not list self as its own sibling', () => {
    expect(deriveRelatives('p-1', people, unions).siblings.map(x => x.id)).not.toContain('p-1');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm --prefix src/frontend test -- useRelatives`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

`src/frontend/src/composables/useRelatives.ts`:

```typescript
import type { PersonSummary, Union } from '../types/family';

export interface Relatives {
  parents: PersonSummary[];
  siblings: PersonSummary[];
  spouses: PersonSummary[];
  children: PersonSummary[];
}

const EMPTY: Relatives = { parents: [], siblings: [], spouses: [], children: [] };

function byBirthThenId(a: PersonSummary, b: PersonSummary): number {
  const ay = a.birthYear ?? Number.POSITIVE_INFINITY;
  const by = b.birthYear ?? Number.POSITIVE_INFINITY;
  return ay !== by ? ay - by : a.id.localeCompare(b.id);
}

/**
 * Derives a person's immediate family from the flat people list + unions.
 * Siblings share at least one parent id (half-siblings included). Pure and side-effect free
 * so it is unit-testable and reusable by the future add/remove-relative flow (cut 2).
 */
export function deriveRelatives(personId: string, people: PersonSummary[], unions: Union[]): Relatives {
  const byId = new Map(people.map(person => [person.id, person]));
  const self = byId.get(personId);
  if (!self) {
    return { ...EMPTY };
  }

  const parentIds = [self.parents.fatherId, self.parents.motherId].filter((id): id is string => id !== null);
  const parents = parentIds.map(id => byId.get(id)).filter((x): x is PersonSummary => x !== undefined);

  const parentIdSet = new Set(parentIds);
  const siblings = parentIds.length === 0
    ? []
    : people.filter(candidate =>
        candidate.id !== personId &&
        (
          (candidate.parents.fatherId !== null && parentIdSet.has(candidate.parents.fatherId)) ||
          (candidate.parents.motherId !== null && parentIdSet.has(candidate.parents.motherId))
        )
      ).sort(byBirthThenId);

  const spouseIds = new Set<string>();
  const childIds = new Set<string>();
  for (const union of unions) {
    if (!union.partnerIds.includes(personId)) {
      continue;
    }
    for (const partnerId of union.partnerIds) {
      if (partnerId !== personId) {
        spouseIds.add(partnerId);
      }
    }
    for (const c of union.childIds) {
      childIds.add(c);
    }
  }

  const resolve = (ids: Set<string>): PersonSummary[] =>
    [...ids].map(id => byId.get(id)).filter((x): x is PersonSummary => x !== undefined).sort(byBirthThenId);

  return { parents, siblings, spouses: resolve(spouseIds), children: resolve(childIds) };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm --prefix src/frontend test -- useRelatives`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add src/frontend/src/composables/useRelatives.ts src/frontend/src/composables/useRelatives.spec.ts
git commit -m "feat(members): useRelatives derivation composable"
```

---

## Task 13: Route + enable the Members tab

**Files:**
- Modify: `src/frontend/src/router/index.ts`
- Modify: `src/frontend/src/components/TabNav.vue`
- Create: `src/frontend/src/views/MembersView.vue` (placeholder shell — filled in Task 14)
- Test: `src/frontend/src/components/TabNav.spec.ts` (add case)

**Interfaces:**
- Produces: route `{ path: '/members/:slug?', name: 'members', component: MembersView }`; the `members` tab enabled and active on the members route.

- [ ] **Step 1: Write the failing test**

Add to `src/frontend/src/components/TabNav.spec.ts` a case asserting the members tab is enabled (not `disabled`). Follow the existing spec's mount + router-stub setup. Example assertion:

```typescript
it('renders the members tab as enabled', () => {
  const wrapper = mountTabNav(); // existing helper
  const membersTab = wrapper.get('[data-test="tab-members"]');
  expect(membersTab.attributes('disabled')).toBeUndefined();
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm --prefix src/frontend test -- TabNav`
Expected: FAIL — members tab is `disabled`.

- [ ] **Step 3: Implement**

Create the placeholder `src/frontend/src/views/MembersView.vue`:

```vue
<script setup lang="ts">
// Filled in Task 14.
</script>

<template>
  <main class="members" data-test="members-view"></main>
</template>
```

In `src/frontend/src/router/index.ts`, import and register the route:

```typescript
import MembersView from '../views/MembersView.vue';
```
```typescript
    { path: '/members/:slug?', name: 'members', component: MembersView },
```
(add it alongside the existing routes, before the catch-all if any).

In `src/frontend/src/components/TabNav.vue`, enable the slot and teach `activeId` about the route:

```typescript
  { id: 'members', key: 'nav.members', to: '/members', enabled: true },
```
```typescript
const activeId = computed<TabId>(() =>
  route.name === 'chronicle' ? 'chronicle'
  : route.name === 'members' ? 'members'
  : 'tree'
);
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm --prefix src/frontend test -- TabNav`
Expected: PASS. Also run `npm --prefix src/frontend run build` to confirm the route + import type-check.

- [ ] **Step 5: Commit**

```bash
git add src/frontend/src/router/index.ts src/frontend/src/components/TabNav.vue src/frontend/src/views/MembersView.vue src/frontend/src/components/TabNav.spec.ts
git commit -m "feat(members): route + enabled nav tab"
```

---

## Task 14: `MembersView` + `MembersIndex` (searchable roster)

**Files:**
- Modify: `src/frontend/src/views/MembersView.vue`
- Create: `src/frontend/src/components/MembersIndex.vue`
- Modify: `src/frontend/src/i18n` locale files (add `members.searchPlaceholder`, `members.count`, `members.empty`, `status.loading`, `status.error` if missing) for ru/be/en.
- Test: `src/frontend/src/components/MembersIndex.spec.ts`

**Interfaces:**
- Consumes: `useFamilyStore` (`people`, `unions`, `loading`, `error`, `load`), `personMatchesQuery`, `useLocaleStore`, vue-router.
- Produces: `MembersView` loads the graph on mount, reads `:slug` → selected person id (via the shared slug scheme's embedded id), renders `MembersIndex` + `MemberDetail`. `MembersIndex` shows a search box + filtered, locale-sorted rows; selecting a row routes to `/members/:slug`.

- [ ] **Step 1: Write the failing test**

`src/frontend/src/components/MembersIndex.spec.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';
import { createTestingPinia } from '@pinia/testing';
import { createI18n } from 'vue-i18n';
import MembersIndex from './MembersIndex.vue';
import type { PersonSummary } from '../types/family';

function person(id: string, given: string): PersonSummary {
  return {
    id, givenName: { ru: given, be: given, en: given }, surname: { ru: 'Тест', be: 'Тэст', en: 'Test' },
    maidenName: null, sex: 'unknown', birthYear: 1950, deathYear: null, vocation: 'unknown',
    portrait: null, portraitVideo: null, parents: { motherId: null, fatherId: null },
    marriedIntoFamily: false, isDefaultRoot: false
  };
}

const i18n = createI18n({ legacy: false, locale: 'ru', messages: { ru: { members: { searchPlaceholder: 'x', count: '{n}', empty: 'none' } } } });

function mountIndex(people: PersonSummary[]) {
  return mount(MembersIndex, {
    props: { people, selectedId: null },
    global: { plugins: [createTestingPinia(), i18n] }
  });
}

describe('MembersIndex', () => {
  it('renders a row per person', () => {
    const wrapper = mountIndex([person('p-1', 'Анна'), person('p-2', 'Борис')]);
    expect(wrapper.findAll('[data-test="member-row"]')).toHaveLength(2);
  });

  it('filters by the search query', async () => {
    const wrapper = mountIndex([person('p-1', 'Анна'), person('p-2', 'Борис')]);
    await wrapper.get('[data-test="members-search"]').setValue('Анна');
    expect(wrapper.findAll('[data-test="member-row"]')).toHaveLength(1);
  });

  it('emits select with the person id on row click', async () => {
    const wrapper = mountIndex([person('p-1', 'Анна')]);
    await wrapper.get('[data-test="member-row"]').trigger('click');
    expect(wrapper.emitted('select')?.[0]).toEqual(['p-1']);
  });

  it('shows the empty state when nothing matches', async () => {
    const wrapper = mountIndex([person('p-1', 'Анна')]);
    await wrapper.get('[data-test="members-search"]').setValue('zzz');
    expect(wrapper.get('[data-test="members-empty"]').isVisible()).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm --prefix src/frontend test -- MembersIndex`
Expected: FAIL — component not found.

- [ ] **Step 3: Implement `MembersIndex.vue`**

`src/frontend/src/components/MembersIndex.vue`:

```vue
<script setup lang="ts">
import { computed, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { useLocaleStore } from '../stores/localeStore';
import { localize } from '../i18n/localize';
import { personMatchesQuery } from '../composables/useSearchMatches';
import type { PersonSummary } from '../types/family';

const props = defineProps<{ people: PersonSummary[]; selectedId: string | null }>();
const emit = defineEmits<{ select: [id: string] }>();

const { t } = useI18n({ useScope: 'global' });
const locale = useLocaleStore();
const query = ref('');

const filtered = computed<PersonSummary[]>(() => {
  const q = query.value.trim();
  const list = q === ''
    ? [...props.people]
    : props.people.filter(p => personMatchesQuery(p, q, locale.currentLocale));
  return list.sort((a, b) =>
    localize(a.surname, locale.currentLocale).localeCompare(localize(b.surname, locale.currentLocale), locale.currentLocale)
  );
});

function fullName(p: PersonSummary): string {
  return `${localize(p.givenName, locale.currentLocale)} ${localize(p.surname, locale.currentLocale)}`.trim();
}
function years(p: PersonSummary): string {
  return `${p.birthYear ?? '—'} – ${p.deathYear ?? ''}`.trim();
}
</script>

<template>
  <div class="members-index" data-test="members-index">
    <input
      v-model="query"
      type="search"
      class="members-index__search"
      data-test="members-search"
      :placeholder="t('members.searchPlaceholder')"
      :aria-label="t('members.searchPlaceholder')"
    />
    <ul class="members-index__list" role="listbox">
      <li
        v-for="p in filtered"
        :key="p.id"
        role="option"
        :aria-selected="p.id === props.selectedId"
        class="members-index__row"
        :class="{ 'members-index__row--selected': p.id === props.selectedId }"
        data-test="member-row"
        tabindex="0"
        @click="emit('select', p.id)"
        @keydown.enter="emit('select', p.id)"
      >
        <img v-if="p.portraitThumb || p.portrait" class="members-index__thumb" :src="(p.portraitThumb || p.portrait) as string" alt="" />
        <span v-else class="members-index__thumb members-index__thumb--empty" aria-hidden="true"></span>
        <span class="members-index__name">{{ fullName(p) }}</span>
        <span class="members-index__years">{{ years(p) }}</span>
      </li>
    </ul>
    <p v-if="filtered.length === 0" class="members-index__empty" data-test="members-empty">{{ t('members.empty') }}</p>
    <p class="members-index__count">{{ t('members.count', { n: filtered.length }) }}</p>
  </div>
</template>

<style scoped lang="scss">
.members-index {
  display: flex; flex-direction: column; height: 100%; min-height: 0;
  &__search {
    width: 100%; padding: 10px 12px; margin-bottom: 8px;
    background: var(--field-bg); border: 1px solid var(--panel-edge); border-radius: 8px; color: var(--ink);
  }
  &__list { flex: 1; min-height: 0; overflow-y: auto; list-style: none; margin: 0; padding: 0; }
  &__row {
    display: grid; grid-template-columns: 40px 1fr auto; align-items: center; gap: 10px;
    padding: 8px 10px; border-radius: 8px; cursor: pointer; min-height: 44px;
    &:hover { background: var(--control-hover); }
    &:focus-visible { outline: 2px solid var(--gilt); outline-offset: 2px; }
    &--selected { background: var(--panel); box-shadow: inset 0 -1px 0 var(--gilt); }
  }
  &__thumb { width: 40px; height: 40px; border-radius: 50%; object-fit: cover; }
  &__thumb--empty { background: var(--field-bg); border: 1px solid var(--panel-edge); }
  &__name { font-family: var(--font-display); color: var(--ink); }
  &__years { font-family: var(--font-body); font-style: italic; color: var(--ink-soft); font-size: 14px; }
  &__empty { padding: 16px; color: var(--ink-soft); font-style: italic; text-align: center; }
  &__count { margin: 6px 0 0; font-size: 12px; color: var(--ink-soft); text-align: center; }
}
</style>
```

Add the i18n keys to each locale file (ru/be/en) under a `members` object: `searchPlaceholder`, `count` (`"{n} members"` / localized), `empty`. Use the existing locale-file structure.

- [ ] **Step 4: Implement `MembersView.vue` + run tests**

`src/frontend/src/views/MembersView.vue`:

```vue
<script setup lang="ts">
import { computed, onMounted } from 'vue';
import { storeToRefs } from 'pinia';
import { useI18n } from 'vue-i18n';
import { useRoute, useRouter } from 'vue-router';
import { useFamilyStore } from '../stores/familyStore';
import { personSlug, idFromSlug } from '../router/slug'; // existing friendly-slug helpers
import MembersIndex from '../components/MembersIndex.vue';
import MemberDetail from '../components/MemberDetail.vue';

const store = useFamilyStore();
const { people, loading, error } = storeToRefs(store);
const { t } = useI18n({ useScope: 'global' });
const route = useRoute();
const router = useRouter();

onMounted(() => {
  if (store.people.length === 0) {
    void store.load();
  }
});

const selectedId = computed<string | null>(() => {
  const slug = route.params.slug;
  return typeof slug === 'string' && slug !== '' ? idFromSlug(slug) : null;
});

function select(id: string): void {
  const person = store.personById(id);
  void router.push({ name: 'members', params: { slug: person ? personSlug(person) : id } });
}
</script>

<template>
  <main class="members" data-test="members-view">
    <p v-if="loading" class="members__status">{{ t('status.loading') }}</p>
    <p v-else-if="error" class="members__status members__status--error">{{ t('status.error') }}</p>
    <div v-else class="members__layout">
      <MembersIndex class="members__index" :people="people" :selected-id="selectedId" @select="select" />
      <MemberDetail v-if="selectedId" class="members__detail" :person-id="selectedId" />
      <p v-else class="members__hint">{{ t('members.pickHint') }}</p>
    </div>
  </main>
</template>

<style scoped lang="scss">
.members { height: 100%; overflow: hidden; }
.members__status { padding: 24px; font-style: italic; color: var(--ink-soft); &--error { color: #8a3b32; } }
.members__layout { display: grid; grid-template-columns: minmax(260px, 340px) 1fr; gap: 16px; height: 100%; padding: 16px; }
.members__index { min-height: 0; }
.members__detail { min-height: 0; overflow-y: auto; }
.members__hint { color: var(--ink-soft); font-style: italic; align-self: start; padding: 24px; }
@media (max-width: 720px) {
  .members__layout { grid-template-columns: 1fr; }
  // Mobile list→detail stacking is refined during the read-only build; when a member is
  // selected the detail takes over and a back control returns to the index (see design doc).
}
</style>
```

> Confirm the friendly-slug helper module + function names (`personSlug`, `idFromSlug`) by checking how `/person/:slug` resolves today (`src/frontend/src/router/`); reuse those exact functions rather than re-implementing. If the id is embedded and parsed elsewhere, import from there.

Run: `npm --prefix src/frontend test -- MembersIndex` (PASS) and `npm --prefix src/frontend run build` (type-check passes; `MemberDetail` exists after Task 15 — if building before Task 15, temporarily stub `MemberDetail` import, or reorder to implement Task 15 first).

- [ ] **Step 5: Commit**

```bash
git add src/frontend/src/views/MembersView.vue src/frontend/src/components/MembersIndex.vue src/frontend/src/components/MembersIndex.spec.ts src/frontend/src/i18n
git commit -m "feat(members): searchable roster index + view shell"
```

---

## Task 15: `MemberDetail` + `MemberFamilySheet` (read-only dossier + family)

**Files:**
- Create: `src/frontend/src/components/MemberDetail.vue`
- Create: `src/frontend/src/components/MemberFamilySheet.vue`
- Test: `src/frontend/src/components/MemberFamilySheet.spec.ts`

**Interfaces:**
- Consumes: `fetchPerson` (detail), `useFamilyStore` (`people`, `unions`, `personById`), `deriveRelatives`, `PersonPhotos` (read-only gallery — `:can-edit="false"`), existing `PersonHeader`/portrait if reusable, vue-router (relative navigation).
- Produces: `MemberDetail` fetches `PersonDetail` for `:personId`, renders header + read-only fields + biography + residences (read-only) + gallery + `MemberFamilySheet`. `MemberFamilySheet` renders parents/spouses/siblings/children as clickable relatives; clicking selects that person (routes to `/members/:slug`). No inert add-slots rendered (layout leaves room for cut 2).

- [ ] **Step 1: Write the failing test**

`src/frontend/src/components/MemberFamilySheet.spec.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';
import { createI18n } from 'vue-i18n';
import MemberFamilySheet from './MemberFamilySheet.vue';
import type { PersonSummary, Union } from '../types/family';

function p(id: string): PersonSummary {
  return {
    id, givenName: { ru: id, be: id, en: id }, surname: { ru: '', be: '', en: '' },
    maidenName: null, sex: 'unknown', birthYear: 1950, deathYear: null, vocation: 'unknown',
    portrait: null, portraitVideo: null, parents: { motherId: null, fatherId: null },
    marriedIntoFamily: false, isDefaultRoot: false
  };
}

const i18n = createI18n({ legacy: false, locale: 'ru', messages: { ru: { members: { parents: 'P', siblings: 'S', spouse: 'Sp', children: 'C' } } } });

describe('MemberFamilySheet', () => {
  const father = { ...p('p-f'), birthYear: 1900 };
  const self = { ...p('p-1'), parents: { fatherId: 'p-f', motherId: null } };
  const child = { ...p('p-c'), birthYear: 1975 };
  const people = [father, self, child];
  const unions: Union[] = [{ id: 'u-1', partnerIds: ['p-1'], marriageYear: null, childIds: ['p-c'] }];

  it('renders clickable parents and children', () => {
    const wrapper = mount(MemberFamilySheet, {
      props: { personId: 'p-1', people, unions },
      global: { plugins: [i18n] }
    });
    const relatives = wrapper.findAll('[data-test="relative-chip"]');
    expect(relatives.length).toBe(2); // father + child
  });

  it('emits select when a relative is clicked', async () => {
    const wrapper = mount(MemberFamilySheet, {
      props: { personId: 'p-1', people, unions },
      global: { plugins: [i18n] }
    });
    await wrapper.get('[data-test="relative-chip"]').trigger('click');
    expect(wrapper.emitted('select')).toBeTruthy();
  });

  it('renders no inert add-slot placeholders in cut 1', () => {
    const wrapper = mount(MemberFamilySheet, {
      props: { personId: 'p-1', people, unions },
      global: { plugins: [i18n] }
    });
    expect(wrapper.find('[data-test="add-slot"]').exists()).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm --prefix src/frontend test -- MemberFamilySheet`
Expected: FAIL — component not found.

- [ ] **Step 3: Implement `MemberFamilySheet.vue`**

`src/frontend/src/components/MemberFamilySheet.vue`:

```vue
<script setup lang="ts">
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { useLocaleStore } from '../stores/localeStore';
import { localize } from '../i18n/localize';
import { deriveRelatives } from '../composables/useRelatives';
import type { PersonSummary, Union } from '../types/family';

const props = defineProps<{ personId: string; people: PersonSummary[]; unions: Union[] }>();
const emit = defineEmits<{ select: [id: string] }>();

const { t } = useI18n({ useScope: 'global' });
const locale = useLocaleStore();
const relatives = computed(() => deriveRelatives(props.personId, props.people, props.unions));

const groups = computed(() => [
  { key: 'parents', label: t('members.parents'), members: relatives.value.parents },
  { key: 'spouse', label: t('members.spouse'), members: relatives.value.spouses },
  { key: 'siblings', label: t('members.siblings'), members: relatives.value.siblings },
  { key: 'children', label: t('members.children'), members: relatives.value.children }
].filter(g => g.members.length > 0));

function name(p: PersonSummary): string {
  return `${localize(p.givenName, locale.currentLocale)} ${localize(p.surname, locale.currentLocale)}`.trim();
}
</script>

<template>
  <section class="family-sheet" data-test="family-sheet" :aria-label="t('members.familyLabel')">
    <div v-for="g in groups" :key="g.key" class="family-sheet__group">
      <h3 class="family-sheet__heading">{{ g.label }}</h3>
      <div class="family-sheet__chips">
        <button
          v-for="m in g.members"
          :key="m.id"
          type="button"
          class="family-sheet__chip"
          data-test="relative-chip"
          @click="emit('select', m.id)"
        >
          <img v-if="m.portraitThumb || m.portrait" class="family-sheet__chip-thumb" :src="(m.portraitThumb || m.portrait) as string" alt="" />
          <span class="family-sheet__chip-name">{{ name(m) }}</span>
          <span class="family-sheet__chip-years">{{ m.birthYear ?? '—' }}<template v-if="m.deathYear">–{{ m.deathYear }}</template></span>
        </button>
      </div>
    </div>
  </section>
</template>

<style scoped lang="scss">
// Layout leaves room for future add/remove affordances (cut 2) but renders none now.
.family-sheet { display: flex; flex-direction: column; gap: 14px; }
.family-sheet__heading { margin: 0 0 6px; font-family: var(--font-display); font-size: 15px; letter-spacing: 1px; color: var(--ink-soft); text-transform: uppercase; }
.family-sheet__chips { display: flex; flex-wrap: wrap; gap: 8px; }
.family-sheet__chip {
  display: flex; align-items: center; gap: 8px; padding: 8px 12px; min-height: 44px;
  background: var(--stat-card-bg); border: 1px solid var(--panel-edge); border-radius: 10px; cursor: pointer;
  &:hover { background: var(--control-hover); }
  &:focus-visible { outline: 2px solid var(--gilt); outline-offset: 2px; }
}
.family-sheet__chip-thumb { width: 32px; height: 32px; border-radius: 50%; object-fit: cover; }
.family-sheet__chip-name { font-family: var(--font-display); color: var(--ink); }
.family-sheet__chip-years { font-size: 13px; font-style: italic; color: var(--ink-soft); }
</style>
```

- [ ] **Step 4: Implement `MemberDetail.vue` + run tests**

`src/frontend/src/components/MemberDetail.vue` — read-only dossier. Fetches detail, shows fields, biography, residences (read-only), gallery via `PersonPhotos` (`:can-edit="false"`), and the family sheet. Selecting a relative re-navigates.

```vue
<script setup lang="ts">
import { ref, watch, computed } from 'vue';
import { storeToRefs } from 'pinia';
import { useI18n } from 'vue-i18n';
import { useRouter } from 'vue-router';
import { useFamilyStore } from '../stores/familyStore';
import { useLocaleStore } from '../stores/localeStore';
import { localize } from '../i18n/localize';
import { fetchPerson } from '../api/familyApi';
import { personSlug } from '../router/slug';
import type { PersonDetail } from '../types/family';
import PersonPhotos from './PersonPhotos.vue';
import MemberFamilySheet from './MemberFamilySheet.vue';

const props = defineProps<{ personId: string }>();
const { t } = useI18n({ useScope: 'global' });
const locale = useLocaleStore();
const store = useFamilyStore();
const { people, unions } = storeToRefs(store);
const router = useRouter();

const detail = ref<PersonDetail | null>(null);
const loading = ref(false);
const error = ref<string | null>(null);

async function load(id: string): Promise<void> {
  loading.value = true;
  error.value = null;
  try {
    detail.value = await fetchPerson(id);
  } catch {
    error.value = t('status.error');
  } finally {
    loading.value = false;
  }
}

watch(() => props.personId, id => { void load(id); }, { immediate: true });

const fullName = computed(() =>
  detail.value ? `${localize(detail.value.givenName, locale.currentLocale)} ${localize(detail.value.surname, locale.currentLocale)}`.trim() : ''
);
const lifespan = computed(() =>
  detail.value ? `${detail.value.birth.year ?? '—'} – ${detail.value.death?.year ?? ''}`.trim() : ''
);

function selectRelative(id: string): void {
  const person = store.personById(id);
  void router.push({ name: 'members', params: { slug: person ? personSlug(person) : id } });
}
function findOnTree(): void {
  const person = store.personById(props.personId);
  if (person) {
    void router.push({ name: 'person', params: { slug: personSlug(person) } });
  }
}
</script>

<template>
  <article class="member-detail" data-test="member-detail">
    <p v-if="loading" class="member-detail__status">{{ t('status.loading') }}</p>
    <p v-else-if="error" class="member-detail__status member-detail__status--error">{{ error }}</p>
    <template v-else-if="detail">
      <header class="member-detail__header">
        <img v-if="detail.portraitThumb || detail.portrait" class="member-detail__portrait" :src="(detail.portraitThumb || detail.portrait) as string" :alt="fullName" />
        <div>
          <h2 class="member-detail__name">{{ fullName }}</h2>
          <p class="member-detail__life">{{ lifespan }}</p>
          <button type="button" class="member-detail__find" data-test="find-on-tree" @click="findOnTree">
            {{ t('members.findOnTree') }} →
          </button>
        </div>
      </header>

      <dl class="member-detail__fields">
        <div><dt>{{ t('members.field.maidenName') }}</dt><dd>{{ detail.maidenName ? localize(detail.maidenName, locale.currentLocale) : '—' }}</dd></div>
        <div><dt>{{ t('members.field.sex') }}</dt><dd>{{ t('sex.' + detail.sex) }}</dd></div>
        <div><dt>{{ t('members.field.vocation') }}</dt><dd>{{ t('vocation.' + detail.vocation) }}</dd></div>
      </dl>

      <section v-if="detail.biography && (detail.biography.ru || detail.biography.be || detail.biography.en)" class="member-detail__bio">
        <h3>{{ t('members.biography') }}</h3>
        <p>{{ localize(detail.biography, locale.currentLocale) }}</p>
      </section>

      <section v-if="detail.residences.length > 0" class="member-detail__residences">
        <h3>{{ t('members.residences') }}</h3>
        <ul>
          <li v-for="(r, i) in detail.residences" :key="i">
            {{ localize(r.place, locale.currentLocale) }}
            <span v-if="r.fromYear || r.toYear">({{ r.fromYear ?? '' }}–{{ r.toYear ?? '' }})</span>
          </li>
        </ul>
      </section>

      <PersonPhotos :detail="detail" :can-edit="false" :name="fullName" />

      <MemberFamilySheet :person-id="props.personId" :people="people" :unions="unions" @select="selectRelative" />
    </template>
  </article>
</template>

<style scoped lang="scss">
.member-detail { display: flex; flex-direction: column; gap: 20px; padding: 4px 8px 40px; }
.member-detail__status { padding: 24px; font-style: italic; color: var(--ink-soft); &--error { color: #8a3b32; } }
.member-detail__header { display: flex; gap: 16px; align-items: center; }
.member-detail__portrait { width: 96px; height: 96px; border-radius: 50%; object-fit: cover; border: 1px solid var(--gilt); }
.member-detail__name { margin: 0; font-family: var(--font-display); color: var(--ink); }
.member-detail__life { margin: 2px 0 8px; font-style: italic; color: var(--ink-soft); }
.member-detail__find {
  padding: 6px 14px; font-family: var(--font-display); color: var(--on-accent);
  background: var(--bark); border: 1px solid var(--bark-dark); border-radius: 8px; cursor: pointer;
  &:hover { background: var(--bark-dark); }
  &:focus-visible { outline: 2px solid var(--gilt); outline-offset: 2px; }
}
.member-detail__fields { display: grid; grid-template-columns: repeat(auto-fit, minmax(140px, 1fr)); gap: 10px; margin: 0;
  dt { font-size: 12px; text-transform: uppercase; letter-spacing: 1px; color: var(--ink-soft); }
  dd { margin: 2px 0 0; font-family: var(--font-body); color: var(--ink); }
}
.member-detail__bio h3, .member-detail__residences h3 { font-family: var(--font-display); color: var(--ink); }
.member-detail__bio p { line-height: 1.6; color: var(--ink-soft); white-space: pre-wrap; }
</style>
```

Add the referenced i18n keys (`members.findOnTree`, `members.field.maidenName`, `members.field.sex`, `members.field.vocation`, `members.biography`, `members.residences`, `members.parents`, `members.spouse`, `members.siblings`, `members.children`, `members.familyLabel`, `members.pickHint`) in ru/be/en. `sex.*` and `vocation.*` keys already exist (used elsewhere) — reuse them; if a specific value's key is missing, add it.

Run: `npm --prefix src/frontend test -- MemberFamilySheet` (PASS) and `npm --prefix src/frontend run build` (type-check passes).

- [ ] **Step 5: Commit**

```bash
git add src/frontend/src/components/MemberDetail.vue src/frontend/src/components/MemberFamilySheet.vue src/frontend/src/components/MemberFamilySheet.spec.ts src/frontend/src/i18n
git commit -m "feat(members): read-only dossier + family sheet"
```

---

## Task 16: Full-suite green + live verification

**Files:** none (verification only).

- [ ] **Step 1: Run the whole backend suite**

Run: `dotnet test`
Expected: PASS (all existing + new tests).

- [ ] **Step 2: Run the whole frontend suite + build**

Run: `npm --prefix src/frontend test` then `npm --prefix src/frontend run build`
Expected: PASS + clean type-check build.

- [ ] **Step 3: Live smoke (both servers)**

Start the API + dev server (`node scripts/dev.mjs` or the documented pair). In the browser:
- `/members` lists everyone; typing filters live; a maiden-name query matches.
- Click a member → URL becomes `/members/<slug>`, dossier shows fields + biography + residences + gallery + family; clicking a relative navigates to them.
- Toggle Film ↔ Classic theme → the page re-skins.
- `Find on tree` jumps to the oak focused on the person.
Confirm no console errors (preview console).

- [ ] **Step 4: Commit any i18n/polish fixups surfaced by the smoke**

```bash
git add -A
git commit -m "chore(members): read-only cut 1a polish + i18n"
```

- [ ] **Step 5: Docs**

Before opening the PR, run the `update-docs-for-pr` skill to add the `/members` route and the `GET`/`PUT /api/people/{id}/profile` contract to `docs/reference/`, and update the CLAUDE.md/README overview to mention the Members page. Commit those onto the same branch.

---

## Self-Review

**1. Spec coverage (cut 1a scope):**
- Read-only `/members` roster + search → Tasks 11–14. ✓
- Per-person dossier (fields, biography, residences read-only, gallery) → Task 15. ✓
- Immediate-family cluster, clickable, layout-ready no inert slots → Tasks 12, 15. ✓
- Profile override, snapshot-layer merge, per-locale fallback → Tasks 1–3. ✓
- Both stores (in-memory + Firestore) → Tasks 2, 4. ✓
- `GET`/`PUT` profile endpoints, editor auth, curl proof → Task 10. ✓
- Cross-entity birth-order validation in the handler → Tasks 6, 9. ✓
- Maiden-name search (shared predicate) → Task 11. ✓
- Enable the reserved nav tab → Task 13. ✓
- `Find on tree` → Task 15. ✓
- Split-brain regression (edit birth year → graph moves) → Tasks 3 (unit) + 10 (integration). ✓
- **Deferred to later plans (not gaps):** the scalar-field editor UI + hybrid store sync + revert-to-seed UI (cut 1b); residence editing + map picker (cut 1c); add/remove + relationships (cut 2). The backend `PUT` + revert-to-seed semantics ship here (null field = inherit seed), dormant in UI until 1b.

**2. Placeholder scan:** No "TBD"/"add error handling"/"similar to Task N" — each code step carries real code. Two flagged "confirm the exact helper name" notes (slug helpers Task 14/15; `Vocation` enum member Task 5) are verification prompts against real existing code, not missing content.

**3. Type consistency:** `PersonProfileOverride` (nullable fields, null=inherit) is consistent Tasks 1→3→4→5→7→9. `PersonProfileDto(GivenName, Surname, MaidenName, Sex, BirthYear, DeathYear, Vocation)` is consistent Tasks 5→7→8→9→10. `deriveRelatives(personId, people, unions): Relatives` consistent Tasks 12→15. `GraphValidationResult(IsValid, Error)` + `ValidateBirthYear` consistent Tasks 6→9.

> **Cross-plan note:** Cut 1b (editor) will add `fetchPersonProfile`/`putPersonProfile` to `familyApi.ts`, a `MemberFieldsEditor.vue`, the hybrid `familyStore` sync (patch display-only fields; refetch the graph when birth year changed), and the per-field revert-to-seed UI. Cut 1c adds `ResidencesEditor.vue` + the map picker. Both build directly on this cut's backend.

## Execution Handoff

**Plan complete and saved to `docs/superpowers/plans/2026-07-06-members-page-cut-1a.md`. Two execution options:**

**1. Subagent-Driven (recommended)** - I dispatch a fresh subagent per task, review between tasks, fast iteration.

**2. Inline Execution** - Execute tasks in this session using executing-plans, batch execution with checkpoints.

**Which approach?**
