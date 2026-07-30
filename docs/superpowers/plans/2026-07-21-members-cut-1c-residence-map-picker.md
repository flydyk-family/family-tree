# Members Cut 1c — Residence Editing + Map Picker Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let signed-in editors add/edit/remove a person's residences from the Members dossier, with a Google-Maps city picker that stores durable coordinates + localized place names, while visitors get a read-only list with an outbound "open in Google Maps" link.

**Architecture:** Residences ride the existing per-person **profile override** (append-only, whole-record-latest-wins, merged in `FamilySnapshotProvider`) as a new nullable `Residences` list — `null` inherits the `family.json` seed list, non-null replaces it wholesale. The same `PUT /api/people/{id}/profile` endpoint carries them; no new endpoint or store method. The interactive map renders **only** in the editor picker (Google Maps JS + Geocoding, lazy-loaded, referrer-restricted key, keyless manual-entry fallback); the visitor view is a plain hyperlink to the Google Maps website (not an API call).

**Tech Stack:** .NET 10 (MediatR, FluentValidation, Mapster, Firestore SDK, xUnit + Moq + AwesomeAssertions) · Vue 3 + TS + Pinia + vue-i18n + Vitest · Google Maps JavaScript API + Geocoding (loaded via a hand-rolled memoized script injector — no new npm dependency).

## Global Constraints

- **No writes to `family.json`.** Edits persist only through the override layer.
- **Theme-aware.** New UI re-skins under Film (default) + Classic via SCSS tokens (`--gilt`, `--gilt-deep`, `--gilt-light`, `--ink`, `--ink-soft`, `--bark`, `--on-accent`, `--field-bg`, `--surface-card`, `--umber`, `--leaf-deep`, `--control-hover`, `--panel-edge`). **Never hardcode a gold/gilt hex** — it clashes in Film.
- **Localized.** Place names are `LocalizedText` (ru·be·en); all three locales handled; new UI strings added to `en.ts`, `ru.ts`, `be.ts`.
- **C# conventions:** file-scoped namespaces, `_camelCase` private fields, `Async` suffix, `CancellationToken` last, nullable enabled, `is null`/`is not null`, always-brace control statements, structured logging with named placeholders, **never log PII** (no editor email / names / place text tied to a person in logs).
- **Whole-record-latest-wins correctness:** because residences share the one override record, every save must submit `{ ...currentOverride, <edited fields> }`. A scalar save must not drop a residences override and vice-versa.
- **Map key is public-by-nature, build-time injected** (`VITE_GOOGLE_MAPS_API_KEY`), restricted by HTTP referrer. Absent key ⇒ picker degrades to manual lat/lng + place entry (dev/CI run keyless), mirroring how `VITE_GOOGLE_CLIENT_ID` absence makes sign-in a no-op.
- **Delivery:** one bundled PR (backend + frontend) into `main`; docs updated in the same PR; do not self-merge.

---

## File Structure

**Backend (modify):**
- `src/backend/FamilyTree.Domain/Residence.cs` — add `Lat`, `Lng`.
- `src/backend/FamilyTree.Application/Dtos/ResidenceDto.cs` — add `Lat`, `Lng`.
- `src/backend/FamilyTree.Domain/PersonProfileOverride.cs` — add `Residences`.
- `src/backend/FamilyTree.Application/Dtos/PersonProfileDto.cs` — add `Residences`.
- `src/backend/FamilyTree.Application/Mapping/MappingConfig.cs` — reverse `ResidenceDto → Residence` map.
- `src/backend/FamilyTree.Infrastructure/FamilySnapshotProvider.cs` — merge residences in `ApplyProfile`.
- `src/backend/FamilyTree.Infrastructure/FirestorePersonOverrideStore.cs` — serialize/deserialize residences.
- `src/backend/FamilyTree.Application/People/UpdatePersonProfileValidator.cs` — residence validation rules.

**Frontend (create):**
- `src/frontend/src/maps/mapLink.ts` — `buildMapUrl(lat, lng)` pure helper.
- `src/frontend/src/maps/googleMaps.ts` — memoized JS loader + `searchPlace` / `localizedNames` geocoding wrappers (thin external wrapper, not unit-tested).
- `src/frontend/src/composables/residenceDraft.ts` — editable residence-row model + payload helpers.
- `src/frontend/src/components/MapPicker.vue` — the interactive picker (+ keyless fallback).
- `src/frontend/src/components/ResidencesEditor.vue` — the residences list editor.

**Frontend (modify):**
- `src/frontend/src/types/family.ts` — `Residence` gains `lat`, `lng`.
- `src/frontend/src/api/profileApi.ts` — `PersonProfile` gains `residences`.
- `src/frontend/src/composables/profileDraft.ts` — `buildProfilePayload` passes through `base.residences`.
- `src/frontend/src/components/MemberDetail.vue` — residences edit toggle + read-only map link.
- `src/frontend/src/vite-env.d.ts` — declare `VITE_GOOGLE_MAPS_API_KEY`.
- `src/frontend/src/i18n/messages/{en,ru,be}.ts` — new strings.

**Docs (modify):** `docs/reference/features/person-details.md`, `docs/reference/features/backend-api.md`, `docs/reference/roadmap.md`.

---

## Task 1: Add lat/lng to the Residence model + DTO + reverse mapping

**Files:**
- Modify: `src/backend/FamilyTree.Domain/Residence.cs`
- Modify: `src/backend/FamilyTree.Application/Dtos/ResidenceDto.cs`
- Modify: `src/backend/FamilyTree.Application/Mapping/MappingConfig.cs:23`
- Test: `tests/unit/FamilyTree.UnitTests/Application/MappingConfigTests.cs`

**Interfaces:**
- Produces: `Residence { LocalizedText Place; int? FromYear; int? ToYear; double? Lat; double? Lng; string? MapUrl }`; `ResidenceDto(LocalizedTextDto Place, int? FromYear, int? ToYear, double? Lat, double? Lng, string? MapUrl)`; a registered `ResidenceDto → Residence` Mapster config.

- [ ] **Step 1: Write the failing test**

Add to `MappingConfigTests.cs` (a class that already builds a `TypeAdapterConfig` via `MappingConfig.Register` — follow the existing setup in that file):

```csharp
[Fact]
public void Map_WhenResidenceDtoHasCoords_ShouldRoundTripToResidence()
{
    var dto = new ResidenceDto(
        new LocalizedTextDto("Краков", "Кракаў", "Kraków"),
        1762, 1790, 50.0614, 19.9372, "https://www.google.com/maps/search/?api=1&query=50.0614,19.9372");

    var residence = dto.Adapt<Residence>();

    residence.Place.En.Should().Be("Kraków");
    residence.FromYear.Should().Be(1762);
    residence.Lat.Should().Be(50.0614);
    residence.Lng.Should().Be(19.9372);
    residence.MapUrl.Should().Be("https://www.google.com/maps/search/?api=1&query=50.0614,19.9372");
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `dotnet test --filter "FullyQualifiedName~Map_WhenResidenceDtoHasCoords"`
Expected: FAIL — `Residence` has no `Lat`/`Lng`, and `ResidenceDto` constructor arity is wrong (compile error).

- [ ] **Step 3: Write minimal implementation**

`Residence.cs`:

```csharp
namespace FamilyTree.Domain;

public sealed record Residence
{
    public required LocalizedText Place { get; init; }
    public int? FromYear { get; init; }
    public int? ToYear { get; init; }
    public double? Lat { get; init; }
    public double? Lng { get; init; }
    public string? MapUrl { get; init; }
}
```

`ResidenceDto.cs`:

```csharp
namespace FamilyTree.Application.Dtos;

public sealed record ResidenceDto(
    LocalizedTextDto Place, int? FromYear, int? ToYear, double? Lat, double? Lng, string? MapUrl);
```

`MappingConfig.cs` — add the reverse map right after the existing `config.NewConfig<Residence, ResidenceDto>();` (line 23). Mapster maps `Place` via the already-registered `LocalizedTextDto → LocalizedText` config, the rest by name:

```csharp
config.NewConfig<Residence, ResidenceDto>();
config.NewConfig<ResidenceDto, Residence>();
```

- [ ] **Step 4: Run test to verify it passes**

Run: `dotnet test --filter "FullyQualifiedName~Map_WhenResidenceDtoHasCoords"`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/backend/FamilyTree.Domain/Residence.cs src/backend/FamilyTree.Application/Dtos/ResidenceDto.cs src/backend/FamilyTree.Application/Mapping/MappingConfig.cs tests/unit/FamilyTree.UnitTests/Application/MappingConfigTests.cs
git commit -m "feat(residence): add lat/lng to Residence model, DTO, and reverse mapping"
```

---

## Task 2: Add Residences to the profile override + DTO

**Files:**
- Modify: `src/backend/FamilyTree.Domain/PersonProfileOverride.cs`
- Modify: `src/backend/FamilyTree.Application/Dtos/PersonProfileDto.cs`
- Test: `tests/unit/FamilyTree.UnitTests/Mapping/PersonProfileMappingTests.cs`

**Interfaces:**
- Consumes: `Residence`, `ResidenceDto` (Task 1).
- Produces: `PersonProfileOverride.Residences` (`IReadOnlyList<Residence>?`); `PersonProfileDto.Residences` (`IReadOnlyList<ResidenceDto>?`). `null` = inherit seed list; non-null = replace.

- [ ] **Step 1: Write the failing test**

Add to `PersonProfileMappingTests.cs` (mirror its existing dto→override style — it already builds the config via `MappingConfig.Register`):

```csharp
[Fact]
public void Map_WhenProfileDtoHasResidences_ShouldMapListToOverride()
{
    var dto = new PersonProfileDto(
        null, null, null, null, null, null, null, null, null, null, null, null,
        Residences: new[]
        {
            new ResidenceDto(new LocalizedTextDto("Краков", "Кракаў", "Kraków"), 1762, 1790, 50.0614, 19.9372, null)
        });

    var over = dto.Adapt<PersonProfileOverride>();

    over.Residences.Should().NotBeNull();
    over.Residences!.Single().Place.En.Should().Be("Kraków");
    over.Residences!.Single().Lat.Should().Be(50.0614);
}

[Fact]
public void Map_WhenProfileDtoResidencesNull_ShouldMapToNull()
{
    var dto = new PersonProfileDto(null, null, null, null, null, null, null, null, null, null, null, null, Residences: null);

    dto.Adapt<PersonProfileOverride>().Residences.Should().BeNull();
}
```

> Note: `PersonProfileDto` gains `Residences` as the **last** positional parameter, so every existing `new PersonProfileDto(...)` in tests that uses positional args still compiles (the new trailing param is optional via `null`). Use the named `Residences:` argument as shown.

- [ ] **Step 2: Run test to verify it fails**

Run: `dotnet test --filter "FullyQualifiedName~Map_WhenProfileDto"`
Expected: FAIL — compile error (`PersonProfileDto` has no `Residences`).

- [ ] **Step 3: Write minimal implementation**

`PersonProfileOverride.cs` — add after `Vocation`:

```csharp
    public Vocation? Vocation { get; init; }

    /// <summary>Whole-list override of the person's residences: <c>null</c> inherits the seed
    /// list, a non-null value replaces it wholesale. Kept disjoint from the scalar fields so a
    /// scalar-only edit that carries residences forward never fossilizes them.</summary>
    public IReadOnlyList<Residence>? Residences { get; init; }
```

`PersonProfileDto.cs` — add trailing param:

```csharp
public sealed record PersonProfileDto(
    LocalizedTextDto? GivenName,
    LocalizedTextDto? Surname,
    LocalizedTextDto? MaidenName,
    LocalizedTextDto? MiddleName,
    string? Sex,
    int? BirthYear,
    int? BirthMonth,
    int? BirthDay,
    int? DeathYear,
    int? DeathMonth,
    int? DeathDay,
    string? Vocation,
    IReadOnlyList<ResidenceDto>? Residences = null);
```

Mapster maps `Residences` by name using the `ResidenceDto ↔ Residence` configs from Task 1 — no extra `.Map(...)` needed.

- [ ] **Step 4: Run test to verify it passes**

Run: `dotnet test --filter "FullyQualifiedName~Map_WhenProfileDto"`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/backend/FamilyTree.Domain/PersonProfileOverride.cs src/backend/FamilyTree.Application/Dtos/PersonProfileDto.cs tests/unit/FamilyTree.UnitTests/Mapping/PersonProfileMappingTests.cs
git commit -m "feat(profile-override): add residences whole-list field to override and DTO"
```

---

## Task 3: Merge residences in FamilySnapshotProvider.ApplyProfile

**Files:**
- Modify: `src/backend/FamilyTree.Infrastructure/FamilySnapshotProvider.cs:202-212`
- Test: `tests/unit/FamilyTree.UnitTests/Infrastructure/FamilySnapshotProviderTests.cs`

**Interfaces:**
- Consumes: `PersonProfileOverride.Residences` (Task 2).
- Produces: merged `Person.Residences` = `profile.Residences ?? seed.Residences`.

- [ ] **Step 1: Write the failing tests**

Add to `FamilySnapshotProviderTests.cs`. The file's `Person(...)` helper doesn't set residences (defaults to `[]`); build a seed person with residences inline. Add a small helper at the top of the new tests:

```csharp
private static Residence Res(string en, int? from, int? to, double? lat = null, double? lng = null) =>
    new() { Place = new LocalizedText { Ru = en, Be = en, En = en }, FromYear = from, ToYear = to, Lat = lat, Lng = lng };

[Fact]
public async Task GetAsync_WhenProfileOverridesResidences_ShouldReplaceSeedList()
{
    var seed = new Person
    {
        Id = "p1",
        GivenName = new LocalizedText { En = "p1" },
        Surname = new LocalizedText { En = "p1" },
        Birth = new LifeEvent { Year = 1900 },
        Residences = new[] { Res("SeedTown", 1900, 1910) }
    };
    var (provider, _, overrides, _) = Build(new FamilyGraph([seed], []));
    await overrides.AppendProfileAsync("p1",
        new PersonProfileOverride { Residences = new[] { Res("NewCity", 1920, 1930, 50.0, 19.0) } },
        "e@x", default);

    var person = (await provider.GetAsync(default)).People.Single();

    person.Residences.Should().HaveCount(1);
    person.Residences[0].Place.En.Should().Be("NewCity");
    person.Residences[0].Lat.Should().Be(50.0);
}

[Fact]
public async Task GetAsync_WhenProfileHasNoResidences_ShouldInheritSeedResidences()
{
    var seed = new Person
    {
        Id = "p1",
        GivenName = new LocalizedText { En = "p1" },
        Surname = new LocalizedText { En = "p1" },
        Birth = new LifeEvent { Year = 1900 },
        Residences = new[] { Res("SeedTown", 1900, 1910) }
    };
    var (provider, _, overrides, _) = Build(new FamilyGraph([seed], []));
    // A scalar-only override (Residences == null) must not wipe the seed residences.
    await overrides.AppendProfileAsync("p1", new PersonProfileOverride { BirthYear = 1901 }, "e@x", default);

    var person = (await provider.GetAsync(default)).People.Single();

    person.Residences.Should().HaveCount(1);
    person.Residences[0].Place.En.Should().Be("SeedTown");
    person.Birth.Year.Should().Be(1901);
}
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `dotnet test --filter "FullyQualifiedName~Residences"`
Expected: FAIL — `ApplyProfile` doesn't touch `Residences`, so the override list is ignored (first test fails on count/place).

- [ ] **Step 3: Write minimal implementation**

In `FamilySnapshotProvider.cs`, add one line to the `ApplyProfile` object initializer (after `Death = ...`):

```csharp
    private static Person ApplyProfile(Person seed, PersonProfileOverride profile) => seed with
    {
        GivenName = MergeText(profile.GivenName, seed.GivenName),
        Surname = MergeText(profile.Surname, seed.Surname),
        MaidenName = profile.MaidenName is null ? seed.MaidenName : MergeText(profile.MaidenName, seed.MaidenName ?? new LocalizedText()),
        MiddleName = profile.MiddleName is null ? seed.MiddleName : MergeText(profile.MiddleName, seed.MiddleName ?? new LocalizedText()),
        Sex = profile.Sex ?? seed.Sex,
        Vocation = profile.Vocation ?? seed.Vocation,
        Birth = MergeEvent(seed.Birth, profile.BirthYear, profile.BirthMonth, profile.BirthDay),
        Death = MergeDeathEvent(seed.Death, profile.DeathYear, profile.DeathMonth, profile.DeathDay),
        // Whole-list replace: a null override list inherits the seed residences.
        Residences = profile.Residences ?? seed.Residences
    };
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `dotnet test --filter "FullyQualifiedName~Residences"`
Expected: PASS (both)

- [ ] **Step 5: Commit**

```bash
git add src/backend/FamilyTree.Infrastructure/FamilySnapshotProvider.cs tests/unit/FamilyTree.UnitTests/Infrastructure/FamilySnapshotProviderTests.cs
git commit -m "feat(snapshot): merge whole-list residence override, null inherits seed"
```

---

## Task 4: Firestore serialization of residences

**Files:**
- Modify: `src/backend/FamilyTree.Infrastructure/FirestorePersonOverrideStore.cs:204-301`

**Interfaces:**
- Consumes: `PersonProfileOverride.Residences`, `Residence` fields.
- Produces: residences persisted under a `residences` array-of-maps field; `ProfileFrom` reconstructs them and treats a residences-only document as a real override.

> This class is `[ExcludeFromCodeCoverage]` (thin SDK wrapper, emulator-verified only — same rationale as the biography/media serialization already in it). No unit test; verification is a clean build + the existing InMemory-store tests (which already exercise the full record generically). Fold this into the PR; a reviewer gates it on the diff.

- [ ] **Step 1: Serialize residences in `AppendProfileAsync`**

In the `snapshot` dictionary in `AppendProfileAsync`, add a `residences` entry before `editorEmail`. A null override list is written as an explicit null; a present list becomes a list of maps (Firestore stores nested maps/lists natively):

```csharp
            ["vocation"] = profile.Vocation?.ToString(),
            ["residences"] = profile.Residences?.Select(ResidenceMap).ToList(),
            ["editorEmail"] = editorEmail,
            ["editedAt"] = FieldValue.ServerTimestamp
```

Add these static helpers next to `PhotoMap`:

```csharp
    private static Dictionary<string, object?> ResidenceMap(Residence r) => new()
    {
        ["placeRu"] = r.Place.Ru,
        ["placeBe"] = r.Place.Be,
        ["placeEn"] = r.Place.En,
        ["fromYear"] = r.FromYear.HasValue ? (long?)r.FromYear.Value : null,
        ["toYear"] = r.ToYear.HasValue ? (long?)r.ToYear.Value : null,
        ["lat"] = r.Lat,
        ["lng"] = r.Lng,
        ["mapUrl"] = r.MapUrl
    };

    private static Residence ReadResidence(Dictionary<string, object> m)
    {
        string? Str(string k) => m.TryGetValue(k, out var v) && v is string s && s.Length > 0 ? s : null;
        int? Int(string k) => m.TryGetValue(k, out var v) && v is long l ? (int?)l : null;
        double? Dbl(string k) => m.TryGetValue(k, out var v) && v is double d ? d : null;
        return new Residence
        {
            Place = new LocalizedText { Ru = Str("placeRu"), Be = Str("placeBe"), En = Str("placeEn") },
            FromYear = Int("fromYear"),
            ToYear = Int("toYear"),
            Lat = Dbl("lat"),
            Lng = Dbl("lng"),
            MapUrl = Str("mapUrl")
        };
    }
```

- [ ] **Step 2: Deserialize residences in `ProfileFrom`**

In `ProfileFrom`, read the residences list and include it in both the empty-check and the returned record:

```csharp
        var death = IntField(doc, "deathYear");
        var deathMonth = IntField(doc, "deathMonth");
        var deathDay = IntField(doc, "deathDay");

        List<Residence>? residences = null;
        if (doc.TryGetValue<List<object>>("residences", out var resArr) && resArr is not null)
        {
            residences = resArr.OfType<Dictionary<string, object>>().Select(ReadResidence).ToList();
        }

        if (given is null && surname is null && maiden is null && middle is null && sex is null && vocation is null
            && birth is null && birthMonth is null && birthDay is null
            && death is null && deathMonth is null && deathDay is null
            && residences is null)
        {
            return null;
        }

        return new PersonProfileOverride
        {
            GivenName = given, Surname = surname, MaidenName = maiden, MiddleName = middle,
            Sex = sex, Vocation = vocation,
            BirthYear = birth, BirthMonth = birthMonth, BirthDay = birthDay,
            DeathYear = death, DeathMonth = deathMonth, DeathDay = deathDay,
            Residences = residences
        };
```

- [ ] **Step 3: Verify the build is clean**

Run: `dotnet build`
Expected: Build succeeded, 0 errors.

- [ ] **Step 4: Commit**

```bash
git add src/backend/FamilyTree.Infrastructure/FirestorePersonOverrideStore.cs
git commit -m "feat(firestore): persist residences on the profile override document"
```

---

## Task 5: Validate residences in UpdatePersonProfileValidator

**Files:**
- Modify: `src/backend/FamilyTree.Application/People/UpdatePersonProfileValidator.cs`
- Test: `tests/unit/FamilyTree.UnitTests/Application/UpdatePersonProfileValidatorTests.cs`

**Interfaces:**
- Consumes: `PersonProfileDto.Residences`, `ResidenceDto`.
- Produces: 400-level validation on: >10 rows, a row with no place locale, `fromYear`/`toYear` out of `[1000, 2100]` or `from > to`, `lat` outside `[-90, 90]`, `lng` outside `[-180, 180]`, `mapUrl` not an absolute http(s) URL or longer than 500 chars.

- [ ] **Step 1: Write the failing tests**

Add to `UpdatePersonProfileValidatorTests.cs` (mirror its existing arrange: it builds `UpdatePersonProfileCommand` with a `PersonProfileDto` and asserts on `validator.Validate(...)`). Helper for a valid base + a residence:

```csharp
private static ResidenceDto Res(string en = "Kraków", int? from = 1900, int? to = 1910,
    double? lat = 50.0, double? lng = 19.0, string? mapUrl = null) =>
    new(new LocalizedTextDto(null, null, en), from, to, lat, lng, mapUrl);

private static UpdatePersonProfileCommand CommandWith(params ResidenceDto[] residences) =>
    new("p-1", new PersonProfileDto(null, null, null, null, null, null, null, null, null, null, null, null, residences), "e@x");

[Fact]
public void Validate_WhenResidenceHasNoPlaceLocale_ShouldFail()
{
    var result = new UpdatePersonProfileValidator().Validate(
        CommandWith(new ResidenceDto(new LocalizedTextDto(null, null, null), 1900, 1910, null, null, null)));
    result.IsValid.Should().BeFalse();
}

[Fact]
public void Validate_WhenResidenceFromAfterTo_ShouldFail()
{
    new UpdatePersonProfileValidator().Validate(CommandWith(Res(from: 1950, to: 1900)))
        .IsValid.Should().BeFalse();
}

[Fact]
public void Validate_WhenLatOutOfRange_ShouldFail()
{
    new UpdatePersonProfileValidator().Validate(CommandWith(Res(lat: 999)))
        .IsValid.Should().BeFalse();
}

[Fact]
public void Validate_WhenMapUrlNotHttp_ShouldFail()
{
    new UpdatePersonProfileValidator().Validate(CommandWith(Res(mapUrl: "javascript:alert(1)")))
        .IsValid.Should().BeFalse();
}

[Fact]
public void Validate_WhenMoreThanTenResidences_ShouldFail()
{
    var many = Enumerable.Range(0, 11).Select(_ => Res()).ToArray();
    new UpdatePersonProfileValidator().Validate(CommandWith(many)).IsValid.Should().BeFalse();
}

[Fact]
public void Validate_WhenResidenceValid_ShouldPass()
{
    new UpdatePersonProfileValidator().Validate(
        CommandWith(Res(mapUrl: "https://www.google.com/maps/search/?api=1&query=50,19")))
        .IsValid.Should().BeTrue();
}
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `dotnet test --filter "FullyQualifiedName~UpdatePersonProfileValidatorTests"`
Expected: FAIL — the new residence tests fail (validator has no residence rules; invalid rows pass).

- [ ] **Step 3: Write minimal implementation**

In `UpdatePersonProfileValidator.cs`, inside the `When(c => c.Profile is not null, ...)` block, add a residence collection rule + a child rule set. Add `using FamilyTree.Domain;` is not needed (works on DTOs). Add:

```csharp
            RuleFor(c => c.Profile.Residences)
                .Must(r => r == null || r.Count <= 10)
                .WithMessage("A person can have at most 10 residences.");
            RuleForEach(c => c.Profile.Residences).SetValidator(new ResidenceDtoValidator());
```

Add the child validator as a nested/sibling class in the same file:

```csharp
public sealed class ResidenceDtoValidator : AbstractValidator<ResidenceDto>
{
    private const int MinYear = 1000;
    private const int MaxYear = 2100;

    public ResidenceDtoValidator()
    {
        RuleFor(r => r.Place)
            .Must(HaveLocale).WithMessage("A residence must have a place name in at least one locale.");
        RuleFor(r => r.FromYear).InclusiveBetween(MinYear, MaxYear).When(r => r.FromYear.HasValue);
        RuleFor(r => r.ToYear).InclusiveBetween(MinYear, MaxYear).When(r => r.ToYear.HasValue);
        RuleFor(r => r)
            .Must(r => !(r.FromYear.HasValue && r.ToYear.HasValue) || r.FromYear!.Value <= r.ToYear!.Value)
            .WithMessage("Residence 'from' year must not be after its 'to' year.");
        RuleFor(r => r.Lat).InclusiveBetween(-90, 90).When(r => r.Lat.HasValue);
        RuleFor(r => r.Lng).InclusiveBetween(-180, 180).When(r => r.Lng.HasValue);
        RuleFor(r => r.MapUrl).Must(BeHttpUrl).When(r => !string.IsNullOrEmpty(r.MapUrl))
            .WithMessage("Map URL must be a valid http(s) URL under 500 characters.");
    }

    private static bool HaveLocale(LocalizedTextDto? p) =>
        p is not null && (!string.IsNullOrWhiteSpace(p.Ru) || !string.IsNullOrWhiteSpace(p.Be) || !string.IsNullOrWhiteSpace(p.En));

    private static bool BeHttpUrl(string? url) =>
        url!.Length <= 500
        && Uri.TryCreate(url, UriKind.Absolute, out var u)
        && (u.Scheme == Uri.UriSchemeHttp || u.Scheme == Uri.UriSchemeHttps);
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `dotnet test --filter "FullyQualifiedName~UpdatePersonProfileValidatorTests"`
Expected: PASS (all)

- [ ] **Step 5: Run the whole backend suite + commit**

Run: `dotnet test`
Expected: PASS (no regressions)

```bash
git add src/backend/FamilyTree.Application/People/UpdatePersonProfileValidator.cs tests/unit/FamilyTree.UnitTests/Application/UpdatePersonProfileValidatorTests.cs
git commit -m "feat(validation): per-row residence validation on profile update"
```

---

## Task 6: Frontend types + payload passthrough (the clobber guard)

**Files:**
- Modify: `src/frontend/src/types/family.ts:50-55`
- Modify: `src/frontend/src/api/profileApi.ts:5-18`
- Modify: `src/frontend/src/composables/profileDraft.ts:92-129`
- Test: `src/frontend/src/composables/profileDraft.spec.ts`

**Interfaces:**
- Produces: `Residence` gains `lat: number | null; lng: number | null`. `PersonProfile` gains `residences: Residence[] | null`. `buildProfilePayload(...)` result includes `residences: base.residences` (unchanged passthrough), so a scalar save never drops a residences override.

- [ ] **Step 1: Write the failing test**

Add to `profileDraft.spec.ts`. Its `emptyBase` const must gain `residences: null` (update it), and add:

```ts
it('preserves the base residences override untouched by a scalar edit', () => {
  const base: PersonProfile = {
    ...emptyBase,
    residences: [{ place: { ru: 'Краков', be: 'Кракаў', en: 'Kraków' }, fromYear: 1900, toYear: 1910, lat: 50, lng: 19, mapUrl: null }]
  };
  const original = seedDraft(detail());
  const draft = seedDraft(detail());
  draft.birthYear = 1902;

  const payload = buildProfilePayload(base, draft, original, new Set());

  expect(payload.birthYear).toBe(1902);
  expect(payload.residences).toEqual(base.residences);
});
```

Also update the existing `emptyBase` literal to include `residences: null`.

- [ ] **Step 2: Run test to verify it fails**

Run (from repo root): `npm --prefix src/frontend exec -- vitest run src/composables/profileDraft.spec.ts`
Expected: FAIL — `payload.residences` is `undefined` (type error + assertion fail).

- [ ] **Step 3: Write minimal implementation**

`types/family.ts` — `Residence`:

```ts
export interface Residence {
  place: LocalizedText;
  fromYear: number | null;
  toYear: number | null;
  lat: number | null;
  lng: number | null;
  mapUrl: string | null;
}
```

`api/profileApi.ts` — add to the `PersonProfile` interface (after `vocation`):

```ts
  vocation: string | null;
  residences: Residence[] | null;
```

and ensure `Residence` is imported: the file already imports from `../types/family` (`LocalizedText, PersonDetail`) — add `Residence`:

```ts
import type { LocalizedText, PersonDetail, Residence } from '../types/family';
```

`composables/profileDraft.ts` — the `buildProfilePayload` return object gains a passthrough (append after `vocation:`):

```ts
    vocation: scalar('vocation', draft.vocation, original.vocation, base.vocation),
    // Residences are edited by ResidencesEditor, not this scalar form. Carry the current
    // override's list through unchanged so a scalar save never wipes a residence override.
    residences: base.residences
  };
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm --prefix src/frontend exec -- vitest run src/composables/profileDraft.spec.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/frontend/src/types/family.ts src/frontend/src/api/profileApi.ts src/frontend/src/composables/profileDraft.ts src/frontend/src/composables/profileDraft.spec.ts
git commit -m "feat(frontend): residence coords in types; scalar payload carries residences through"
```

---

## Task 7: mapLink helper

**Files:**
- Create: `src/frontend/src/maps/mapLink.ts`
- Test: `src/frontend/src/maps/mapLink.spec.ts`

**Interfaces:**
- Produces: `buildMapUrl(lat: number | null, lng: number | null): string | null` — returns the keyless Google Maps URL for coords, or `null` when either is missing.

- [ ] **Step 1: Write the failing test**

`mapLink.spec.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { buildMapUrl } from './mapLink';

describe('buildMapUrl', () => {
  it('builds a Google Maps search URL from coordinates', () => {
    expect(buildMapUrl(50.0614, 19.9372)).toBe('https://www.google.com/maps/search/?api=1&query=50.0614%2C19.9372');
  });
  it('returns null when a coordinate is missing', () => {
    expect(buildMapUrl(null, 19.9372)).toBeNull();
    expect(buildMapUrl(50.0614, null)).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm --prefix src/frontend exec -- vitest run src/maps/mapLink.spec.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write minimal implementation**

`mapLink.ts`:

```ts
/** The keyless, cross-platform Google Maps URL for a coordinate pair (opens the Maps
 *  website / native app; not an API call). Null when either coordinate is missing. */
export function buildMapUrl(lat: number | null, lng: number | null): string | null {
  if (lat == null || lng == null) {
    return null;
  }
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${lat},${lng}`)}`;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm --prefix src/frontend exec -- vitest run src/maps/mapLink.spec.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/frontend/src/maps/mapLink.ts src/frontend/src/maps/mapLink.spec.ts
git commit -m "feat(maps): buildMapUrl keyless Google Maps link helper"
```

---

## Task 8: Google Maps loader + geocoding wrapper + env typing

**Files:**
- Create: `src/frontend/src/maps/googleMaps.ts`
- Modify: `src/frontend/src/vite-env.d.ts`

**Interfaces:**
- Produces:
  - `mapsApiKey(): string` — `import.meta.env.VITE_GOOGLE_MAPS_API_KEY ?? ''`.
  - `isMapsConfigured(): boolean` — key present.
  - `loadGoogleMaps(): Promise<typeof google.maps>` — memoized script injector; rejects if no key.
  - `searchPlace(query: string): Promise<PlaceResult[]>` where `PlaceResult = { lat: number; lng: number; description: string; placeId: string }`.
  - `localizedNames(placeId: string): Promise<{ ru: string; be: string; en: string }>`.

> Thin wrapper around external Google services + `<script>` injection. **Not unit-tested** (mocked wherever consumed). Verification = it compiles and `MapPicker` tests pass with it mocked.

- [ ] **Step 1: Declare the env var**

`vite-env.d.ts` — add to `ImportMetaEnv`:

```ts
interface ImportMetaEnv {
  /** Google OAuth client ID for GIS sign-in. Public by nature; build-time via Pages env. */
  readonly VITE_GOOGLE_CLIENT_ID?: string;
  /** Google Maps browser API key (Maps JS + Geocoding). Public by nature, referrer-restricted;
   *  absent ⇒ the residence picker falls back to manual lat/lng entry. */
  readonly VITE_GOOGLE_MAPS_API_KEY?: string;
}
```

- [ ] **Step 2: Write the loader + geocoding module**

`googleMaps.ts`:

```ts
/** Google Maps JS loader + geocoding wrappers. The map imagery uses the JS library; place
 *  search and localized names use the Geocoding REST endpoint so we can request ru/be/en
 *  names per call. Key is public-by-nature and referrer-restricted; absent ⇒ not configured. */

export interface PlaceResult {
  lat: number;
  lng: number;
  description: string;
  placeId: string;
}

export interface LatLngLiteral { lat: number; lng: number }

/** Minimal structural types for the bits of the Maps SDK we use — avoids an ambient
 *  `google` global and keeps the rest of the app fully typed. */
export interface GoogleMarkerHandle {
  setPosition(pos: LatLngLiteral): void;
  getPosition(): { lat(): number; lng(): number };
  addListener(event: string, handler: () => void): void;
}
export interface GoogleMapHandle {
  setCenter(pos: LatLngLiteral): void;
  setZoom(zoom: number): void;
}
export interface MapsNamespace {
  Map: new (el: HTMLElement, opts: Record<string, unknown>) => GoogleMapHandle;
  Marker: new (opts: Record<string, unknown>) => GoogleMarkerHandle;
}

export function mapsApiKey(): string {
  return import.meta.env.VITE_GOOGLE_MAPS_API_KEY ?? '';
}

export function isMapsConfigured(): boolean {
  return mapsApiKey().length > 0;
}

let mapsPromise: Promise<MapsNamespace> | null = null;

function mapsGlobal(): MapsNamespace | undefined {
  return (window as unknown as { google?: { maps?: MapsNamespace } }).google?.maps;
}

/** Injects the Maps JS script once and resolves the `google.maps` namespace. */
export function loadGoogleMaps(): Promise<MapsNamespace> {
  if (!isMapsConfigured()) {
    return Promise.reject(new Error('Google Maps API key not configured'));
  }
  if (mapsPromise) {
    return mapsPromise;
  }
  mapsPromise = new Promise((resolve, reject) => {
    const existing = mapsGlobal();
    if (existing) {
      resolve(existing);
      return;
    }
    const script = document.createElement('script');
    script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(mapsApiKey())}`;
    script.async = true;
    script.onload = () => {
      const ns = mapsGlobal();
      if (ns) {
        resolve(ns);
      } else {
        mapsPromise = null;
        reject(new Error('Google Maps loaded but namespace missing'));
      }
    };
    script.onerror = () => { mapsPromise = null; reject(new Error('Failed to load Google Maps')); };
    document.head.appendChild(script);
  });
  return mapsPromise;
}

interface GeocodeResponse {
  status: string;
  results: Array<{
    place_id: string;
    formatted_address: string;
    geometry: { location: { lat: number; lng: number } };
    address_components: Array<{ long_name: string; types: string[] }>;
  }>;
}

async function geocode(params: Record<string, string>): Promise<GeocodeResponse> {
  const qs = new URLSearchParams({ ...params, key: mapsApiKey() }).toString();
  const res = await fetch(`https://maps.googleapis.com/maps/api/geocode/json?${qs}`);
  if (!res.ok) {
    throw new Error(`Geocoding failed: ${res.status}`);
  }
  return (await res.json()) as GeocodeResponse;
}

/** Free-text city search → up to 5 candidates. */
export async function searchPlace(query: string): Promise<PlaceResult[]> {
  const data = await geocode({ address: query, language: 'en' });
  if (data.status !== 'OK') {
    return [];
  }
  return data.results.slice(0, 5).map(r => ({
    lat: r.geometry.location.lat,
    lng: r.geometry.location.lng,
    description: r.formatted_address,
    placeId: r.place_id
  }));
}

/** The locality/administrative name of a place in each app locale. Falls back to the
 *  formatted address when no locality component is present. */
export async function localizedNames(placeId: string): Promise<{ ru: string; be: string; en: string }> {
  async function nameIn(language: string): Promise<string> {
    const data = await geocode({ place_id: placeId, language });
    const top = data.results[0];
    if (!top) {
      return '';
    }
    const locality = top.address_components.find(c => c.types.includes('locality'))
      ?? top.address_components.find(c => c.types.includes('administrative_area_level_2'));
    return locality?.long_name ?? top.formatted_address;
  }
  const [ru, be, en] = await Promise.all([nameIn('ru'), nameIn('be'), nameIn('en')]);
  return { ru, be, en };
}
```

> No `@types/google.maps` dependency and no ambient `google` global: the structural
> `MapsNamespace` / `GoogleMapHandle` / `GoogleMarkerHandle` interfaces above cover
> everything we call, and the single `window.google` cast is contained in `mapsGlobal()`.
> Do **not** add `eslint-disable` comments anywhere — this repo has no eslint configured.

- [ ] **Step 3: Verify the frontend type-checks**

Run: `npm --prefix src/frontend run build`
Expected: build succeeds (vue-tsc clean).

- [ ] **Step 4: Commit**

```bash
git add src/frontend/src/maps/googleMaps.ts src/frontend/src/vite-env.d.ts
git commit -m "feat(maps): Google Maps JS loader + geocoding wrappers + env typing"
```

---

## Task 9: MapPicker.vue (interactive picker + keyless fallback)

**Files:**
- Create: `src/frontend/src/components/MapPicker.vue`
- Test: `src/frontend/src/components/MapPicker.spec.ts`

**Interfaces:**
- Consumes: `buildMapUrl` (Task 7); `isMapsConfigured`, `loadGoogleMaps`, `searchPlace`, `localizedNames` (Task 8).
- Produces: component with `v-model` of `PickedPlace = { lat: number | null; lng: number | null; place: { ru: string; be: string; en: string }; mapUrl: string | null }`. On a pick (map, search select, or manual coord entry) it emits `update:modelValue` with coords set, `mapUrl` from `buildMapUrl`, and — when Maps is configured — the three localized names filled.

- [ ] **Step 1: Write the failing test (keyless fallback path)**

`MapPicker.spec.ts` — mock the maps module so the test runs keyless and deterministic:

```ts
import { describe, it, expect, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import { createI18n } from 'vue-i18n';
import MapPicker from './MapPicker.vue';

vi.mock('../maps/googleMaps', () => ({
  isMapsConfigured: () => false,
  loadGoogleMaps: vi.fn(),
  searchPlace: vi.fn(),
  localizedNames: vi.fn()
}));

const i18n = createI18n({ legacy: false, locale: 'en', messages: { en: {} }, missingWarn: false, fallbackWarn: false });

function mountPicker() {
  return mount(MapPicker, {
    props: { modelValue: { lat: null, lng: null, place: { ru: '', be: '', en: '' }, mapUrl: null } },
    global: { plugins: [i18n] }
  });
}

describe('MapPicker (keyless fallback)', () => {
  it('shows manual coordinate inputs when Maps is not configured', () => {
    const w = mountPicker();
    expect(w.find('[data-test="map-manual"]').exists()).toBe(true);
    expect(w.find('[data-test="map-canvas"]').exists()).toBe(false);
  });

  it('emits coords + mapUrl when latitude and longitude are typed', async () => {
    const w = mountPicker();
    await w.find('[data-test="manual-lat"]').setValue('50.0614');
    await w.find('[data-test="manual-lng"]').setValue('19.9372');
    const events = w.emitted('update:modelValue');
    expect(events).toBeTruthy();
    const last = events![events!.length - 1][0] as { lat: number; lng: number; mapUrl: string };
    expect(last.lat).toBe(50.0614);
    expect(last.lng).toBe(19.9372);
    expect(last.mapUrl).toContain('query=50.0614%2C19.9372');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm --prefix src/frontend exec -- vitest run src/components/MapPicker.spec.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the component**

`MapPicker.vue`:

```vue
<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount } from 'vue';
import { useI18n } from 'vue-i18n';
import { buildMapUrl } from '../maps/mapLink';
import {
  isMapsConfigured, loadGoogleMaps, searchPlace, localizedNames,
  type PlaceResult, type GoogleMapHandle, type GoogleMarkerHandle
} from '../maps/googleMaps';

export interface PickedPlace {
  lat: number | null;
  lng: number | null;
  place: { ru: string; be: string; en: string };
  mapUrl: string | null;
}

const props = defineProps<{ modelValue: PickedPlace }>();
const emit = defineEmits<{ 'update:modelValue': [value: PickedPlace] }>();
const { t } = useI18n({ useScope: 'global' });

const configured = isMapsConfigured();
const canvas = ref<HTMLDivElement | null>(null);
const query = ref('');
const results = ref<PlaceResult[]>([]);
const searching = ref(false);
const loadError = ref(false);

// The Google Maps types are not installed; the map/marker handles stay local and
// untyped. (No eslint in this repo — do not add eslint-disable comments.)
let map: GoogleMapHandle | null = null;
let marker: GoogleMarkerHandle | null = null;

function emitCoords(lat: number | null, lng: number | null, names?: { ru: string; be: string; en: string }): void {
  emit('update:modelValue', {
    lat,
    lng,
    place: names ?? props.modelValue.place,
    mapUrl: buildMapUrl(lat, lng)
  });
}

async function fillNames(placeId: string, lat: number, lng: number): Promise<void> {
  try {
    const names = await localizedNames(placeId);
    emitCoords(lat, lng, names);
  } catch {
    emitCoords(lat, lng);
  }
}

let debounce: ReturnType<typeof setTimeout> | null = null;
function onQueryInput(): void {
  if (debounce) {
    clearTimeout(debounce);
  }
  debounce = setTimeout(async () => {
    if (query.value.trim().length < 2) {
      results.value = [];
      return;
    }
    searching.value = true;
    try {
      results.value = await searchPlace(query.value.trim());
    } catch {
      results.value = [];
    } finally {
      searching.value = false;
    }
  }, 350);
}

function chooseResult(r: PlaceResult): void {
  results.value = [];
  query.value = r.description;
  if (map && marker) {
    const pos = { lat: r.lat, lng: r.lng };
    map.setCenter(pos);
    map.setZoom(11);
    marker.setPosition(pos);
  }
  void fillNames(r.placeId, r.lat, r.lng);
}

onMounted(async () => {
  if (!configured || !canvas.value) {
    return;
  }
  try {
    const maps = await loadGoogleMaps();
    const start = props.modelValue.lat != null && props.modelValue.lng != null
      ? { lat: props.modelValue.lat, lng: props.modelValue.lng }
      : { lat: 53.9, lng: 27.56 }; // Minsk — a sensible regional default
    map = new maps.Map(canvas.value, { center: start, zoom: props.modelValue.lat != null ? 11 : 5, streetViewControl: false, mapTypeControl: false });
    marker = new maps.Marker({ position: start, map, draggable: true });
    marker.addListener('dragend', () => {
      const p = marker.getPosition();
      emitCoords(p.lat(), p.lng());
    });
  } catch {
    loadError.value = true;
  }
});

onBeforeUnmount(() => {
  if (debounce) {
    clearTimeout(debounce);
  }
  map = null;
  marker = null;
});

// Manual entry (keyless / load failure)
function onManualLat(e: Event): void {
  const v = parseFloat((e.target as HTMLInputElement).value);
  emitCoords(Number.isFinite(v) ? v : null, props.modelValue.lng);
}
function onManualLng(e: Event): void {
  const v = parseFloat((e.target as HTMLInputElement).value);
  emitCoords(props.modelValue.lat, Number.isFinite(v) ? v : null);
}
</script>

<template>
  <div class="map-picker" data-test="map-picker">
    <template v-if="configured && !loadError">
      <div class="map-picker__search">
        <input
          v-model="query"
          type="text"
          class="map-picker__input"
          data-test="map-search"
          :placeholder="t('members.searchCity')"
          @input="onQueryInput"
        />
        <ul v-if="results.length" class="map-picker__results" data-test="map-results">
          <li v-for="r in results" :key="r.placeId">
            <button type="button" class="map-picker__result" @click="chooseResult(r)">{{ r.description }}</button>
          </li>
        </ul>
      </div>
      <div ref="canvas" class="map-picker__canvas" data-test="map-canvas"></div>
      <p class="map-picker__hint">{{ t('members.mapHint') }}</p>
    </template>

    <div v-else class="map-picker__manual" data-test="map-manual">
      <p class="map-picker__hint">{{ t('members.mapManualHint') }}</p>
      <div class="map-picker__manual-row">
        <label class="map-picker__manual-field">
          <span>{{ t('members.lat') }}</span>
          <input type="number" step="any" class="map-picker__input" data-test="manual-lat" :value="modelValue.lat ?? ''" @input="onManualLat" />
        </label>
        <label class="map-picker__manual-field">
          <span>{{ t('members.lng') }}</span>
          <input type="number" step="any" class="map-picker__input" data-test="manual-lng" :value="modelValue.lng ?? ''" @input="onManualLng" />
        </label>
      </div>
    </div>
  </div>
</template>

<style scoped lang="scss">
.map-picker { display: flex; flex-direction: column; gap: 8px; }
.map-picker__search { position: relative; }
.map-picker__input {
  width: 100%; box-sizing: border-box; padding: 8px 10px;
  background: var(--field-bg); border: 1px solid var(--gilt); border-radius: 8px; color: var(--ink);
  font-family: var(--font-body); font-size: 15px;
  &:focus-visible { outline: 2px solid var(--gilt); outline-offset: 1px; }
}
.map-picker__results {
  position: absolute; z-index: 5; left: 0; right: 0; margin: 2px 0 0; padding: 0; list-style: none;
  background: var(--surface-card); border: 1px solid var(--gilt); border-radius: 8px; overflow: hidden;
}
.map-picker__result {
  display: block; width: 100%; text-align: left; padding: 8px 10px; cursor: pointer;
  background: transparent; border: none; color: var(--ink); font-family: var(--font-body); font-size: 14px;
  &:hover { background: var(--control-hover); }
}
.map-picker__canvas { width: 100%; height: 200px; border-radius: 8px; border: 1px solid var(--gilt); }
.map-picker__hint { margin: 0; font-size: 12px; color: var(--ink-soft); }
.map-picker__manual-row { display: flex; gap: 12px; }
.map-picker__manual-field { display: flex; flex-direction: column; gap: 4px; font-size: 11px; text-transform: uppercase; letter-spacing: 1px; color: var(--gilt-deep); }
</style>
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm --prefix src/frontend exec -- vitest run src/components/MapPicker.spec.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/frontend/src/components/MapPicker.vue src/frontend/src/components/MapPicker.spec.ts
git commit -m "feat(map-picker): interactive Google Maps city picker with keyless fallback"
```

---

## Task 10: residenceDraft composable + ResidencesEditor.vue

**Files:**
- Create: `src/frontend/src/composables/residenceDraft.ts`
- Create: `src/frontend/src/components/ResidencesEditor.vue`
- Test: `src/frontend/src/composables/residenceDraft.spec.ts`
- Test: `src/frontend/src/components/ResidencesEditor.spec.ts`

**Interfaces:**
- Consumes: `PersonProfile`, `getProfile`, `putProfile`, `ProfileSaveError` (`api/profileApi`); `Residence`, `PersonDetail` (`types/family`); `PickedPlace` + `MapPicker`; `buildMapUrl`.
- Produces:
  - `residenceDraft.ts`: `ResidenceRow = { place: { ru: string; be: string; en: string }; fromYear: number | null; toYear: number | null; lat: number | null; lng: number | null; mapUrl: string | null }`; `seedRows(residences: Residence[]): ResidenceRow[]`; `toResidences(rows: ResidenceRow[]): Residence[]` (trims names, `'' → null`, recomputes `mapUrl` via `buildMapUrl` when coords present else keeps existing).
  - `ResidencesEditor.vue`: props `{ personId: string; detail: PersonDetail }`; emits `saved: [detail: PersonDetail]`, `cancel: []`. On save PUTs `{ ...base, residences: toResidences(rows) }` where `base` is the current sparse override from `getProfile`.

- [ ] **Step 1: Write the failing composable test**

`residenceDraft.spec.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { seedRows, toResidences } from './residenceDraft';
import type { Residence } from '../types/family';

const krakow: Residence = { place: { ru: 'Краков', be: 'Кракаў', en: 'Kraków' }, fromYear: 1762, toYear: 1790, lat: 50.0614, lng: 19.9372, mapUrl: 'x' };

describe('residenceDraft', () => {
  it('seeds editable rows from residences with string place locales', () => {
    const rows = seedRows([krakow]);
    expect(rows[0].place).toEqual({ ru: 'Краков', be: 'Кракаў', en: 'Kraków' });
    expect(rows[0].lat).toBe(50.0614);
  });

  it('seeds empty-string locales when a place locale is missing', () => {
    const rows = seedRows([{ ...krakow, place: { ru: 'Краков', be: null, en: null } }]);
    expect(rows[0].place).toEqual({ ru: 'Краков', be: '', en: '' });
  });

  it('converts rows back to residences, nulling empty locales and rebuilding mapUrl from coords', () => {
    const rows = seedRows([{ ...krakow, place: { ru: 'Краков', be: '', en: '' } as unknown as Residence['place'], mapUrl: null }]);
    const out = toResidences(rows);
    expect(out[0].place).toEqual({ ru: 'Краков', be: null, en: null });
    expect(out[0].mapUrl).toBe('https://www.google.com/maps/search/?api=1&query=50.0614%2C19.9372');
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm --prefix src/frontend exec -- vitest run src/composables/residenceDraft.spec.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the composable**

`residenceDraft.ts`:

```ts
import type { Residence } from '../types/family';
import { buildMapUrl } from '../maps/mapLink';

export interface ResidenceRow {
  place: { ru: string; be: string; en: string };
  fromYear: number | null;
  toYear: number | null;
  lat: number | null;
  lng: number | null;
  mapUrl: string | null;
}

export function seedRows(residences: Residence[]): ResidenceRow[] {
  return residences.map(r => ({
    place: { ru: r.place.ru ?? '', be: r.place.be ?? '', en: r.place.en ?? '' },
    fromYear: r.fromYear,
    toYear: r.toYear,
    lat: r.lat,
    lng: r.lng,
    mapUrl: r.mapUrl
  }));
}

export function emptyRow(): ResidenceRow {
  return { place: { ru: '', be: '', en: '' }, fromYear: null, toYear: null, lat: null, lng: null, mapUrl: null };
}

export function toResidences(rows: ResidenceRow[]): Residence[] {
  const norm = (s: string): string | null => (s.trim() === '' ? null : s.trim());
  return rows.map(row => ({
    place: { ru: norm(row.place.ru), be: norm(row.place.be), en: norm(row.place.en) },
    fromYear: row.fromYear,
    toYear: row.toYear,
    lat: row.lat,
    lng: row.lng,
    // Prefer a fresh keyless link from coords; keep any existing one when coords absent.
    mapUrl: buildMapUrl(row.lat, row.lng) ?? row.mapUrl
  }));
}
```

- [ ] **Step 4: Run composable test — PASS**

Run: `npm --prefix src/frontend exec -- vitest run src/composables/residenceDraft.spec.ts`
Expected: PASS

- [ ] **Step 5: Write the failing ResidencesEditor test**

`ResidencesEditor.spec.ts` — mock `profileApi` + `MapPicker` (stub) so the test is deterministic:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mount } from '@vue/test-utils';
import { createI18n } from 'vue-i18n';
import ResidencesEditor from './ResidencesEditor.vue';
import type { PersonDetail } from '../types/family';

const getProfile = vi.fn();
const putProfile = vi.fn();
vi.mock('../api/profileApi', () => ({
  getProfile: (...a: unknown[]) => getProfile(...a),
  putProfile: (...a: unknown[]) => putProfile(...a),
  ProfileSaveError: class extends Error { fieldErrors: unknown[] = []; status = 400; }
}));
vi.mock('./MapPicker.vue', () => ({ default: { name: 'MapPicker', template: '<div data-test="map-picker-stub" />', props: ['modelValue'] } }));

const i18n = createI18n({ legacy: false, locale: 'en', messages: { en: {} }, missingWarn: false, fallbackWarn: false });

function detail(residences: PersonDetail['residences'] = []): PersonDetail {
  return {
    id: 'p-1', givenName: { ru: '', be: '', en: 'A' }, surname: { ru: '', be: '', en: 'B' },
    maidenName: null, middleName: null, sex: 'female',
    birth: { year: 1900, month: null, day: null, approx: false, place: null }, death: null,
    vocation: 'other', summary: null, biography: null, portrait: null, portraitVideo: null,
    gallery: [], links: [], residences, parents: { motherId: null, fatherId: null },
    marriedIntoFamily: false, isDefaultRoot: false
  } as PersonDetail;
}

const emptyOverride = { givenName: null, surname: null, maidenName: null, middleName: null, sex: null, birthYear: null, birthMonth: null, birthDay: null, deathYear: null, deathMonth: null, deathDay: null, vocation: null, residences: null };

beforeEach(() => { getProfile.mockReset(); putProfile.mockReset(); });

describe('ResidencesEditor', () => {
  it('PUTs residences merged onto the current override base, preserving scalar overrides', async () => {
    getProfile.mockResolvedValue({ ...emptyOverride, birthYear: 1901 });
    putProfile.mockResolvedValue(detail());
    const w = mount(ResidencesEditor, { props: { personId: 'p-1', detail: detail() }, global: { plugins: [i18n] } });
    await Promise.resolve(); await Promise.resolve();

    await w.find('[data-test="add-residence"]').trigger('click');
    await w.find('[data-test="place-en-0"]').setValue('Kraków');
    await w.find('[data-test="residences-save"]').trigger('click');
    await Promise.resolve();

    expect(putProfile).toHaveBeenCalledTimes(1);
    const payload = putProfile.mock.calls[0][1];
    expect(payload.birthYear).toBe(1901);
    expect(payload.residences).toHaveLength(1);
    expect(payload.residences[0].place.en).toBe('Kraków');
  });

  it('reverts to seed by sending residences: null', async () => {
    getProfile.mockResolvedValue({ ...emptyOverride, residences: [{ place: { ru: null, be: null, en: 'Old' }, fromYear: null, toYear: null, lat: null, lng: null, mapUrl: null }] });
    putProfile.mockResolvedValue(detail());
    const w = mount(ResidencesEditor, { props: { personId: 'p-1', detail: detail([{ place: { ru: null, be: null, en: 'Old' }, fromYear: null, toYear: null, lat: null, lng: null, mapUrl: null }]) }, global: { plugins: [i18n] } });
    await Promise.resolve(); await Promise.resolve();

    await w.find('[data-test="residences-revert"]').trigger('click');
    await w.find('[data-test="residences-save"]').trigger('click');
    await Promise.resolve();

    expect(putProfile.mock.calls[0][1].residences).toBeNull();
  });
});
```

- [ ] **Step 6: Run to verify it fails**

Run: `npm --prefix src/frontend exec -- vitest run src/components/ResidencesEditor.spec.ts`
Expected: FAIL — module not found.

- [ ] **Step 7: Write ResidencesEditor.vue**

`ResidencesEditor.vue`:

```vue
<script setup lang="ts">
import { ref, reactive, computed } from 'vue';
import { useI18n } from 'vue-i18n';
import type { PersonDetail } from '../types/family';
import { getProfile, putProfile, ProfileSaveError, type PersonProfile } from '../api/profileApi';
import { seedRows, emptyRow, toResidences, type ResidenceRow } from '../composables/residenceDraft';
import MapPicker, { type PickedPlace } from './MapPicker.vue';

const props = defineProps<{ personId: string; detail: PersonDetail }>();
const emit = defineEmits<{ saved: [detail: PersonDetail]; cancel: [] }>();
const { t } = useI18n({ useScope: 'global' });

const rows = reactive<ResidenceRow[]>(seedRows(props.detail.residences));
const reverted = ref(false);
const openPicker = ref<number | null>(null);
const saving = ref(false);
const error = ref<string | null>(null);
const formError = ref<string | null>(null);

const base = ref<PersonProfile | null>(null);
void getProfile(props.personId)
  .then(p => { base.value = p; })
  .catch(() => { error.value = t('members.loadFailed'); });

function addRow(): void {
  reverted.value = false;
  rows.push(emptyRow());
}
function removeRow(i: number): void {
  rows.splice(i, 1);
  if (openPicker.value === i) {
    openPicker.value = null;
  }
}
function togglePicker(i: number): void {
  openPicker.value = openPicker.value === i ? null : i;
}
function pickedFor(row: ResidenceRow): PickedPlace {
  return { lat: row.lat, lng: row.lng, place: { ...row.place }, mapUrl: row.mapUrl };
}
function onPicked(i: number, value: PickedPlace): void {
  const row = rows[i];
  row.lat = value.lat;
  row.lng = value.lng;
  row.mapUrl = value.mapUrl;
  // Only overwrite a place locale the picker actually resolved (non-empty).
  if (value.place.ru) { row.place.ru = value.place.ru; }
  if (value.place.be) { row.place.be = value.place.be; }
  if (value.place.en) { row.place.en = value.place.en; }
}
function revertAll(): void {
  reverted.value = true;
  rows.splice(0, rows.length);
}

const canRevert = computed(() => base.value?.residences != null);

async function save(): Promise<void> {
  if (saving.value || base.value == null) {
    return;
  }
  saving.value = true;
  error.value = null;
  formError.value = null;
  try {
    const residences = reverted.value ? null : toResidences(rows);
    const payload: PersonProfile = { ...base.value, residences };
    const updated = await putProfile(props.personId, payload);
    emit('saved', updated);
  } catch (e) {
    if (e instanceof ProfileSaveError) {
      formError.value = e.fieldErrors[0]?.errorMessage ?? null;
    }
    error.value = t('editor.saveFailed');
  } finally {
    saving.value = false;
  }
}
</script>

<template>
  <div class="res-editor" data-test="residences-editor">
    <ul class="res-editor__list">
      <li v-for="(row, i) in rows" :key="i" class="res-editor__row">
        <div class="res-editor__places">
          <input v-model="row.place.ru" type="text" class="res-editor__input" :data-test="`place-ru-${i}`" :placeholder="t('members.placeRu')" />
          <input v-model="row.place.be" type="text" class="res-editor__input" :data-test="`place-be-${i}`" :placeholder="t('members.placeBe')" />
          <input v-model="row.place.en" type="text" class="res-editor__input" :data-test="`place-en-${i}`" :placeholder="t('members.placeEn')" />
        </div>
        <div class="res-editor__years">
          <input v-model.number="row.fromYear" type="number" class="res-editor__input" :data-test="`from-${i}`" :placeholder="t('members.fromYear')" />
          <input v-model.number="row.toYear" type="number" class="res-editor__input" :data-test="`to-${i}`" :placeholder="t('members.toYear')" />
          <button type="button" class="res-editor__icon" :data-test="`pick-${i}`" :aria-label="t('members.pickOnMap')" @click="togglePicker(i)">📍</button>
          <button type="button" class="res-editor__icon" :data-test="`remove-${i}`" :aria-label="t('members.removeResidence')" @click="removeRow(i)">✕</button>
        </div>
        <MapPicker v-if="openPicker === i" :model-value="pickedFor(row)" @update:model-value="onPicked(i, $event)" />
      </li>
    </ul>

    <button type="button" class="res-editor__add" data-test="add-residence" @click="addRow">+ {{ t('members.addResidence') }}</button>

    <p v-if="formError" class="res-editor__error" data-test="residences-form-error">{{ formError }}</p>
    <p v-if="error" class="res-editor__error" data-test="residences-error">{{ error }}</p>

    <div class="res-editor__actions">
      <button v-if="canRevert" type="button" class="res-editor__btn res-editor__btn--ghost" data-test="residences-revert" @click="revertAll">{{ t('members.revert') }}</button>
      <button type="button" class="res-editor__btn res-editor__btn--ghost" data-test="residences-cancel" @click="emit('cancel')">{{ t('members.cancelEdit') }}</button>
      <button type="button" class="res-editor__btn res-editor__btn--primary" data-test="residences-save" :disabled="saving || base == null" @click="save">{{ saving ? t('editor.saving') : t('editor.save') }}</button>
    </div>
  </div>
</template>

<style scoped lang="scss">
.res-editor { display: flex; flex-direction: column; gap: 12px; font-family: var(--font-body); }
.res-editor__list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 14px; }
.res-editor__row { display: flex; flex-direction: column; gap: 8px; padding-bottom: 12px; border-bottom: 1px solid var(--panel-edge); }
.res-editor__places { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; }
.res-editor__years { display: flex; gap: 8px; align-items: center; }
.res-editor__input {
  box-sizing: border-box; padding: 8px 10px; min-width: 0;
  background: var(--field-bg); border: 1px solid var(--gilt); border-radius: 8px; color: var(--ink);
  font-family: var(--font-body); font-size: 15px;
  &:focus-visible { outline: 2px solid var(--gilt); outline-offset: 1px; }
}
.res-editor__icon {
  flex: 0 0 auto; width: 34px; height: 34px; border-radius: 8px; cursor: pointer;
  border: 1px solid var(--gilt); background: var(--surface-card); color: var(--ink);
  &:hover { background: var(--control-hover); }
  &:focus-visible { outline: 2px solid var(--gilt); outline-offset: 1px; }
}
.res-editor__add {
  align-self: flex-start; padding: 7px 14px; border-radius: 999px; cursor: pointer;
  border: 1px solid var(--gilt); background: var(--surface-card); color: var(--ink); font-family: var(--font-display); font-size: 14px;
  &:hover { background: var(--control-hover); }
}
.res-editor__error { margin: 0; font-size: 13px; color: var(--umber); }
.res-editor__actions { display: flex; justify-content: flex-end; gap: 10px; }
.res-editor__btn {
  height: 32px; padding: 0 16px; border-radius: 8px; cursor: pointer; font-family: var(--font-display); font-size: 14px;
  &:focus-visible { outline: 2px solid var(--leaf-deep); outline-offset: 2px; }
  &--ghost { border: none; background: transparent; color: var(--ink-soft); font-family: var(--font-body); &:hover { background: var(--btn-hover); } }
  &--primary { border: 1px solid var(--leaf-deep); background: var(--leaf-deep); color: var(--on-accent); &:disabled { opacity: 0.45; cursor: default; } }
}
</style>
```

- [ ] **Step 8: Run the ResidencesEditor test — PASS**

Run: `npm --prefix src/frontend exec -- vitest run src/components/ResidencesEditor.spec.ts`
Expected: PASS (both cases)

- [ ] **Step 9: Commit**

```bash
git add src/frontend/src/composables/residenceDraft.ts src/frontend/src/composables/residenceDraft.spec.ts src/frontend/src/components/ResidencesEditor.vue src/frontend/src/components/ResidencesEditor.spec.ts
git commit -m "feat(residences): editable residence rows + ResidencesEditor with map picker"
```

---

## Task 11: Wire ResidencesEditor + read-only map link into MemberDetail + i18n

**Files:**
- Modify: `src/frontend/src/components/MemberDetail.vue`
- Modify: `src/frontend/src/i18n/messages/en.ts`, `ru.ts`, `be.ts`
- Test: `src/frontend/src/components/MemberDetail.spec.ts`

**Interfaces:**
- Consumes: `ResidencesEditor` (Task 10); `authStore.canEdit`; `Residence.mapUrl`.
- Produces: the residences panel shows an Edit toggle only when `canEdit`; the read-only list gains a per-row map-pin link to `mapUrl`; on `saved`, `detail` + `selection.applyDetail` update (no `store.load()`, no slug change).

- [ ] **Step 1: Add i18n strings**

In each of `en.ts`, `ru.ts`, `be.ts`, under the `members: { ... }` object add these keys (values below are English; use natural ru/be translations for the other two — the app already localizes `members.residences`, `members.viewOnMap` exists under `person`, so keep tone consistent):

`en.ts` (members):

```ts
    addResidence: 'Add residence',
    removeResidence: 'Remove residence',
    editResidences: 'Edit residences',
    searchCity: 'Search a city…',
    pickOnMap: 'Pick on map',
    mapHint: 'Search or drag the pin to set the place. Coordinates are saved with the record.',
    mapManualHint: 'Map unavailable — enter coordinates manually.',
    placeRu: 'Place (ru)',
    placeBe: 'Place (be)',
    placeEn: 'Place (en)',
    fromYear: 'From year',
    toYear: 'To year',
    lat: 'Latitude',
    lng: 'Longitude',
    viewOnMap: 'Open in Google Maps',
```

`ru.ts` (members) — example values:

```ts
    addResidence: 'Добавить место',
    removeResidence: 'Удалить место',
    editResidences: 'Редактировать места',
    searchCity: 'Найти город…',
    pickOnMap: 'Выбрать на карте',
    mapHint: 'Найдите город или перетащите метку. Координаты сохраняются с записью.',
    mapManualHint: 'Карта недоступна — введите координаты вручную.',
    placeRu: 'Место (ru)',
    placeBe: 'Место (be)',
    placeEn: 'Место (en)',
    fromYear: 'С года',
    toYear: 'По год',
    lat: 'Широта',
    lng: 'Долгота',
    viewOnMap: 'Открыть в Google Maps',
```

`be.ts` (members) — example values:

```ts
    addResidence: 'Дадаць месца',
    removeResidence: 'Выдаліць месца',
    editResidences: 'Рэдагаваць месцы',
    searchCity: 'Знайсці горад…',
    pickOnMap: 'Выбраць на карце',
    mapHint: 'Знайдзіце горад або перацягніце метку. Каардынаты захоўваюцца з запісам.',
    mapManualHint: 'Карта недаступная — увядзіце каардынаты ўручную.',
    placeRu: 'Месца (ru)',
    placeBe: 'Месца (be)',
    placeEn: 'Месца (en)',
    fromYear: 'З года',
    toYear: 'Па год',
    lat: 'Шырата',
    lng: 'Даўгата',
    viewOnMap: 'Адкрыць у Google Maps',
```

> The `messages.spec.ts` test asserts locale parity (all three files share the same key set). Run it in Step 6 to confirm no key is missing from any locale.

- [ ] **Step 2: Write the failing MemberDetail test additions**

Add to `MemberDetail.spec.ts` (it already mounts `MemberDetail` with a stubbed `fetchPerson` and an auth store — follow its existing setup; stub `ResidencesEditor` like other child stubs):

```ts
it('shows a read-only map link for a residence with a mapUrl', async () => {
  // Arrange a detail whose residences carry a mapUrl (see the file's fetchPerson stub),
  // mount as a signed-out visitor, then:
  const link = wrapper.find('[data-test="residence-map-link"]');
  expect(link.exists()).toBe(true);
  expect(link.attributes('href')).toContain('google.com/maps');
});

it('shows the residences Edit toggle only when canEdit', async () => {
  // With auth.canEdit = true:
  expect(wrapper.find('[data-test="residences-edit"]').exists()).toBe(true);
});
```

> Adapt the arrange blocks to the file's existing helpers (its `mountDetail({ canEdit })` / `fetchPerson` mock). Give one residence a `mapUrl` and a `lat/lng`.

- [ ] **Step 3: Run to verify it fails**

Run: `npm --prefix src/frontend exec -- vitest run src/components/MemberDetail.spec.ts`
Expected: FAIL — no `residence-map-link` / `residences-edit` elements.

- [ ] **Step 4: Implement in MemberDetail.vue**

Import the editor and add editing state (near the existing `editingBio` state, around line 110):

```ts
import ResidencesEditor from './ResidencesEditor.vue';
```

```ts
const editingResidences = ref(false);
watch(() => props.personId, () => { editingResidences.value = false; });
function onResidencesSaved(updated: PersonDetail): void {
  detail.value = updated;
  selection.applyDetail(updated);
  editingResidences.value = false;
}
```

Replace the residences `<section>` (lines 270-278) with an editor-aware panel that always renders for editors (so they can add the first residence) and shows a map link per row:

```vue
        <section v-if="detail.residences.length > 0 || canEdit" class="member-detail__panel member-detail__residences">
          <div class="member-detail__panel-head">
            <h3 class="member-detail__panel-title">{{ t('members.residences') }}</h3>
            <button
              v-if="canEdit && !editingResidences"
              type="button"
              class="member-detail__bio-edit"
              data-test="residences-edit"
              :aria-label="t('members.editResidences')"
              @click="editingResidences = true"
            >✎</button>
          </div>
          <ResidencesEditor
            v-if="editingResidences"
            :person-id="detail.id"
            :detail="detail"
            @saved="onResidencesSaved"
            @cancel="editingResidences = false"
          />
          <ul v-else-if="detail.residences.length > 0" class="member-detail__residence-list">
            <li v-for="(r, i) in detail.residences" :key="i" class="member-detail__residence">
              <span class="member-detail__residence-place">{{ localize(r.place, localeStore.currentLocale) }}</span>
              <span class="member-detail__residence-meta">
                <span v-if="r.fromYear || r.toYear" class="member-detail__residence-years">{{ residenceYears(r.fromYear, r.toYear) }}</span>
                <a
                  v-if="r.mapUrl"
                  class="member-detail__residence-map"
                  data-test="residence-map-link"
                  :href="r.mapUrl"
                  target="_blank"
                  rel="noopener noreferrer"
                  :aria-label="t('members.viewOnMap')"
                >📍</a>
              </span>
            </li>
          </ul>
          <p v-else class="member-detail__bio-empty">{{ t('editor.empty') }}</p>
        </section>
```

Add styles near the other residence rules:

```scss
.member-detail__residence-meta { display: inline-flex; align-items: center; gap: 10px; }
.member-detail__residence-map {
  text-decoration: none; font-size: 15px; line-height: 1;
  &:focus-visible { outline: 2px solid var(--gilt); outline-offset: 2px; }
}
```

- [ ] **Step 5: Run MemberDetail test — PASS**

Run: `npm --prefix src/frontend exec -- vitest run src/components/MemberDetail.spec.ts`
Expected: PASS

- [ ] **Step 6: Run the full frontend suite + type-check**

Run: `npm --prefix src/frontend test`
Then: `npm --prefix src/frontend run build`
Expected: all tests PASS (including `messages.spec.ts` locale parity); build succeeds.

- [ ] **Step 7: Commit**

```bash
git add src/frontend/src/components/MemberDetail.vue src/frontend/src/components/MemberDetail.spec.ts src/frontend/src/i18n/messages/en.ts src/frontend/src/i18n/messages/ru.ts src/frontend/src/i18n/messages/be.ts
git commit -m "feat(members): residences editor toggle + read-only map link in the dossier"
```

---

## Task 12: Documentation

**Files:**
- Modify: `docs/reference/features/person-details.md`
- Modify: `docs/reference/features/backend-api.md`
- Modify: `docs/reference/roadmap.md`

**Interfaces:** none (docs only).

- [ ] **Step 1: Update person-details.md**

Document that residences are now editor-editable from the Members dossier: the residence record fields (`place` ru·be·en, `fromYear`, `toYear`, `lat`, `lng`, `mapUrl`), the Google-Maps editor picker (with keyless manual-entry fallback), the whole-list-replace override + revert-to-seed, and the read-only "open in Google Maps" link (an outbound link, not an embedded map). Note the `VITE_GOOGLE_MAPS_API_KEY` requirement + HTTP-referrer restriction, and that visitors never trigger a billed map load.

- [ ] **Step 2: Update backend-api.md**

Extend the `PUT /api/people/{id}/profile` and `GET /api/people/{id}/profile` contract docs: `PersonProfileDto` now carries an optional `residences` array (`{ place, fromYear, toYear, lat, lng, mapUrl }`); `null` inherits the seed list, a present list replaces it wholesale; per-row validation (≤10 rows, ≥1 place locale, year bounds + from≤to, lat/lng bounds, http(s) mapUrl). Note `Residence` gained `lat`/`lng`.

- [ ] **Step 3: Update roadmap.md**

Move residence editing + map picker from planned/roadmap to shipped under the Members page cuts (mark Cut 1c done).

- [ ] **Step 4: Commit**

```bash
git add docs/reference/features/person-details.md docs/reference/features/backend-api.md docs/reference/roadmap.md
git commit -m "docs: residence editing + map picker (Members cut 1c)"
```

---

## Final verification (before opening the PR)

- [ ] **Backend suite:** `dotnet test` → all PASS.
- [ ] **Frontend suite:** `npm --prefix src/frontend test` → all PASS.
- [ ] **Frontend build/type-check:** `npm --prefix src/frontend run build` → succeeds.
- [ ] **Manual dogfood (optional, needs a Maps key + sign-in):** run the dev pair on a whitelisted port (`node scripts/dev.mjs --port 5174 --api-port 5038`), sign in, open a member with seed residences (Kraków/Wieliczka), re-pick each on the map to attach coords, save, reload, and confirm the coords persist and the visitor view shows the "open in Google Maps" link. Without a key, confirm the manual lat/lng fallback saves and the link renders.
- [ ] **Open the PR** into `main` (run the `update-docs-for-pr` skill first; docs are already in Task 12). Do **not** self-merge — the owner reviews.

---

## Self-Review Notes (author)

- **Spec coverage:** data model (T1–T2), whole-list merge + null-inherit (T3), Firestore persistence (T4), validation incl. list cap / coords / mapUrl (T5), the whole-record clobber guard (T6), keyless map link (T7), Google loader + geocoding + degradation (T8), interactive picker + manual fallback (T9), residences editor + revert-to-seed (T10), read-only outbound link + editor wiring + i18n (T11), docs (T12). Store-sync-without-graph-refetch is realized in T11's `onResidencesSaved` (no `store.load()`, no slug recompute), per spec.
- **Type consistency:** `PickedPlace` (T9) is consumed by `ResidencesEditor` (T10); `ResidenceRow`/`seedRows`/`toResidences`/`emptyRow` (T10) match their uses; `PersonProfile.residences` (T6) is the payload field written by both editors; `buildMapUrl` signature is stable across T7/T9/T10.
- **Cost/keyless invariant:** the only embedded (billed) map is `MapPicker`, mounted solely inside `ResidencesEditor` (editor-only). The visitor path in `MemberDetail`/`PersonDossier` is a plain `<a href>` — no API call.
