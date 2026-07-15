# Members Cut 1b.1 — Full Dates, Biography Editing, Editor Placement Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a signed-in editor edit the **day and month** (not just year) of birth/death, edit the **biography** from the Members dossier, and move the **Edit details** button to the dossier header's top-right (separated from Find-on-tree).

**Architecture:** One bundled backend + frontend increment on top of cut 1b. Backend: extend the profile override with `BirthMonth/BirthDay/DeathMonth/DeathDay` (`int?`, same "null = inherit seed" model), merge them in `FamilySnapshotProvider.ApplyProfile`, and validate the *effective* date in the handler (coherence + day-in-month). Frontend: birth/death become year+month+day inputs in `MemberFieldsEditor` (progressive enabling, per-event reset); reuse the existing `BiographyEditor` in `MemberDetail`; move the field-editor button to the header top-right.

**Tech Stack:** .NET 10 (Domain/Application/Infrastructure/Api, MediatR, Mapster, FluentValidation, xUnit + Moq + AwesomeAssertions); Vue 3 + TS + Pinia + vue-i18n; Vitest + @vue/test-utils.

## Global Constraints

- **Override model unchanged:** every override field is `int?`/nullable; `null` = inherit the `family.json` seed. Mapster auto-maps `int?` fields by name (no explicit `.Map` needed for the new date fields).
- **`approx` and `place` are NOT editable** here (place is cut 1c; `approx` inherits the seed). Only year/month/day.
- **Validation split:** `UpdatePersonProfileValidator` does coarse self-contained bounds (month ∈ [1,12], day ∈ [1,31]); the **handler** validates the *effective* date (override field `??` current merged value): a **day requires a month**, a **month requires a year**, and the **day must be valid for the effective month/year** (`DateTime.DaysInMonth`; unknown year → use a leap year so Feb 29 is allowed). Violations → **400** on `Profile.BirthDate` / `Profile.DeathDate`.
- **Wire shape is camelCase:** `PersonProfileDto`/`PersonProfile` gain `birthMonth, birthDay, deathMonth, deathDay`. 400 body stays `{ title, errors: [{ propertyName, errorMessage }] }`.
- **Theme-aware:** SCSS design tokens only, never a hardcoded gold hex (Film remaps the gilt tokens to grey).
- **Localized:** every user-facing string is an i18n key present in all three catalogs (`src/frontend/src/i18n/messages/{ru,be,en}.ts`); new keys: `members.field.year`, `members.field.month`, `members.field.day`. Biography reuses existing `editor.*` keys.
- **No backend change for biography** (`PUT /api/people/{id}/biography` exists); biography editing reuses `BiographyEditor.vue` exactly as `PersonDossier.vue` does.
- **Commands:** backend from repo root (`dotnet test`); frontend from `src/frontend/` (`npm test -- --run <path>`, `npm run build`).

---

## File Structure

- **Modify** `src/backend/FamilyTree.Domain/PersonProfileOverride.cs` — add 4 `int?` date fields.
- **Create** `src/backend/FamilyTree.Domain/ProfileDate.cs` — pure effective-date validator (`Validate`).
- **Modify** `src/backend/FamilyTree.Application/Dtos/PersonProfileDto.cs` — add 4 `int?` date fields.
- **Modify** `src/backend/FamilyTree.Infrastructure/FamilySnapshotProvider.cs` — `ApplyProfile` merges month/day (birth + death) via `MergeEvent`/`MergeDeathEvent`.
- **Modify** `src/backend/FamilyTree.Application/People/UpdatePersonProfileValidator.cs` — coarse month/day bounds.
- **Modify** `src/backend/FamilyTree.Application/People/UpdatePersonProfileHandler.cs` — effective-date checks.
- **Modify** `src/frontend/src/api/profileApi.ts` — `PersonProfile` gains 4 date fields.
- **Modify** `src/frontend/src/composables/profileDraft.ts` — `ProfileField`/`ProfileDraft`/`seedDraft` gain the 4 fields (payload/isOverridden handle them as scalars).
- **Modify** `src/frontend/src/components/MemberFieldsEditor.vue` — birth/death year+month+day inputs, progressive enabling, per-event reset; new i18n keys.
- **Modify** `src/frontend/src/components/MemberDetail.vue` — move Edit button to header top-right; wire `BiographyEditor` into the biography section.
- **Test files:** extend `PersonProfileMappingTests.cs`, `FamilySnapshotProviderTests.cs`, `UpdatePersonProfileValidatorTests.cs`, `PeopleProfileEndpointsTests.cs`; create `ProfileDateTests.cs`; extend `profileDraft.spec.ts`, `MemberFieldsEditor.spec.ts`, `MemberDetail.spec.ts`.

---

### Task 1: Backend — override + DTO date fields

**Files:**
- Modify: `src/backend/FamilyTree.Domain/PersonProfileOverride.cs`
- Modify: `src/backend/FamilyTree.Application/Dtos/PersonProfileDto.cs`
- Test: `tests/unit/FamilyTree.UnitTests/Mapping/PersonProfileMappingTests.cs`

**Interfaces:**
- Produces: `PersonProfileOverride` and `PersonProfileDto` each gain `int? BirthMonth`, `int? BirthDay`, `int? DeathMonth`, `int? DeathDay`. DTO is a positional record — append the new params at the end.

- [ ] **Step 1: Write the failing test**

Add to `tests/unit/FamilyTree.UnitTests/Mapping/PersonProfileMappingTests.cs` inside the class:

```csharp
    [Fact]
    public void Map_DtoToDomain_ShouldCarryMonthAndDay()
    {
        var config = NewConfig();
        var dto = new PersonProfileDto(null, null, null, null, 1901, 5, 3, 1980, 6, 12, null);

        var domain = dto.Adapt<PersonProfileOverride>(config);

        domain.BirthYear.Should().Be(1901);
        domain.BirthMonth.Should().Be(5);
        domain.BirthDay.Should().Be(3);
        domain.DeathYear.Should().Be(1980);
        domain.DeathMonth.Should().Be(6);
        domain.DeathDay.Should().Be(12);
    }
```

Note: the DTO param order after this task is `(GivenName, Surname, MaidenName, Sex, BirthYear, BirthMonth, BirthDay, DeathYear, DeathMonth, DeathDay, Vocation)`.

- [ ] **Step 2: Run test to verify it fails**

Run: `dotnet test tests/unit/FamilyTree.UnitTests --filter PersonProfileMappingTests`
Expected: FAIL to compile — `PersonProfileDto` has no such constructor / `BirthMonth` missing.

- [ ] **Step 3: Update the domain record**

`src/backend/FamilyTree.Domain/PersonProfileOverride.cs` — add the fields after `DeathYear`:

```csharp
public sealed record PersonProfileOverride
{
    public LocalizedText? GivenName { get; init; }
    public LocalizedText? Surname { get; init; }
    public LocalizedText? MaidenName { get; init; }
    public Sex? Sex { get; init; }
    public int? BirthYear { get; init; }
    public int? BirthMonth { get; init; }
    public int? BirthDay { get; init; }
    public int? DeathYear { get; init; }
    public int? DeathMonth { get; init; }
    public int? DeathDay { get; init; }
    public Vocation? Vocation { get; init; }
}
```

- [ ] **Step 4: Update the DTO record**

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
    int? BirthMonth,
    int? BirthDay,
    int? DeathYear,
    int? DeathMonth,
    int? DeathDay,
    string? Vocation);
```

- [ ] **Step 5: Fix existing call sites that build the DTO positionally**

The integration test helper `PeopleProfileEndpointsTests.BirthYear` and the mapping tests build `PersonProfileDto(...)` positionally. Update them to the new arity. In `tests/integration/FamilyTree.IntegrationTests/PeopleProfileEndpointsTests.cs`:

```csharp
    private static PersonProfileDto BirthYear(int year) => new(null, null, null, null, year, null, null, null, null, null, null);
```

In `tests/unit/FamilyTree.UnitTests/Mapping/PersonProfileMappingTests.cs`, update the existing `new PersonProfileDto(null, null, null, "male", 1897, null, "teacher")` → `new PersonProfileDto(null, null, null, "male", 1897, null, null, null, null, null, "teacher")` and the all-null one similarly. In `tests/unit/FamilyTree.UnitTests/Application/UpdatePersonProfileValidatorTests.cs`, update every `new PersonProfileDto(...)` to the new arity (insert `null, null` after the birth-year slot and `null, null` after the death-year slot; keep the trailing vocation). Use a compiler pass to find them all.

- [ ] **Step 6: Run the test to verify it passes**

Run: `dotnet build && dotnet test tests/unit/FamilyTree.UnitTests --filter PersonProfileMappingTests`
Expected: PASS. Then `dotnet test` (whole solution) to confirm the arity fix didn't break other tests. Expected: all green.

- [ ] **Step 7: Commit**

```bash
git add src/backend/FamilyTree.Domain/PersonProfileOverride.cs src/backend/FamilyTree.Application/Dtos/PersonProfileDto.cs tests/unit/FamilyTree.UnitTests/Mapping/PersonProfileMappingTests.cs tests/unit/FamilyTree.UnitTests/Application/UpdatePersonProfileValidatorTests.cs tests/integration/FamilyTree.IntegrationTests/PeopleProfileEndpointsTests.cs
git commit -m "feat(members): add month/day to the profile override + DTO"
```

---

### Task 2: Backend — merge month/day in the snapshot

**Files:**
- Modify: `src/backend/FamilyTree.Infrastructure/FamilySnapshotProvider.cs` (the `ApplyProfile` method, ~line 184)
- Test: `tests/unit/FamilyTree.UnitTests/Infrastructure/FamilySnapshotProviderTests.cs`

**Interfaces:**
- Consumes: `PersonProfileOverride.BirthMonth/BirthDay/DeathMonth/DeathDay` (Task 1).
- Produces: `ApplyProfile` merges each non-null date field over the seed `LifeEvent`.

- [ ] **Step 1: Write the failing test**

Add to `tests/unit/FamilyTree.UnitTests/Infrastructure/FamilySnapshotProviderTests.cs`. Find how the existing profile-merge tests build a provider + override store (mirror the nearest existing "profile override merges" test). Add:

```csharp
    [Fact]
    public async Task Snapshot_WhenProfileOverridesBirthMonthAndDay_ShouldMergeOverSeed()
    {
        // Arrange: a person whose seed birth is year-only (see the fixture the other
        // profile-merge tests use); append an override adding month + day.
        // (Mirror the arrange/act of the existing "profile birth year merges" test in this file.)
        var provider = BuildProviderWithProfileOverride(
            personId: "p-0001",
            new PersonProfileOverride { BirthMonth = 5, BirthDay = 3 });

        var snapshot = await provider.GetSnapshotAsync(CancellationToken.None);

        var person = snapshot.People.Single(p => p.Id == "p-0001");
        person.Birth.Month.Should().Be(5);
        person.Birth.Day.Should().Be(3);
        person.Birth.Year.Should().Be(person.Birth.Year); // year still inherited from seed
    }
```

If this file has no reusable `BuildProviderWithProfileOverride` helper, instead extend the existing profile-merge test that is closest in shape: copy its arrange block, set `BirthMonth`/`BirthDay` on the override, and assert `Birth.Month`/`Birth.Day`. The implementer should read the existing profile tests first and match their exact construction (mock override store returning the override for the id).

- [ ] **Step 2: Run test to verify it fails**

Run: `dotnet test tests/unit/FamilyTree.UnitTests --filter FamilySnapshotProviderTests`
Expected: FAIL — `Birth.Month` is null (merge ignores month/day).

- [ ] **Step 3: Update `ApplyProfile`**

In `src/backend/FamilyTree.Infrastructure/FamilySnapshotProvider.cs`, replace the `Birth =` and `Death =` lines of `ApplyProfile` and add two helpers:

```csharp
    private static Person ApplyProfile(Person seed, PersonProfileOverride profile) => seed with
    {
        GivenName = MergeText(profile.GivenName, seed.GivenName),
        Surname = MergeText(profile.Surname, seed.Surname),
        MaidenName = profile.MaidenName is null ? seed.MaidenName : MergeText(profile.MaidenName, seed.MaidenName ?? new LocalizedText()),
        Sex = profile.Sex ?? seed.Sex,
        Vocation = profile.Vocation ?? seed.Vocation,
        Birth = MergeEvent(seed.Birth, profile.BirthYear, profile.BirthMonth, profile.BirthDay),
        Death = MergeDeathEvent(seed.Death, profile.DeathYear, profile.DeathMonth, profile.DeathDay)
    };

    // Apply each non-null date field over the seed event; all null → the seed unchanged.
    private static LifeEvent MergeEvent(LifeEvent seed, int? year, int? month, int? day) =>
        year is null && month is null && day is null
            ? seed
            : seed with { Year = year ?? seed.Year, Month = month ?? seed.Month, Day = day ?? seed.Day };

    private static LifeEvent? MergeDeathEvent(LifeEvent? seed, int? year, int? month, int? day)
    {
        if (year is null && month is null && day is null)
        {
            return seed;
        }
        var basis = seed ?? new LifeEvent();
        return basis with { Year = year ?? basis.Year, Month = month ?? basis.Month, Day = day ?? basis.Day };
    }
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `dotnet test tests/unit/FamilyTree.UnitTests --filter FamilySnapshotProviderTests`
Expected: PASS (new + existing profile-merge tests, including the year-only and death cases).

- [ ] **Step 5: Commit**

```bash
git add src/backend/FamilyTree.Infrastructure/FamilySnapshotProvider.cs tests/unit/FamilyTree.UnitTests/Infrastructure/FamilySnapshotProviderTests.cs
git commit -m "feat(members): merge profile month/day over the seed date"
```

---

### Task 3: Backend — date validation (validator bounds + effective-date check)

**Files:**
- Create: `src/backend/FamilyTree.Domain/ProfileDate.cs`
- Modify: `src/backend/FamilyTree.Application/People/UpdatePersonProfileValidator.cs`
- Modify: `src/backend/FamilyTree.Application/People/UpdatePersonProfileHandler.cs`
- Test: `tests/unit/FamilyTree.UnitTests/Domain/ProfileDateTests.cs` (create), `UpdatePersonProfileValidatorTests.cs`, `PeopleProfileEndpointsTests.cs`

**Interfaces:**
- Produces: `ProfileDate.Validate(int? year, int? month, int? day) → string?` (null = valid, else an error message).
- Consumes: `existing.Birth`/`existing.Death` (a `Person`) in the handler; the request `PersonProfileDto`.

- [ ] **Step 1: Write the failing test for the domain helper**

Create `tests/unit/FamilyTree.UnitTests/Domain/ProfileDateTests.cs`:

```csharp
using FamilyTree.Domain;

namespace FamilyTree.UnitTests.Domain;

public sealed class ProfileDateTests
{
    [Fact]
    public void Validate_WhenFullValidDate_ShouldReturnNull()
    {
        ProfileDate.Validate(1901, 5, 3).Should().BeNull();
    }

    [Fact]
    public void Validate_WhenYearOnly_ShouldReturnNull()
    {
        ProfileDate.Validate(1901, null, null).Should().BeNull();
    }

    [Fact]
    public void Validate_WhenDayWithoutMonth_ShouldReturnError()
    {
        ProfileDate.Validate(1901, null, 3).Should().NotBeNull();
    }

    [Fact]
    public void Validate_WhenMonthWithoutYear_ShouldReturnError()
    {
        ProfileDate.Validate(null, 5, null).Should().NotBeNull();
    }

    [Fact]
    public void Validate_WhenDayExceedsMonthLength_ShouldReturnError()
    {
        ProfileDate.Validate(1901, 4, 31).Should().NotBeNull(); // April has 30 days
    }

    [Fact]
    public void Validate_WhenFeb29AndYearUnknown_ShouldReturnNull()
    {
        ProfileDate.Validate(null, null, null).Should().BeNull(); // sanity: empty is valid
        ProfileDate.Validate(2000, 2, 29).Should().BeNull();      // leap year
    }
}
```

- [ ] **Step 2: Run to verify it fails**

Run: `dotnet test tests/unit/FamilyTree.UnitTests --filter ProfileDateTests`
Expected: FAIL — `ProfileDate` does not exist.

- [ ] **Step 3: Implement the domain helper**

Create `src/backend/FamilyTree.Domain/ProfileDate.cs`:

```csharp
namespace FamilyTree.Domain;

/// <summary>Validates an effective (post-merge) partial date. Returns null when valid,
/// otherwise a human-readable reason. Coherence: a day needs a month, a month needs a year;
/// a day must fit its month (unknown year → assume a leap year so 29 Feb is allowed).</summary>
public static class ProfileDate
{
    public static string? Validate(int? year, int? month, int? day)
    {
        if (day is not null && month is null)
        {
            return "A day requires a month.";
        }
        if (month is not null && year is null)
        {
            return "A month requires a year.";
        }
        if (day is not null && month is { } m && m >= 1 && m <= 12)
        {
            var daysInMonth = DateTime.DaysInMonth(year ?? 2000, m);
            if (day < 1 || day > daysInMonth)
            {
                return $"Day {day} is not valid for month {m}.";
            }
        }
        return null;
    }
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `dotnet test tests/unit/FamilyTree.UnitTests --filter ProfileDateTests`
Expected: PASS (6 cases).

- [ ] **Step 5: Add coarse bounds to the validator + a failing validator test**

Add to `tests/unit/FamilyTree.UnitTests/Application/UpdatePersonProfileValidatorTests.cs`:

```csharp
    [Fact]
    public void Validate_WhenMonthOutOfRange_ShouldFail()
    {
        Validator.Validate(Cmd(new PersonProfileDto(null, null, null, null, 1901, 13, null, null, null, null, null))).IsValid.Should().BeFalse();
    }

    [Fact]
    public void Validate_WhenDayOutOfRange_ShouldFail()
    {
        Validator.Validate(Cmd(new PersonProfileDto(null, null, null, null, 1901, 5, 40, null, null, null, null))).IsValid.Should().BeFalse();
    }
```

Run to confirm they fail: `dotnet test tests/unit/FamilyTree.UnitTests --filter UpdatePersonProfileValidatorTests` — Expected: the two new tests FAIL (no bounds yet).

Then add the rules in `src/backend/FamilyTree.Application/People/UpdatePersonProfileValidator.cs` inside the `When(c => c.Profile is not null, ...)` block, after the existing year rules:

```csharp
            RuleFor(c => c.Profile.BirthMonth).InclusiveBetween(1, 12).When(c => c.Profile.BirthMonth.HasValue);
            RuleFor(c => c.Profile.BirthDay).InclusiveBetween(1, 31).When(c => c.Profile.BirthDay.HasValue);
            RuleFor(c => c.Profile.DeathMonth).InclusiveBetween(1, 12).When(c => c.Profile.DeathMonth.HasValue);
            RuleFor(c => c.Profile.DeathDay).InclusiveBetween(1, 31).When(c => c.Profile.DeathDay.HasValue);
```

Run again — Expected: PASS.

- [ ] **Step 6: Add the effective-date check to the handler**

In `src/backend/FamilyTree.Application/People/UpdatePersonProfileHandler.cs`, after the existing cross-entity birth-year check (the `if (!check.IsValid)` block) and before `var profile = _mapper.Map<...>`, insert:

```csharp
        var birthDateError = ProfileDate.Validate(
            request.Profile.BirthYear ?? existing.Birth.Year,
            request.Profile.BirthMonth ?? existing.Birth.Month,
            request.Profile.BirthDay ?? existing.Birth.Day);
        if (birthDateError is not null)
        {
            _logger.LogWarning("Rejected profile edit for {PersonId}: {Reason}", request.Id, birthDateError);
            throw new ValidationException(new[] { new ValidationFailure("Profile.BirthDate", birthDateError) });
        }

        var deathDateError = ProfileDate.Validate(
            request.Profile.DeathYear ?? existing.Death?.Year,
            request.Profile.DeathMonth ?? existing.Death?.Month,
            request.Profile.DeathDay ?? existing.Death?.Day);
        if (deathDateError is not null)
        {
            _logger.LogWarning("Rejected profile edit for {PersonId}: {Reason}", request.Id, deathDateError);
            throw new ValidationException(new[] { new ValidationFailure("Profile.DeathDate", deathDateError) });
        }
```

`ProfileDate` is in `FamilyTree.Domain`, already imported via `using FamilyTree.Domain;` at the top of the handler.

- [ ] **Step 7: Add integration tests for the endpoint**

Add to `tests/integration/FamilyTree.IntegrationTests/PeopleProfileEndpointsTests.cs`. First add a helper near `BirthYear`:

```csharp
    private static PersonProfileDto BirthDate(int year, int? month, int? day) =>
        new(null, null, null, null, year, month, day, null, null, null, null);
```

Then:

```csharp
    [Fact]
    public async Task PutProfile_WhenFullBirthDateValid_ShouldReturn200AndReflectInGraph()
    {
        var client = await SignedInAsync(FakeGoogleIdTokenValidator.EditorIdToken);

        var put = await client.PutAsJsonAsync("/api/people/p-0001/profile", BirthDate(1751, 5, 3));
        put.StatusCode.Should().Be(HttpStatusCode.OK);

        var person = await client.GetFromJsonAsync<PersonDto>("/api/people/p-0001");
        person!.Birth.Month.Should().Be(5);
        person.Birth.Day.Should().Be(3);
    }

    [Fact]
    public async Task PutProfile_WhenDayInvalidForMonth_ShouldReturn400()
    {
        var client = await SignedInAsync(FakeGoogleIdTokenValidator.EditorIdToken);

        // April has 30 days; p-0001 seed birth year is known (1750), so the effective date resolves.
        var response = await client.PutAsJsonAsync("/api/people/p-0001/profile", BirthDate(1750, 4, 31));

        response.StatusCode.Should().Be(HttpStatusCode.BadRequest);
    }

    [Fact]
    public async Task PutProfile_WhenDayWithoutMonth_ShouldReturn400()
    {
        var client = await SignedInAsync(FakeGoogleIdTokenValidator.EditorIdToken);

        var response = await client.PutAsJsonAsync("/api/people/p-0001/profile", BirthDate(1750, null, 3));

        response.StatusCode.Should().Be(HttpStatusCode.BadRequest);
    }
```

(Confirm `PersonDto.Birth` exposes `Month`/`Day` — `LifeEventDto` carries them. If the type name differs, match the existing `GetById_WhenPersonHasPortraitMedia` test's `PersonDto` usage.)

- [ ] **Step 8: Run all backend tests**

Run: `dotnet test`
Expected: all green (unit + integration).

- [ ] **Step 9: Commit**

```bash
git add src/backend/FamilyTree.Domain/ProfileDate.cs src/backend/FamilyTree.Application/People/UpdatePersonProfileValidator.cs src/backend/FamilyTree.Application/People/UpdatePersonProfileHandler.cs tests/unit/FamilyTree.UnitTests/Domain/ProfileDateTests.cs tests/unit/FamilyTree.UnitTests/Application/UpdatePersonProfileValidatorTests.cs tests/integration/FamilyTree.IntegrationTests/PeopleProfileEndpointsTests.cs
git commit -m "feat(members): validate effective profile dates (coherence + day-in-month)"
```

---

### Task 4: Frontend — profileDraft + PersonProfile date fields

**Files:**
- Modify: `src/frontend/src/api/profileApi.ts`
- Modify: `src/frontend/src/composables/profileDraft.ts`
- Test: `src/frontend/src/composables/profileDraft.spec.ts`

**Interfaces:**
- Produces: `PersonProfile` gains `birthMonth, birthDay, deathMonth, deathDay: number | null`. `ProfileField` adds `'birthMonth' | 'birthDay' | 'deathMonth' | 'deathDay'`. `ProfileDraft` adds the same four `number | null` fields. `seedDraft` reads them from `detail.birth.month/day` and `detail.death?.month/day`. `buildProfilePayload`/`isOverridden` treat them as scalars (existing `scalar()` path).

- [ ] **Step 1: Write the failing test**

Add to `src/frontend/src/composables/profileDraft.spec.ts`:

```ts
  it('seeds month and day from the effective detail', () => {
    const d = seedDraft(detail({
      birth: { year: 1901, month: 5, day: 3, approx: false, place: null },
      death: { year: 1980, month: 6, day: 12, approx: false, place: null }
    }));
    expect(d.birthMonth).toBe(5);
    expect(d.birthDay).toBe(3);
    expect(d.deathMonth).toBe(6);
    expect(d.deathDay).toBe(12);
  });

  it('a changed month becomes an override; untouched date fields stay null', () => {
    const d = seedDraft(detail());
    const orig = clone(d);
    d.birthMonth = 7;
    const payload = buildProfilePayload(emptyBase, d, orig, new Set());
    expect(payload.birthMonth).toBe(7);
    expect(payload.birthDay).toBeNull();
    expect(payload.deathMonth).toBeNull();
  });
```

(`emptyBase` must include the four new fields as `null`; update its literal in the spec's `emptyBase` const accordingly.)

- [ ] **Step 2: Run to verify it fails**

Run: `npm test -- --run src/composables/profileDraft.spec.ts`
Expected: FAIL — `d.birthMonth` is undefined / type error.

- [ ] **Step 3: Extend `PersonProfile`**

In `src/frontend/src/api/profileApi.ts`, add to the `PersonProfile` interface:

```ts
export interface PersonProfile {
  givenName: LocalizedText | null;
  surname: LocalizedText | null;
  maidenName: LocalizedText | null;
  sex: string | null;
  birthYear: number | null;
  birthMonth: number | null;
  birthDay: number | null;
  deathYear: number | null;
  deathMonth: number | null;
  deathDay: number | null;
  vocation: string | null;
}
```

- [ ] **Step 4: Extend `profileDraft.ts`**

In `src/frontend/src/composables/profileDraft.ts`:

Add to `ProfileField`:

```ts
export type ProfileField =
  | 'givenName' | 'surname' | 'maidenName' | 'sex'
  | 'birthYear' | 'birthMonth' | 'birthDay'
  | 'deathYear' | 'deathMonth' | 'deathDay'
  | 'vocation';
```

Add to `ProfileDraft`:

```ts
export interface ProfileDraft {
  givenName: LocalizedText;
  surname: LocalizedText;
  maidenName: LocalizedText;
  sex: string;
  birthYear: number | null;
  birthMonth: number | null;
  birthDay: number | null;
  deathYear: number | null;
  deathMonth: number | null;
  deathDay: number | null;
  vocation: string;
}
```

In `seedDraft`, add the four fields:

```ts
  return {
    givenName: seedName(detail.givenName),
    surname: seedName(detail.surname),
    maidenName: seedName(detail.maidenName),
    sex: detail.sex,
    birthYear: detail.birth?.year ?? null,
    birthMonth: detail.birth?.month ?? null,
    birthDay: detail.birth?.day ?? null,
    deathYear: detail.death?.year ?? null,
    deathMonth: detail.death?.month ?? null,
    deathDay: detail.death?.day ?? null,
    vocation: detail.vocation
  };
```

In `buildProfilePayload`, add the four to the returned object using the existing `scalar()` helper:

```ts
  return {
    givenName: name('givenName'),
    surname: name('surname'),
    maidenName: name('maidenName'),
    sex: scalar('sex', draft.sex, original.sex, base.sex),
    birthYear: scalar('birthYear', draft.birthYear, original.birthYear, base.birthYear),
    birthMonth: scalar('birthMonth', draft.birthMonth, original.birthMonth, base.birthMonth),
    birthDay: scalar('birthDay', draft.birthDay, original.birthDay, base.birthDay),
    deathYear: scalar('deathYear', draft.deathYear, original.deathYear, base.deathYear),
    deathMonth: scalar('deathMonth', draft.deathMonth, original.deathMonth, base.deathMonth),
    deathDay: scalar('deathDay', draft.deathDay, original.deathDay, base.deathDay),
    vocation: scalar('vocation', draft.vocation, original.vocation, base.vocation)
  };
```

`isOverridden` already handles any non-name field as a scalar (non-null check) — no change needed.

- [ ] **Step 5: Run to verify it passes**

Run: `npm test -- --run src/composables/profileDraft.spec.ts`
Expected: PASS. Then `npm run build` — expected: clean (the `PersonProfile` literal in `MemberFieldsEditor.vue`'s `base` ref and in specs may now be missing fields → fix any type error by adding the four `null`s; if the build flags them, that's expected and handled in Task 5).

Note: `MemberFieldsEditor.vue` initialises `base` with a `PersonProfile` literal — after this task that literal is missing the four fields and **will fail the build**. That's fine; Task 5 updates it. To keep Task 4 independently green, update that one literal now (add `birthMonth: null, birthDay: null, deathMonth: null, deathDay: null`) as part of this task.

- [ ] **Step 6: Commit**

```bash
git add src/frontend/src/api/profileApi.ts src/frontend/src/composables/profileDraft.ts src/frontend/src/composables/profileDraft.spec.ts src/frontend/src/components/MemberFieldsEditor.vue
git commit -m "feat(members): extend profile draft/payload with month + day"
```

---

### Task 5: Frontend — MemberFieldsEditor date inputs

**Files:**
- Modify: `src/frontend/src/components/MemberFieldsEditor.vue`
- Modify: `src/frontend/src/i18n/messages/{en,ru,be}.ts`
- Test: `src/frontend/src/components/MemberFieldsEditor.spec.ts`

**Interfaces:**
- Consumes: `ProfileDraft` date fields + `buildProfilePayload`/`isOverridden` (Task 4).
- Produces: birth/death rows render `field-birthYear/birthMonth/birthDay` and `field-deathYear/deathMonth/deathDay` inputs; per-event reset controls `revert-birth`/`revert-death`.

- [ ] **Step 1: Add i18n keys (all three locales)**

In each of `src/frontend/src/i18n/messages/{en,ru,be}.ts`, inside the `members.field` object add `year`, `month`, `day`:

- `en.ts`: `year: 'Year', month: 'Month', day: 'Day'`
- `ru.ts`: `year: 'Год', month: 'Месяц', day: 'День'`
- `be.ts`: `year: 'Год', month: 'Месяц', day: 'Дзень'`

- [ ] **Step 2: Write the failing test**

Add to `src/frontend/src/components/MemberFieldsEditor.spec.ts`:

```ts
  it('edits the full birth date and submits year, month, and day', async () => {
    const wrapper = await mountEditor();
    vi.mocked(putProfile).mockResolvedValue(detail());
    await wrapper.get('[data-test="field-birthYear"]').setValue('1902');
    await wrapper.get('[data-test="field-birthMonth"]').setValue('7');
    await wrapper.get('[data-test="field-birthDay"]').setValue('9');
    await wrapper.get('[data-test="fields-save"]').trigger('click');
    await flushPromises();
    expect(putProfile).toHaveBeenCalledWith('p-1', expect.objectContaining({
      birthYear: 1902, birthMonth: 7, birthDay: 9
    }));
  });

  it('month and day are disabled until the higher unit is present, and clearing the year cascades', async () => {
    const wrapper = await mountEditor(emptyProfile, detail({
      birth: { year: null, month: null, day: null, approx: false, place: null }
    }));
    expect((wrapper.get('[data-test="field-birthMonth"]').element as HTMLInputElement).disabled).toBe(true);
    await wrapper.get('[data-test="field-birthYear"]').setValue('1901');
    expect((wrapper.get('[data-test="field-birthMonth"]').element as HTMLInputElement).disabled).toBe(false);
    await wrapper.get('[data-test="field-birthMonth"]').setValue('5');
    expect((wrapper.get('[data-test="field-birthDay"]').element as HTMLInputElement).disabled).toBe(false);
    await wrapper.get('[data-test="field-birthDay"]').setValue('3');
    // Clearing the year cascades month + day back to empty.
    await wrapper.get('[data-test="field-birthYear"]').setValue('');
    expect((wrapper.get('[data-test="field-birthMonth"]').element as HTMLInputElement).value).toBe('');
    expect((wrapper.get('[data-test="field-birthDay"]').element as HTMLInputElement).value).toBe('');
  });

  it('per-event reset clears the whole birth date override', async () => {
    const wrapper = await mountEditor({ ...emptyProfile, birthYear: 1901, birthMonth: 5, birthDay: 3 });
    vi.mocked(putProfile).mockResolvedValue(detail());
    expect(wrapper.find('[data-test="revert-birth"]').exists()).toBe(true);
    await wrapper.get('[data-test="revert-birth"]').trigger('click');
    await wrapper.get('[data-test="fields-save"]').trigger('click');
    await flushPromises();
    expect(putProfile).toHaveBeenCalledWith('p-1', expect.objectContaining({
      birthYear: null, birthMonth: null, birthDay: null
    }));
  });
```

- [ ] **Step 3: Run to verify it fails**

Run: `npm test -- --run src/components/MemberFieldsEditor.spec.ts`
Expected: FAIL — `field-birthMonth` / `revert-birth` don't exist.

- [ ] **Step 4: Update the component script**

In `src/frontend/src/components/MemberFieldsEditor.vue`, replace the two single-field `yearModel`/`birthYear`/`deathYear` definitions with a cascading numeric model and per-event reset helpers. Replace the block from `// Numeric inputs bind through a string proxy…` through `const deathYear = yearModel('deathYear');` with:

```ts
// Numeric proxy: empty string ↔ null (never NaN). Clearing a unit cascades to the
// lower units so a submitted date is always coherent (day needs month needs year).
function numberModel(field: 'birthYear' | 'birthMonth' | 'birthDay' | 'deathYear' | 'deathMonth' | 'deathDay', lower: ProfileField[]) {
  return computed<string>({
    get: () => (draft[field] == null ? '' : String(draft[field])),
    set: (v: string) => {
      const n = parseInt(v, 10);
      draft[field] = Number.isFinite(n) ? n : null;
      if (draft[field] == null) {
        for (const f of lower) {
          (draft as Record<ProfileField, unknown>)[f] = null;
        }
      }
    }
  });
}
const birthYear = numberModel('birthYear', ['birthMonth', 'birthDay']);
const birthMonth = numberModel('birthMonth', ['birthDay']);
const birthDay = numberModel('birthDay', []);
const deathYear = numberModel('deathYear', ['deathMonth', 'deathDay']);
const deathMonth = numberModel('deathMonth', ['deathDay']);
const deathDay = numberModel('deathDay', []);

// Reset a whole event's date (year+month+day) to the seed together.
const DATE_FIELDS: Record<'birth' | 'death', ProfileField[]> = {
  birth: ['birthYear', 'birthMonth', 'birthDay'],
  death: ['deathYear', 'deathMonth', 'deathDay']
};
function canResetDate(event: 'birth' | 'death'): boolean {
  return DATE_FIELDS[event].some(f => isOverridden(base.value, f));
}
function resetDate(event: 'birth' | 'death'): void {
  const fields = DATE_FIELDS[event];
  const anyReverted = fields.some(f => reverted.has(f));
  for (const f of fields) {
    if (anyReverted) {
      reverted.delete(f);
    } else {
      reverted.add(f);
    }
  }
}
```

(`ProfileField` is already imported from `../composables/profileDraft`.)

- [ ] **Step 5: Update the template — replace the birth and death tablets**

Replace the existing birth `<label>` and death `<label>` blocks with grouped date rows:

```vue
      <label class="fields-editor__field">
        <span class="fields-editor__label">
          {{ t('members.field.birth') }}
          <button v-if="canResetDate('birth')" type="button" class="fields-editor__revert" data-test="revert-birth" :title="t('members.revertHint')" :aria-label="t('members.revert')" @click="resetDate('birth')">↺</button>
        </span>
        <div class="fields-editor__date">
          <input v-model="birthYear" type="number" inputmode="numeric" class="fields-editor__input fields-editor__date-year" data-test="field-birthYear" :aria-label="t('members.field.year')" :disabled="reverted.has('birthYear')" :placeholder="t('members.field.year')" />
          <input v-model="birthMonth" type="number" inputmode="numeric" min="1" max="12" class="fields-editor__input fields-editor__date-part" data-test="field-birthMonth" :aria-label="t('members.field.month')" :disabled="reverted.has('birthYear') || draft.birthYear == null" :placeholder="t('members.field.month')" />
          <input v-model="birthDay" type="number" inputmode="numeric" min="1" max="31" class="fields-editor__input fields-editor__date-part" data-test="field-birthDay" :aria-label="t('members.field.day')" :disabled="reverted.has('birthYear') || draft.birthMonth == null" :placeholder="t('members.field.day')" />
        </div>
        <span v-if="errorFor('Profile.BirthDate')" class="fields-editor__field-error" data-test="error-birthDate">{{ errorFor('Profile.BirthDate') }}</span>
      </label>

      <label class="fields-editor__field">
        <span class="fields-editor__label">
          {{ t('members.field.death') }}
          <button v-if="canResetDate('death')" type="button" class="fields-editor__revert" data-test="revert-death" :title="t('members.revertHint')" :aria-label="t('members.revert')" @click="resetDate('death')">↺</button>
        </span>
        <div class="fields-editor__date">
          <input v-model="deathYear" type="number" inputmode="numeric" class="fields-editor__input fields-editor__date-year" data-test="field-deathYear" :aria-label="t('members.field.year')" :disabled="reverted.has('deathYear')" :placeholder="t('members.field.year')" />
          <input v-model="deathMonth" type="number" inputmode="numeric" min="1" max="12" class="fields-editor__input fields-editor__date-part" data-test="field-deathMonth" :aria-label="t('members.field.month')" :disabled="reverted.has('deathYear') || draft.deathYear == null" :placeholder="t('members.field.month')" />
          <input v-model="deathDay" type="number" inputmode="numeric" min="1" max="31" class="fields-editor__input fields-editor__date-part" data-test="field-deathDay" :aria-label="t('members.field.day')" :disabled="reverted.has('deathYear') || draft.deathMonth == null" :placeholder="t('members.field.day')" />
        </div>
        <span v-if="errorFor('Profile.DeathDate')" class="fields-editor__field-error" data-test="error-deathDate">{{ errorFor('Profile.DeathDate') }}</span>
      </label>
```

Note: the per-event reset toggles all three fields, so `reverted.has('birthYear')` on the month/day `:disabled` also disables them when the group is reset (they share the reset). Add a style for the date row:

```scss
.fields-editor__date { display: flex; gap: 8px; }
.fields-editor__date-year { flex: 1.4 1 0; }
.fields-editor__date-part { flex: 1 1 0; }
```

Remove the now-unused old birth/death single-input markup and the old `errorFor('Profile.BirthYear')`/`Profile.DeathYear` spans (year-range and cross-entity errors now surface via the form-level `error-form` line already present, and the new `error-birthDate` line).

- [ ] **Step 6: Run tests to verify they pass**

Run: `npm test -- --run src/components/MemberFieldsEditor.spec.ts src/i18n`
Expected: PASS (new date tests + existing + catalog parity). Then `npm run build` — expected clean.

- [ ] **Step 7: Commit**

```bash
git add src/frontend/src/components/MemberFieldsEditor.vue src/frontend/src/components/MemberFieldsEditor.spec.ts src/frontend/src/i18n/messages/en.ts src/frontend/src/i18n/messages/ru.ts src/frontend/src/i18n/messages/be.ts
git commit -m "feat(members): year/month/day date inputs with per-event reset"
```

---

### Task 6: Frontend — MemberDetail button placement + biography editing

**Files:**
- Modify: `src/frontend/src/components/MemberDetail.vue`
- Test: `src/frontend/src/components/MemberDetail.spec.ts`

**Interfaces:**
- Consumes: `BiographyEditor.vue` (`:person-id`, `:biography`, `@saved(detail)`, `@cancel`); existing `editor.edit`/`editor.add` i18n keys.
- Produces: the Edit-details button lives in the header top-right (`data-test="fields-edit"` unchanged); a biography edit toggle (`data-test="bio-edit"`) opens `BiographyEditor` in the biography section.

- [ ] **Step 1: Write the failing tests**

Add to the `describe('MemberDetail editing', …)` block in `src/frontend/src/components/MemberDetail.spec.ts`:

```ts
  it('renders the Edit details button in the header, separated from Find on tree', async () => {
    const { wrapper } = await mountDetail('p-1');
    useAuthStore().$patch({ canEdit: true });
    await wrapper.vm.$nextTick();
    const edit = wrapper.get('[data-test="fields-edit"]');
    // The edit button is a header action, not inside the centered name/heading block.
    expect(edit.element.closest('.member-detail__heading')).toBeNull();
    expect(wrapper.find('[data-test="find-on-tree"]').exists()).toBe(true);
  });

  it('opens the biography editor for an editor and closes it on save', async () => {
    const { wrapper } = await mountDetail('p-1');
    useAuthStore().$patch({ canEdit: true });
    await wrapper.vm.$nextTick();
    await wrapper.get('[data-test="bio-edit"]').trigger('click');
    const editor = wrapper.findComponent(BiographyEditor);
    expect(editor.exists()).toBe(true);
    await editor.vm.$emit('saved', detail({ biography: { ru: null, be: null, en: 'Edited life.' } }));
    await flushPromises();
    expect(wrapper.find('[data-test="bio-edit"]').exists()).toBe(true); // back to read mode
    expect(wrapper.get('.member-detail__bio-text').text()).toContain('Edited life.');
  });
```

Add the import at the top of the spec (BiographyEditor has no `name` option, so match it by the imported component, not a string name): `import BiographyEditor from './BiographyEditor.vue';`. `BiographyEditor` fetches nothing on mount, so no extra mock is needed.

- [ ] **Step 2: Run to verify it fails**

Run: `npm test -- --run src/components/MemberDetail.spec.ts`
Expected: FAIL — Edit button still inside `.member-detail__heading`; no `bio-edit`.

- [ ] **Step 3: Move the Edit button to the header top-right**

In `src/frontend/src/components/MemberDetail.vue`, remove the `member-detail__edit` button from inside `member-detail__heading` and place it as a header-level action. Change the `<header>` to position an absolute top-right action:

```vue
      <header class="member-detail__header">
        <button
          v-if="canEdit && !editing"
          type="button"
          class="member-detail__edit"
          data-test="fields-edit"
          @click="editing = true"
        >
          <span class="member-detail__edit-icon" aria-hidden="true">✎</span>
          {{ t('members.editProfile') }}
        </button>
        <div class="member-detail__portrait-frame">
          <!-- …unchanged… -->
        </div>
        <div class="member-detail__heading">
          <h2 class="member-detail__name">{{ fullName }}</h2>
          <p v-if="maidenName" class="member-detail__maiden">{{ t('person.nee') }} {{ maidenName }}</p>
          <p class="member-detail__life">{{ lifespan }}</p>
          <button type="button" class="member-detail__find" data-test="find-on-tree" @click="findOnTree">
            <span class="member-detail__find-icon" aria-hidden="true">⌖</span>
            {{ t('members.findOnTree') }}
          </button>
        </div>
      </header>
```

Add styles (tokens only):

```scss
.member-detail__header { position: relative; }
.member-detail__edit {
  position: absolute; top: 0; right: 0; z-index: 1;
  display: inline-flex; align-items: center; gap: 6px;
  padding: 7px 14px; font-family: var(--font-display); font-size: 14px;
  color: var(--ink); background: var(--surface-card);
  border: 1px solid var(--gilt); border-radius: 999px; cursor: pointer;
  &:hover { background: var(--control-hover); }
  &:focus-visible { outline: 2px solid var(--gilt); outline-offset: 2px; }
}
.member-detail__edit-icon { font-size: 15px; }
```

(Remove the old `.member-detail__edit { background: … }` rule from Task-5-of-cut-1b if present, replaced by the above.)

- [ ] **Step 4: Wire BiographyEditor into the biography section**

Add the import and a biography editing flag in `<script setup>`:

```ts
import BiographyEditor from './BiographyEditor.vue';
```
```ts
const editingBio = ref(false);
watch(() => props.personId, () => { editingBio.value = false; });
function onBioSaved(updated: PersonDetail): void {
  detail.value = updated;
  editingBio.value = false;
}
```

Replace the read-only biography section with an editable one. Find the biography `<section>` (`.member-detail__bio`) and change it so editors get an edit toggle + inline editor. It currently renders only when `hasBiography`. Make the section render when `hasBiography || canEdit`:

```vue
      <div class="member-detail__columns">
        <section v-if="hasBiography || canEdit" class="member-detail__panel member-detail__bio">
          <div class="member-detail__panel-head">
            <h3 class="member-detail__panel-title">{{ t('members.biography') }}</h3>
            <button
              v-if="canEdit && !editingBio"
              type="button"
              class="member-detail__bio-edit"
              data-test="bio-edit"
              :aria-label="hasBiography ? t('editor.edit') : t('editor.add')"
              @click="editingBio = true"
            >✎</button>
          </div>
          <BiographyEditor
            v-if="editingBio"
            :person-id="detail.id"
            :biography="detail.biography"
            @saved="onBioSaved"
            @cancel="editingBio = false"
          />
          <p v-else-if="hasBiography" class="member-detail__bio-text">{{ biographyText }}</p>
          <p v-else class="member-detail__bio-empty">{{ t('editor.empty') }}</p>
        </section>

        <!-- …residences section unchanged… -->
      </div>
```

Add styles:

```scss
.member-detail__panel-head { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
.member-detail__panel-head .member-detail__panel-title { margin: 0; }
.member-detail__bio-edit {
  flex: 0 0 auto; width: 28px; height: 28px; border-radius: 50%; cursor: pointer;
  border: 1px solid var(--gilt); background: var(--surface-card); color: var(--gilt-deep);
  display: grid; place-items: center;
  &:hover { background: var(--control-hover); }
  &:focus-visible { outline: 2px solid var(--gilt); outline-offset: 2px; }
}
.member-detail__bio-empty { margin: 0; font-style: italic; color: var(--ink-soft); }
```

(Ensure `ref`/`watch` are imported — they already are in this file.)

- [ ] **Step 5: Run tests to verify they pass**

Run: `npm test -- --run src/components/MemberDetail.spec.ts`
Expected: PASS (existing + 2 new). Then `npm run build` — expected clean.

- [ ] **Step 6: Commit**

```bash
git add src/frontend/src/components/MemberDetail.vue src/frontend/src/components/MemberDetail.spec.ts
git commit -m "feat(members): header-top-right edit button + biography editor in the dossier"
```

---

### Task 7: Docs, full verification, and dogfood

**Files:**
- Modify: `docs/reference/features/search-and-navigation.md`, `docs/reference/features/backend-api.md`, `docs/reference/roadmap.md`, `docs/reference/testing.md`

- [ ] **Step 1: Run the full suites + type-check**

Run: `dotnet test` (repo root); then from `src/frontend/`: `npm test -- --run` and `npm run build`.
Expected: all backend + frontend tests pass; `vue-tsc` build clean. Record the exact frontend spec-file/case counts for the docs.

- [ ] **Step 2: Update the reference docs**

- `search-and-navigation.md` (Dossier paragraph): the scalar editor now edits **full birth/death dates** (year + month + day, progressive; per-event reset); **biography is editable in the Members dossier** via `BiographyEditor` (own edit affordance on the Biography section); the **Edit details** button now lives in the dossier header's top-right, separate from Find-on-tree.
- `backend-api.md` (`PUT /api/people/{id}/profile`): the override now carries `birthMonth/birthDay/deathMonth/deathDay`; a **400** on `Profile.BirthDate`/`Profile.DeathDate` when a date is incoherent (day without month, month without year) or the day is invalid for the month/year.
- `roadmap.md`: note full-date editing + biography-in-Members shipped; residence/place editing (cut 1c) and add/remove (cut 2) still deferred.
- `testing.md`: bump the frontend counts and add the new cases (`ProfileDate`, snapshot month/day merge, endpoint date 400s, `profileDraft` month/day, editor date inputs + per-event reset, `MemberDetail` biography editor + button placement).

- [ ] **Step 3: Commit the docs**

```bash
git add docs/reference
git commit -m "docs(members): document full-date + biography editing and editor placement"
```

- [ ] **Step 4: Live dogfood (owner)**

Run `node scripts/dev.mjs --port 5174 --api-port 5038`, open `http://localhost:5174/members`, sign in, and verify: editing a full birth date (day+month+year) shows on the dossier and persists across reload; an invalid day (e.g. 31 April) shows the inline `error-birthDate`; the **Edit details** button sits top-right, clear of Find-on-tree; the **Biography** section has its own edit control that opens the tabbed editor and saves.

- [ ] **Step 5: Push and update the PR (or open one)**

This increment can extend the existing `claude/members-cut-1b` branch (PR #148) or its own branch — follow the controller's instruction. Do not self-merge.

---

## Self-Review

**Spec coverage** (against the "Cut 1b.1" spec section):
- Full birth/death dates (day+month): Task 1 (fields), Task 2 (merge), Task 3 (validation), Task 4 (draft/payload), Task 5 (UI). ✓
- Override model unchanged (null = inherit; Mapster auto-map): Task 1. ✓
- `approx`/`place` not editable: merge (Task 2) leaves them from seed; no UI. ✓
- Validation split (coarse validator + effective handler check; day→month→year; day-in-month; leap-year fallback): Task 3. ✓
- Biography editing in Members (reuse `BiographyEditor`, own affordance, no backend change): Task 6. ✓
- Edit-details button to header top-right, separated from Find-on-tree: Task 6. ✓
- Theme tokens only / i18n parity (year/month/day keys): Task 5. ✓
- Store patch unaffected (summary carries only years); dossier re-renders from merged detail: unchanged `onSaved` + `formatEventDate` — no task needed. ✓
- Docs: Task 7. ✓

**Placeholder scan:** No TBD/TODO. Task 2's test references matching the file's existing profile-merge test construction is an explicit instruction to mirror a concrete existing pattern, not a placeholder; the implementer reads that file first. Every code step shows complete code.

**Type consistency:** `PersonProfileDto` arity (11 params) is fixed in Task 1 and every positional call site is updated there; `PersonProfile` (frontend) gains the same four fields in Task 4 and `MemberFieldsEditor`'s `base` literal is updated in the same task; `ProfileField`/`ProfileDraft` names match across Tasks 4–5; `ProfileDate.Validate` signature matches between Task 3's helper and its handler call; `data-test` ids (`field-birthMonth`, `revert-birth`, `error-birthDate`, `bio-edit`) are consistent between the editor/detail templates and their specs.
