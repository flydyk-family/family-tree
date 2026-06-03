# Localization — Backend Data i18n Implementation Plan (Plan A)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the backend's Person free-text fields localizable (`ru`/`be`/`en`) via a `LocalizedText` value object, returned in all languages by the API so the frontend can switch instantly.

**Architecture:** Introduce a pure-domain `LocalizedText` value object (`{ Ru, Be, En }` + `Resolve(locale)` fallback) behind the existing repository interfaces, so the eventual JSON→DB swap stays Infrastructure-only. Convert the free-text Person fields (names, places, summary, biography) to `LocalizedText`; DTOs carry all three languages (`LocalizedTextDto`); Mapster maps 1:1; the JSON loader is structurally unchanged. Sample data and tests move to the localized shape.

**Tech Stack:** .NET 10, MediatR, FluentValidation, Mapster, System.Text.Json; xUnit + Moq + AwesomeAssertions (drop-in, namespace `FluentAssertions`). Central Package Management; per-project `GlobalUsings.cs` (`FamilyTree.Domain`, `FamilyTree.Application.Dtos`, etc. are global — code snippets show only file-specific usings).

**This is Plan A of two.** Plan B (separate) does the frontend: vue-i18n, the `useLocale` store, the `localize` helper, and the flag picker. This plan does **not** touch the frontend.

**Conventions:** file-scoped namespaces, sealed records, nullable enabled, `Async` suffix, always-brace. Run from repo root `C:\Users\perov\Code\My\family-tree`. Tests live in `tests/unit` and `tests/integration`.

---

## File Structure

```
Create:
  src/backend/FamilyTree.Domain/LocalizedText.cs                       value object
  src/backend/FamilyTree.Application/Dtos/LocalizedTextDto.cs          DTO mirror
  tests/unit/FamilyTree.UnitTests/Domain/LocalizedTextTests.cs        Resolve tests

Modify (domain → localized):
  src/backend/FamilyTree.Domain/Person.cs                              names/summary/bio → LocalizedText
  src/backend/FamilyTree.Domain/LifeEvent.cs                           Place → LocalizedText?
  src/backend/FamilyTree.Domain/Residence.cs                           Place → LocalizedText

Modify (DTOs + mapping):
  src/backend/FamilyTree.Application/Dtos/PersonDto.cs
  src/backend/FamilyTree.Application/Dtos/PersonSummaryDto.cs
  src/backend/FamilyTree.Application/Dtos/LifeEventDto.cs
  src/backend/FamilyTree.Application/Dtos/ResidenceDto.cs
  src/backend/FamilyTree.Application/Mapping/MappingConfig.cs          + LocalizedText→LocalizedTextDto

Modify (unit tests → localized shape):
  tests/unit/FamilyTree.UnitTests/Domain/PersonTests.cs
  tests/unit/FamilyTree.UnitTests/Infrastructure/JsonFamilyDataLoaderTests.cs
  tests/unit/FamilyTree.UnitTests/Infrastructure/InMemoryRepositoryTests.cs
  tests/unit/FamilyTree.UnitTests/Application/FamilyQueryServiceTests.cs
  tests/unit/FamilyTree.UnitTests/Application/HandlerTests.cs
  tests/unit/FamilyTree.UnitTests/Application/MappingConfigTests.cs

Modify (data + integration → localized shape):
  src/backend/FamilyTree.Api/Data/family.json
  tests/integration/FamilyTree.IntegrationTests/Fixtures/family.test.json
  tests/integration/FamilyTree.IntegrationTests/PeopleEndpointsTests.cs
  tests/integration/FamilyTree.IntegrationTests/FamilyEndpointsTests.cs
```

No new packages. The JSON loader, repositories, services, handlers, controllers, and validators are unchanged.

---

## Task 1: `LocalizedText` value object

**Files:**
- Create: `src/backend/FamilyTree.Domain/LocalizedText.cs`
- Test: `tests/unit/FamilyTree.UnitTests/Domain/LocalizedTextTests.cs`

- [ ] **Step 1: Write the failing test**

Create `tests/unit/FamilyTree.UnitTests/Domain/LocalizedTextTests.cs` (`Xunit`/`FluentAssertions` are global usings):

```csharp
using FamilyTree.Domain;

namespace FamilyTree.UnitTests.Domain;

public sealed class LocalizedTextTests
{
    [Theory]
    [InlineData("ru", "Тадеуш")]
    [InlineData("be", "Тадэвуш")]
    [InlineData("en", "Tadeusz")]
    public void Resolve_WhenLocaleHasValue_ShouldReturnThatLocale(string locale, string expected)
    {
        var text = new LocalizedText { Ru = "Тадеуш", Be = "Тадэвуш", En = "Tadeusz" };

        text.Resolve(locale).Should().Be(expected);
    }

    [Fact]
    public void Resolve_WhenRequestedLocaleMissing_ShouldFallBackToRussian()
    {
        var text = new LocalizedText { Ru = "Тадеуш", En = "Tadeusz" };

        text.Resolve("be").Should().Be("Тадеуш");
    }

    [Fact]
    public void Resolve_WhenRussianMissing_ShouldFallBackToEnglish()
    {
        var text = new LocalizedText { En = "Tadeusz" };

        text.Resolve("ru").Should().Be("Tadeusz");
    }

    [Fact]
    public void Resolve_WhenOnlyBelarusianPresent_ShouldReturnBelarusian()
    {
        var text = new LocalizedText { Be = "Тадэвуш" };

        text.Resolve("ru").Should().Be("Тадэвуш");
    }

    [Fact]
    public void Resolve_WhenAllEmpty_ShouldReturnNull()
    {
        new LocalizedText().Resolve("ru").Should().BeNull();
    }

    [Fact]
    public void Resolve_WhenUnknownLocale_ShouldUseFallbackChain()
    {
        new LocalizedText { Ru = "Тадеуш" }.Resolve("xx").Should().Be("Тадеуш");
    }
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `dotnet test tests/unit/FamilyTree.UnitTests --filter "FullyQualifiedName~LocalizedTextTests"`
Expected: FAIL — `LocalizedText` does not exist.

- [ ] **Step 3: Implement the value object**

Create `src/backend/FamilyTree.Domain/LocalizedText.cs`:

```csharp
namespace FamilyTree.Domain;

public sealed record LocalizedText
{
    public string? Ru { get; init; }
    public string? Be { get; init; }
    public string? En { get; init; }

    public string? Resolve(string locale)
    {
        var requested = locale switch
        {
            "ru" => Ru,
            "be" => Be,
            "en" => En,
            _ => null
        };

        return FirstNonEmpty(requested, Ru, En, Be);
    }

    private static string? FirstNonEmpty(params string?[] values)
    {
        foreach (var value in values)
        {
            if (!string.IsNullOrWhiteSpace(value))
            {
                return value;
            }
        }

        return null;
    }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `dotnet test tests/unit/FamilyTree.UnitTests --filter "FullyQualifiedName~LocalizedTextTests"`
Expected: PASS (8 cases — 3 theory + 5 facts).

- [ ] **Step 5: Commit**

```bash
git add src/backend/FamilyTree.Domain/LocalizedText.cs tests/unit/FamilyTree.UnitTests/Domain/LocalizedTextTests.cs
git commit -m "$(cat <<'EOF'
feat(domain): add LocalizedText value object with locale fallback

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: Localize domain model, DTOs, mapping, and unit tests

This is one cohesive conversion: change the model + DTOs + mapping together so the solution compiles, and update every unit test that constructs or asserts those fields. **The integration tests will go red after this task** (their fixture + the API sample data are still the old string shape) — that's expected and fixed in Task 3. Verify the **unit** suite only at the end of this task.

**Files:** see the lists below.

- [ ] **Step 1: Convert the domain models**

Replace `src/backend/FamilyTree.Domain/Person.cs`:

```csharp
namespace FamilyTree.Domain;

public sealed record Person
{
    public required string Id { get; init; }
    public required LocalizedText GivenName { get; init; }
    public required LocalizedText Surname { get; init; }
    public LocalizedText? MaidenName { get; init; }
    public Sex Sex { get; init; }
    public required LifeEvent Birth { get; init; }
    public LifeEvent? Death { get; init; }
    public Vocation Vocation { get; init; }
    public LocalizedText? Summary { get; init; }
    public LocalizedText? Biography { get; init; }
    public string? Portrait { get; init; }
    public IReadOnlyList<string> Gallery { get; init; } = [];
    public IReadOnlyList<SocialLink> Links { get; init; } = [];
    public IReadOnlyList<Residence> Residences { get; init; } = [];
    public Parents Parents { get; init; } = new();
    public bool MarriedIntoFamily { get; init; }
    public bool IsDefaultRoot { get; init; }
}
```

Replace `src/backend/FamilyTree.Domain/LifeEvent.cs`:

```csharp
namespace FamilyTree.Domain;

public sealed record LifeEvent
{
    public int? Year { get; init; }
    public int? Month { get; init; }
    public int? Day { get; init; }
    public bool Approx { get; init; }
    public LocalizedText? Place { get; init; }
}
```

Replace `src/backend/FamilyTree.Domain/Residence.cs`:

```csharp
namespace FamilyTree.Domain;

public sealed record Residence
{
    public required LocalizedText Place { get; init; }
    public int? FromYear { get; init; }
    public int? ToYear { get; init; }
    public string? MapUrl { get; init; }
}
```

- [ ] **Step 2: Add `LocalizedTextDto` and convert the DTOs**

Create `src/backend/FamilyTree.Application/Dtos/LocalizedTextDto.cs`:

```csharp
namespace FamilyTree.Application.Dtos;

public sealed record LocalizedTextDto(string? Ru, string? Be, string? En);
```

Replace `src/backend/FamilyTree.Application/Dtos/PersonDto.cs`:

```csharp
namespace FamilyTree.Application.Dtos;

public sealed record PersonDto(
    string Id,
    LocalizedTextDto GivenName,
    LocalizedTextDto Surname,
    LocalizedTextDto? MaidenName,
    string Sex,
    LifeEventDto Birth,
    LifeEventDto? Death,
    string Vocation,
    LocalizedTextDto? Summary,
    LocalizedTextDto? Biography,
    string? Portrait,
    IReadOnlyList<string> Gallery,
    IReadOnlyList<SocialLinkDto> Links,
    IReadOnlyList<ResidenceDto> Residences,
    ParentsDto Parents,
    bool MarriedIntoFamily,
    bool IsDefaultRoot);
```

Replace `src/backend/FamilyTree.Application/Dtos/PersonSummaryDto.cs`:

```csharp
namespace FamilyTree.Application.Dtos;

public sealed record PersonSummaryDto(
    string Id,
    LocalizedTextDto GivenName,
    LocalizedTextDto Surname,
    LocalizedTextDto? MaidenName,
    string Sex,
    int? BirthYear,
    int? DeathYear,
    string Vocation,
    string? Portrait,
    ParentsDto Parents,
    bool MarriedIntoFamily,
    bool IsDefaultRoot);
```

Replace `src/backend/FamilyTree.Application/Dtos/LifeEventDto.cs`:

```csharp
namespace FamilyTree.Application.Dtos;

public sealed record LifeEventDto(int? Year, int? Month, int? Day, bool Approx, LocalizedTextDto? Place);
```

Replace `src/backend/FamilyTree.Application/Dtos/ResidenceDto.cs`:

```csharp
namespace FamilyTree.Application.Dtos;

public sealed record ResidenceDto(LocalizedTextDto Place, int? FromYear, int? ToYear, string? MapUrl);
```

- [ ] **Step 3: Register the `LocalizedText` mapping**

In `src/backend/FamilyTree.Application/Mapping/MappingConfig.cs`, add the `LocalizedText → LocalizedTextDto` config alongside the others (the existing `Person → PersonSummaryDto`/`PersonDto` configs map the localized fields by name automatically once this is registered). Insert it as the first `NewConfig` in `Register`:

```csharp
        config.NewConfig<LocalizedText, LocalizedTextDto>();
```

So the method body becomes:

```csharp
    public static void Register(TypeAdapterConfig config)
    {
        config.NewConfig<LocalizedText, LocalizedTextDto>();

        config.NewConfig<Person, PersonSummaryDto>()
            .Map(dest => dest.Sex, src => src.Sex.ToString().ToLowerInvariant())
            .Map(dest => dest.Vocation, src => src.Vocation.ToString().ToLowerInvariant())
            .Map(dest => dest.BirthYear, src => src.Birth.Year)
            .Map(dest => dest.DeathYear, src => src.Death == null ? (int?)null : src.Death.Year);

        config.NewConfig<Person, PersonDto>()
            .Map(dest => dest.Sex, src => src.Sex.ToString().ToLowerInvariant())
            .Map(dest => dest.Vocation, src => src.Vocation.ToString().ToLowerInvariant());

        config.NewConfig<LifeEvent, LifeEventDto>();
        config.NewConfig<Residence, ResidenceDto>();
        config.NewConfig<SocialLink, SocialLinkDto>();
        config.NewConfig<Parents, ParentsDto>();
        config.NewConfig<Union, UnionDto>();
        config.NewConfig<FamilyGraph, FamilyGraphDto>();
    }
```

- [ ] **Step 4: Update the unit tests that construct domain objects**

Replace the constructor in `tests/unit/FamilyTree.UnitTests/Domain/PersonTests.cs` (Step body only — keep the assertions):

```csharp
        var person = new Person
        {
            Id = "p-0001",
            GivenName = new LocalizedText { Ru = "Анна" },
            Surname = new LocalizedText { Ru = "Ковальская" },
            Birth = new LifeEvent { Year = 1842 }
        };
```

Replace the `BuildStore` people list in `tests/unit/FamilyTree.UnitTests/Infrastructure/InMemoryRepositoryTests.cs`, and the name assertion:

```csharp
        var people = new List<Person>
        {
            new() { Id = "p-0001", GivenName = new LocalizedText { Ru = "Ян", En = "Jan" }, Surname = new LocalizedText { Ru = "Ковальский", En = "Kowalski" }, Birth = new LifeEvent { Year = 1750 } },
            new() { Id = "p-0002", GivenName = new LocalizedText { Ru = "Анна", En = "Anna" }, Surname = new LocalizedText { Ru = "Ковальская", En = "Kowalska" }, Birth = new LifeEvent { Year = 1755 } }
        };
```

and change the assertion in `GetByIdAsync_WhenIdExists_ShouldReturnMatchingPerson`:

```csharp
        result!.GivenName.Resolve("en").Should().Be("Anna");
```

Replace the `NewPerson` helper in `tests/unit/FamilyTree.UnitTests/Application/FamilyQueryServiceTests.cs`:

```csharp
    private static Person NewPerson(string id) =>
        new()
        {
            Id = id,
            GivenName = new LocalizedText { Ru = "Тест" },
            Surname = new LocalizedText { Ru = "Персона" },
            Birth = new LifeEvent { Year = 1800 }
        };
```

Replace the `NewPerson` helper in `tests/unit/FamilyTree.UnitTests/Application/HandlerTests.cs` (the `Sex`/`Vocation` assertions in that file stay — they're still strings):

```csharp
    private static Person NewPerson(string id) => new()
    {
        Id = id,
        GivenName = new LocalizedText { Ru = "Анна", En = "Anna" },
        Surname = new LocalizedText { Ru = "Ковальская", En = "Kowalska" },
        Sex = Sex.Female,
        Vocation = Vocation.Teacher,
        Birth = new LifeEvent { Year = 1842 }
    };
```

- [ ] **Step 5: Update the mapping test (construction + localized assertions)**

In `tests/unit/FamilyTree.UnitTests/Application/MappingConfigTests.cs`, replace `SamplePerson`:

```csharp
    private static Person SamplePerson() => new()
    {
        Id = "p-0001",
        GivenName = new LocalizedText { Ru = "Анна", En = "Anna" },
        Surname = new LocalizedText { Ru = "Ковальская", En = "Kowalska" },
        MaidenName = new LocalizedText { Ru = "Новак", En = "Nowak" },
        Sex = Sex.Female,
        Birth = new LifeEvent { Year = 1842, Place = new LocalizedText { Ru = "Краков", En = "Kraków" } },
        Death = new LifeEvent { Year = 1910, Approx = true },
        Vocation = Vocation.Teacher,
        Portrait = "p-0001.jpg",
        Residences = [new Residence { Place = new LocalizedText { Ru = "Вильнюс", En = "Vilnius" }, MapUrl = "https://maps.google.com/x" }],
        Links = [new SocialLink { Type = "facebook", Url = "https://fb.com/x" }],
        Parents = new Parents { MotherId = "p-0003", FatherId = "p-0004" },
        MarriedIntoFamily = true,
        IsDefaultRoot = true
    };
```

Update the two assertions that referenced string fields. In `Map_WhenPersonToSummary_...`, add localized assertions after the existing ones:

```csharp
        dto.GivenName.Ru.Should().Be("Анна");
        dto.GivenName.En.Should().Be("Anna");
        dto.Surname.En.Should().Be("Kowalska");
```

In `Map_WhenPersonToDetail_...`, replace the `dto.Birth.Place.Should().Be("Kraków")` line with the localized form and add a name check:

```csharp
        dto.GivenName.Ru.Should().Be("Анна");
        dto.Birth.Place!.En.Should().Be("Kraków");
```

(The `dto.Sex`, `dto.Death!.Approx`, `dto.Residences ... MapUrl`, and `dto.Links ... Type` assertions stay unchanged.)

- [ ] **Step 6: Update the loader test JSON + assertions**

Replace the test body in `tests/unit/FamilyTree.UnitTests/Infrastructure/JsonFamilyDataLoaderTests.cs` (the `json` constant and the assertions) so the free-text fields are localized objects:

```csharp
        const string json = """
        {
          "people": [
            {
              "id": "p-0001",
              "givenName": { "ru": "Анна", "en": "Anna" },
              "surname": { "ru": "Ковальская", "en": "Kowalska" },
              "maidenName": { "ru": "Новак", "en": "Nowak" },
              "sex": "female",
              "birth": { "year": 1842, "month": 5, "approx": false, "place": { "ru": "Краков", "en": "Kraków" } },
              "death": { "year": 1910, "approx": true },
              "vocation": "teacher",
              "marriedIntoFamily": true,
              "isDefaultRoot": true,
              "residences": [
                { "place": { "ru": "Вильнюс", "en": "Vilnius" }, "fromYear": 1870, "toYear": 1885, "mapUrl": "https://maps.google.com/x" }
              ],
              "links": [ { "type": "facebook", "url": "https://fb.com/x" } ],
              "parents": { "motherId": "p-0003", "fatherId": "p-0004" }
            }
          ],
          "unions": [
            { "id": "u-0001", "partnerIds": ["p-0001", "p-0002"], "marriageYear": 1865, "childIds": ["p-0010"] }
          ]
        }
        """;

        var graph = JsonFamilyDataLoader.Deserialize(json);

        graph.People.Should().ContainSingle();
        var person = graph.People[0];
        person.GivenName.Ru.Should().Be("Анна");
        person.GivenName.Resolve("en").Should().Be("Anna");
        person.Sex.Should().Be(Sex.Female);
        person.Vocation.Should().Be(Vocation.Teacher);
        person.Birth.Year.Should().Be(1842);
        person.Birth.Place!.Resolve("en").Should().Be("Kraków");
        person.Death!.Approx.Should().BeTrue();
        person.IsDefaultRoot.Should().BeTrue();
        person.Residences.Should().ContainSingle().Which.MapUrl.Should().Be("https://maps.google.com/x");
        person.Links.Should().ContainSingle().Which.Type.Should().Be("facebook");
        graph.Unions.Should().ContainSingle().Which.PartnerIds.Should().Equal("p-0001", "p-0002");
```

- [ ] **Step 7: Build and run the unit suite**

Run: `dotnet build` then `dotnet test tests/unit/FamilyTree.UnitTests`
Expected: build succeeds; **all unit tests pass**. (Do NOT run the integration suite yet — it is expected to fail until Task 3 localizes its data.)

- [ ] **Step 8: Commit**

```bash
git add src/backend tests/unit
git commit -m "$(cat <<'EOF'
feat(backend): localize Person free-text fields via LocalizedText

Names, places, summary and biography become LocalizedText; DTOs carry
all languages via LocalizedTextDto; Mapster maps 1:1. Unit tests moved
to the localized shape. (Integration data localized in the next task.)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: Localize the sample data and integration tests

Bring the API sample data and the integration fixture to the localized shape, update the endpoint assertions, and verify the full suite + a live request.

**Files:**
- Modify: `src/backend/FamilyTree.Api/Data/family.json`, `tests/integration/FamilyTree.IntegrationTests/Fixtures/family.test.json`, `PeopleEndpointsTests.cs`, `FamilyEndpointsTests.cs`

- [ ] **Step 1: Localize the integration fixture**

Replace `tests/integration/FamilyTree.IntegrationTests/Fixtures/family.test.json`:

```json
{
  "people": [
    {
      "id": "p-0001",
      "givenName": { "ru": "Ян", "be": "Ян", "en": "Jan" },
      "surname": { "ru": "Ковальский", "be": "Кавальскі", "en": "Kowalski" },
      "sex": "male",
      "birth": { "year": 1750, "approx": true },
      "vocation": "church", "marriedIntoFamily": false, "isDefaultRoot": true, "parents": {}
    },
    {
      "id": "p-0002",
      "givenName": { "ru": "Анна", "be": "Ганна", "en": "Anna" },
      "surname": { "ru": "Ковальская", "be": "Кавальская", "en": "Kowalska" },
      "maidenName": { "ru": "Новак", "en": "Nowak" },
      "sex": "female",
      "birth": { "year": 1755, "approx": true },
      "vocation": "other", "marriedIntoFamily": true, "isDefaultRoot": false, "parents": {}
    }
  ],
  "unions": [
    { "id": "u-0001", "partnerIds": ["p-0001", "p-0002"], "marriageYear": 1774, "childIds": [] }
  ]
}
```

- [ ] **Step 2: Update the integration endpoint assertions**

In `tests/integration/FamilyTree.IntegrationTests/PeopleEndpointsTests.cs`, change the two name/locale assertions in `GetById_WhenIdExists_ShouldReturnPerson` (the `Sex` line stays):

```csharp
        person!.Surname.Ru.Should().Be("Ковальский");
        person.Surname.En.Should().Be("Kowalski");
        person.Sex.Should().Be("male");
```

`FamilyEndpointsTests.cs` needs no change (it only checks counts and `PartnerIds`). The `GetAll`, 404, and 400 tests in `PeopleEndpointsTests.cs` are unchanged.

- [ ] **Step 3: Localize the API sample data**

Replace `src/backend/FamilyTree.Api/Data/family.json` with the localized dataset (Russian throughout, Belarusian + English on names/places; the fallback chain covers any gaps):

```json
{
  "people": [
    { "id": "p-0001", "givenName": { "ru": "Мацей", "be": "Мацей", "en": "Maciej" }, "surname": { "ru": "Ковальский", "be": "Кавальскі", "en": "Kowalski" }, "sex": "male",
      "birth": { "year": 1762, "approx": true, "place": { "ru": "Краков", "be": "Кракаў", "en": "Kraków" } }, "death": { "year": 1828, "approx": true },
      "vocation": "church", "marriedIntoFamily": false, "isDefaultRoot": false,
      "summary": { "ru": "Приходской кантор; основатель семейной хроники.", "en": "Parish cantor; founder of the family chronicle." }, "parents": {} },
    { "id": "p-0002", "givenName": { "ru": "Зофья", "be": "Зоф'я", "en": "Zofia" }, "surname": { "ru": "Ковальская", "be": "Кавальская", "en": "Kowalska" }, "maidenName": { "ru": "Левандовская", "en": "Lewandowska" }, "sex": "female",
      "birth": { "year": 1766, "approx": true }, "death": { "year": 1831, "approx": true },
      "vocation": "other", "marriedIntoFamily": true, "isDefaultRoot": false, "parents": {} },

    { "id": "p-0003", "givenName": { "ru": "Францишек", "be": "Францішак", "en": "Franciszek" }, "surname": { "ru": "Ковальский", "be": "Кавальскі", "en": "Kowalski" }, "sex": "male",
      "birth": { "year": 1788, "place": { "ru": "Краков", "be": "Кракаў", "en": "Kraków" } }, "death": { "year": 1851 },
      "vocation": "teacher", "marriedIntoFamily": false, "isDefaultRoot": false,
      "summary": { "ru": "Сельский учитель.", "en": "Village schoolteacher." }, "parents": { "motherId": "p-0002", "fatherId": "p-0001" } },
    { "id": "p-0004", "givenName": { "ru": "Хелена", "be": "Алена", "en": "Helena" }, "surname": { "ru": "Ковальская", "be": "Кавальская", "en": "Kowalska" }, "maidenName": { "ru": "Мазур", "en": "Mazur" }, "sex": "female",
      "birth": { "year": 1792, "approx": true }, "death": { "year": 1860 },
      "vocation": "other", "marriedIntoFamily": true, "isDefaultRoot": false, "parents": {} },

    { "id": "p-0005", "givenName": { "ru": "Юзеф", "be": "Юзаф", "en": "Józef" }, "surname": { "ru": "Ковальский", "be": "Кавальскі", "en": "Kowalski" }, "sex": "male",
      "birth": { "year": 1815, "place": { "ru": "Краков", "be": "Кракаў", "en": "Kraków" } }, "death": { "year": 1879 },
      "vocation": "writer", "marriedIntoFamily": false, "isDefaultRoot": false,
      "summary": { "ru": "Собирал народные сказки со всего края.", "en": "Wrote folk tales collected across the region." }, "parents": { "motherId": "p-0004", "fatherId": "p-0003" } },
    { "id": "p-0006", "givenName": { "ru": "Марианна", "be": "Марыяна", "en": "Marianna" }, "surname": { "ru": "Ковальская", "be": "Кавальская", "en": "Kowalska" }, "maidenName": { "ru": "Качмарек", "en": "Kaczmarek" }, "sex": "female",
      "birth": { "year": 1819, "approx": true }, "death": { "year": 1888 },
      "vocation": "other", "marriedIntoFamily": true, "isDefaultRoot": false, "parents": {} },

    { "id": "p-0007", "givenName": { "ru": "Винценты", "be": "Вінцэнт", "en": "Wincenty" }, "surname": { "ru": "Ковальский", "be": "Кавальскі", "en": "Kowalski" }, "sex": "male",
      "birth": { "year": 1842, "place": { "ru": "Вильнюс", "be": "Вільня", "en": "Vilnius" } }, "death": { "year": 1910 },
      "vocation": "office", "marriedIntoFamily": false, "isDefaultRoot": false,
      "residences": [ { "place": { "ru": "Вильнюс", "be": "Вільня", "en": "Vilnius" }, "fromYear": 1842, "toYear": 1910, "mapUrl": "https://maps.google.com/?q=Vilnius" } ],
      "parents": { "motherId": "p-0006", "fatherId": "p-0005" } },
    { "id": "p-0008", "givenName": { "ru": "Анеля", "be": "Анэля", "en": "Aniela" }, "surname": { "ru": "Ковальская", "be": "Кавальская", "en": "Kowalska" }, "maidenName": { "ru": "Вуйцик", "en": "Wójcik" }, "sex": "female",
      "birth": { "year": 1846, "approx": true }, "death": { "year": 1915 },
      "vocation": "other", "marriedIntoFamily": true, "isDefaultRoot": false, "parents": {} },

    { "id": "p-0009", "givenName": { "ru": "Станислав", "be": "Станіслаў", "en": "Stanisław" }, "surname": { "ru": "Ковальский", "be": "Кавальскі", "en": "Kowalski" }, "sex": "male",
      "birth": { "year": 1870, "place": { "ru": "Вильнюс", "be": "Вільня", "en": "Vilnius" } }, "death": { "year": 1944 },
      "vocation": "teacher", "marriedIntoFamily": false, "isDefaultRoot": false, "parents": { "motherId": "p-0008", "fatherId": "p-0007" } },
    { "id": "p-0010", "givenName": { "ru": "Янина", "be": "Яніна", "en": "Janina" }, "surname": { "ru": "Ковальская", "be": "Кавальская", "en": "Kowalska" }, "maidenName": { "ru": "Новак", "en": "Nowak" }, "sex": "female",
      "birth": { "year": 1874, "approx": true }, "death": { "year": 1951 },
      "vocation": "other", "marriedIntoFamily": true, "isDefaultRoot": false, "parents": {} },

    { "id": "p-0011", "givenName": { "ru": "Антоний", "be": "Антон", "en": "Antoni" }, "surname": { "ru": "Ковальский", "be": "Кавальскі", "en": "Kowalski" }, "sex": "male",
      "birth": { "year": 1900, "place": { "ru": "Варшава", "be": "Варшава", "en": "Warsaw" } }, "death": { "year": 1979 },
      "vocation": "church", "marriedIntoFamily": false, "isDefaultRoot": false, "parents": { "motherId": "p-0010", "fatherId": "p-0009" } },
    { "id": "p-0012", "givenName": { "ru": "Стефания", "be": "Стэфанія", "en": "Stefania" }, "surname": { "ru": "Ковальская", "be": "Кавальская", "en": "Kowalska" }, "maidenName": { "ru": "Зелинская", "en": "Zielińska" }, "sex": "female",
      "birth": { "year": 1904, "approx": true }, "death": { "year": 1985 },
      "vocation": "other", "marriedIntoFamily": true, "isDefaultRoot": false, "parents": {} },

    { "id": "p-0013", "givenName": { "ru": "Генрих", "be": "Генрых", "en": "Henryk" }, "surname": { "ru": "Ковальский", "be": "Кавальскі", "en": "Kowalski" }, "sex": "male",
      "birth": { "year": 1933, "place": { "ru": "Варшава", "be": "Варшава", "en": "Warsaw" } }, "death": { "year": 2008 },
      "vocation": "office", "marriedIntoFamily": false, "isDefaultRoot": false,
      "summary": { "ru": "Инженер-строитель; восстановил семейный дом после войны.", "en": "Civil engineer; rebuilt the family home after the war." }, "parents": { "motherId": "p-0012", "fatherId": "p-0011" } },

    { "id": "p-0034", "givenName": { "ru": "Игнаций", "be": "Ігнат", "en": "Ignacy" }, "surname": { "ru": "Мазурек", "be": "Мазурак", "en": "Mazurek" }, "sex": "male",
      "birth": { "year": 1878, "approx": true }, "death": { "year": 1944 },
      "vocation": "office", "marriedIntoFamily": false, "isDefaultRoot": false, "parents": {} },
    { "id": "p-0035", "givenName": { "ru": "Розалия", "be": "Разалія", "en": "Rozalia" }, "surname": { "ru": "Мазурек", "be": "Мазурак", "en": "Mazurek" }, "maidenName": { "ru": "Сикора", "en": "Sikora" }, "sex": "female",
      "birth": { "year": 1882, "approx": true }, "death": { "year": 1955 },
      "vocation": "other", "marriedIntoFamily": true, "isDefaultRoot": false, "parents": {} },

    { "id": "p-0030", "givenName": { "ru": "Владислав", "be": "Уладзіслаў", "en": "Władysław" }, "surname": { "ru": "Мазурек", "be": "Мазурак", "en": "Mazurek" }, "sex": "male",
      "birth": { "year": 1905, "place": { "ru": "Львов", "be": "Львоў", "en": "Lviv" } }, "death": { "year": 1981 },
      "vocation": "teacher", "marriedIntoFamily": false, "isDefaultRoot": false, "parents": { "motherId": "p-0035", "fatherId": "p-0034" } },
    { "id": "p-0031", "givenName": { "ru": "Ирена", "be": "Ірэна", "en": "Irena" }, "surname": { "ru": "Мазурек", "be": "Мазурак", "en": "Mazurek" }, "maidenName": { "ru": "Домбровская", "en": "Dąbrowska" }, "sex": "female",
      "birth": { "year": 1909, "approx": true }, "death": { "year": 1990 },
      "vocation": "other", "marriedIntoFamily": true, "isDefaultRoot": false, "parents": {} },

    { "id": "p-0014", "givenName": { "ru": "Кристина", "be": "Крысціна", "en": "Krystyna" }, "surname": { "ru": "Ковальская", "be": "Кавальская", "en": "Kowalska" }, "maidenName": { "ru": "Мазурек", "be": "Мазурак", "en": "Mazurek" }, "sex": "female",
      "birth": { "year": 1936, "place": { "ru": "Львов", "be": "Львоў", "en": "Lviv" } }, "death": { "year": 2015 },
      "vocation": "writer", "marriedIntoFamily": true, "isDefaultRoot": false,
      "summary": { "ru": "Поэтесса и учительница; вошла в семью Ковальских в 1958 году.", "en": "Poet and teacher; married into the Kowalski family in 1958." }, "parents": { "motherId": "p-0031", "fatherId": "p-0030" } },

    { "id": "p-0015", "givenName": { "ru": "Марек", "be": "Марак", "en": "Marek" }, "surname": { "ru": "Ковальский", "be": "Кавальскі", "en": "Kowalski" }, "sex": "male",
      "birth": { "year": 1959, "place": { "ru": "Варшава", "be": "Варшава", "en": "Warsaw" } },
      "vocation": "office", "marriedIntoFamily": false, "isDefaultRoot": false,
      "summary": { "ru": "Старший брат; бухгалтер.", "en": "Eldest brother; an accountant." }, "parents": { "motherId": "p-0014", "fatherId": "p-0013" } },
    { "id": "p-0016", "givenName": { "ru": "Тадеуш", "be": "Тадэвуш", "en": "Tadeusz" }, "surname": { "ru": "Ковальский", "be": "Кавальскі", "en": "Kowalski" }, "sex": "male",
      "birth": { "year": 1962, "month": 4, "place": { "ru": "Варшава", "be": "Варшава", "en": "Warsaw" } },
      "vocation": "teacher", "marriedIntoFamily": false, "isDefaultRoot": true,
      "summary": { "ru": "Нынешний центр древа; учитель истории.", "be": "Цяперашні цэнтр дрэва; настаўнік гісторыі.", "en": "The present-day focus of the tree; a history teacher." },
      "biography": { "ru": "Тадеуш — средний из трёх братьев. Учитель истории в Варшаве, он ведёт семейную хронику, начатую его предками.", "en": "Tadeusz is the middle of three brothers. A history teacher in Warsaw, he keeps the family chronicle his ancestors began." },
      "links": [ { "type": "facebook", "url": "https://facebook.com/example" }, { "type": "instagram", "url": "https://instagram.com/example" } ],
      "residences": [ { "place": { "ru": "Варшава", "be": "Варшава", "en": "Warsaw" }, "fromYear": 1962, "toYear": null, "mapUrl": "https://maps.google.com/?q=Warszawa" } ],
      "parents": { "motherId": "p-0014", "fatherId": "p-0013" } },
    { "id": "p-0017", "givenName": { "ru": "Пётр", "be": "Пётр", "en": "Piotr" }, "surname": { "ru": "Ковальский", "be": "Кавальскі", "en": "Kowalski" }, "sex": "male",
      "birth": { "year": 1965, "place": { "ru": "Варшава", "be": "Варшава", "en": "Warsaw" } },
      "vocation": "writer", "marriedIntoFamily": false, "isDefaultRoot": false,
      "summary": { "ru": "Младший брат; журналист.", "en": "Youngest brother; a journalist." }, "parents": { "motherId": "p-0014", "fatherId": "p-0013" } },

    { "id": "p-0018", "givenName": { "ru": "Эва", "be": "Эва", "en": "Ewa" }, "surname": { "ru": "Ковальская", "be": "Кавальская", "en": "Kowalska" }, "maidenName": { "ru": "Вишневская", "en": "Wiśniewska" }, "sex": "female",
      "birth": { "year": 1964 }, "vocation": "other", "marriedIntoFamily": true, "isDefaultRoot": false, "parents": {} },
    { "id": "p-0019", "givenName": { "ru": "Анна", "be": "Ганна", "en": "Anna" }, "surname": { "ru": "Ковальская", "be": "Кавальская", "en": "Kowalska" }, "sex": "female",
      "birth": { "year": 1991, "place": { "ru": "Варшава", "be": "Варшава", "en": "Warsaw" } }, "vocation": "office", "marriedIntoFamily": false, "isDefaultRoot": false,
      "parents": { "motherId": "p-0018", "fatherId": "p-0016" } },
    { "id": "p-0020", "givenName": { "ru": "Якуб", "be": "Якуб", "en": "Jakub" }, "surname": { "ru": "Ковальский", "be": "Кавальскі", "en": "Kowalski" }, "sex": "male",
      "birth": { "year": 1994, "place": { "ru": "Варшава", "be": "Варшава", "en": "Warsaw" } }, "vocation": "church", "marriedIntoFamily": false, "isDefaultRoot": false,
      "parents": { "motherId": "p-0018", "fatherId": "p-0016" } },

    { "id": "p-0021", "givenName": { "ru": "Мария", "be": "Марыя", "en": "Maria" }, "surname": { "ru": "Ковальская", "be": "Кавальская", "en": "Kowalska" }, "maidenName": { "ru": "Лис", "en": "Lis" }, "sex": "female",
      "birth": { "year": 1995 }, "vocation": "other", "marriedIntoFamily": true, "isDefaultRoot": false, "parents": {} },
    { "id": "p-0022", "givenName": { "ru": "Лена", "be": "Лена", "en": "Lena" }, "surname": { "ru": "Ковальская", "be": "Кавальская", "en": "Kowalska" }, "sex": "female",
      "birth": { "year": 2018, "place": { "ru": "Варшава", "be": "Варшава", "en": "Warsaw" } }, "vocation": "other", "marriedIntoFamily": false, "isDefaultRoot": false,
      "parents": { "motherId": "p-0021", "fatherId": "p-0020" } },
    { "id": "p-0023", "givenName": { "ru": "Шимон", "be": "Сымон", "en": "Szymon" }, "surname": { "ru": "Ковальский", "be": "Кавальскі", "en": "Kowalski" }, "sex": "male",
      "birth": { "year": 2021, "place": { "ru": "Варшава", "be": "Варшава", "en": "Warsaw" } }, "vocation": "other", "marriedIntoFamily": false, "isDefaultRoot": false,
      "parents": { "motherId": "p-0021", "fatherId": "p-0020" } },

    { "id": "p-0024", "givenName": { "ru": "Барбара", "be": "Барбара", "en": "Barbara" }, "surname": { "ru": "Ковальская", "be": "Кавальская", "en": "Kowalska" }, "maidenName": { "ru": "Ковальчик", "en": "Kowalczyk" }, "sex": "female",
      "birth": { "year": 1961 }, "vocation": "other", "marriedIntoFamily": true, "isDefaultRoot": false, "parents": {} },
    { "id": "p-0025", "givenName": { "ru": "Михал", "be": "Міхал", "en": "Michał" }, "surname": { "ru": "Ковальский", "be": "Кавальскі", "en": "Kowalski" }, "sex": "male",
      "birth": { "year": 1987, "place": { "ru": "Краков", "be": "Кракаў", "en": "Kraków" } }, "vocation": "office", "marriedIntoFamily": false, "isDefaultRoot": false,
      "parents": { "motherId": "p-0024", "fatherId": "p-0015" } },

    { "id": "p-0026", "givenName": { "ru": "Агнешка", "be": "Аґнешка", "en": "Agnieszka" }, "surname": { "ru": "Ковальская", "be": "Кавальская", "en": "Kowalska" }, "maidenName": { "ru": "Коваль", "en": "Kowal" }, "sex": "female",
      "birth": { "year": 1967 }, "vocation": "other", "marriedIntoFamily": true, "isDefaultRoot": false, "parents": {} },
    { "id": "p-0027", "givenName": { "ru": "Зузанна", "be": "Зузана", "en": "Zuzanna" }, "surname": { "ru": "Ковальская", "be": "Кавальская", "en": "Kowalska" }, "sex": "female",
      "birth": { "year": 1994, "place": { "ru": "Гданьск", "be": "Гданьск", "en": "Gdańsk" } }, "vocation": "writer", "marriedIntoFamily": false, "isDefaultRoot": false,
      "parents": { "motherId": "p-0026", "fatherId": "p-0017" } }
  ],
  "unions": [
    { "id": "u-0001", "partnerIds": ["p-0001", "p-0002"], "marriageYear": 1786, "childIds": ["p-0003"] },
    { "id": "u-0002", "partnerIds": ["p-0003", "p-0004"], "marriageYear": 1812, "childIds": ["p-0005"] },
    { "id": "u-0003", "partnerIds": ["p-0005", "p-0006"], "marriageYear": 1840, "childIds": ["p-0007"] },
    { "id": "u-0004", "partnerIds": ["p-0007", "p-0008"], "marriageYear": 1868, "childIds": ["p-0009"] },
    { "id": "u-0005", "partnerIds": ["p-0009", "p-0010"], "marriageYear": 1898, "childIds": ["p-0011"] },
    { "id": "u-0006", "partnerIds": ["p-0011", "p-0012"], "marriageYear": 1930, "childIds": ["p-0013"] },
    { "id": "u-0010", "partnerIds": ["p-0034", "p-0035"], "marriageYear": 1902, "childIds": ["p-0030"] },
    { "id": "u-0011", "partnerIds": ["p-0030", "p-0031"], "marriageYear": 1931, "childIds": ["p-0014"] },
    { "id": "u-0007", "partnerIds": ["p-0013", "p-0014"], "marriageYear": 1958, "childIds": ["p-0015", "p-0016", "p-0017"] },
    { "id": "u-0008", "partnerIds": ["p-0016", "p-0018"], "marriageYear": 1989, "childIds": ["p-0019", "p-0020"] },
    { "id": "u-0009", "partnerIds": ["p-0020", "p-0021"], "marriageYear": 2017, "childIds": ["p-0022", "p-0023"] },
    { "id": "u-0012", "partnerIds": ["p-0015", "p-0024"], "marriageYear": 1985, "childIds": ["p-0025"] },
    { "id": "u-0013", "partnerIds": ["p-0017", "p-0026"], "marriageYear": 1992, "childIds": ["p-0027"] }
  ]
}
```

- [ ] **Step 4: Run the full test suite**

Run: `dotnet test`
Expected: **all unit + integration tests pass** (the localized fixture + assertions now line up with the localized DTOs).

- [ ] **Step 5: Live smoke test**

Run: `dotnet run --project src/backend/FamilyTree.Api` (serves on `http://localhost:5037`). In another shell:
- `curl -s http://localhost:5037/api/family/graph` → JSON where each person's `givenName`/`surname` is an object like `{ "ru": "...", "be": "...", "en": "..." }`; 31 people, 13 unions.
- `curl -s http://localhost:5037/api/people/p-0016` → Tadeusz with localized `givenName` (`ru`/`be`/`en`), localized `summary`, and `isDefaultRoot: true`.
- `curl -i http://localhost:5037/api/people/bad-id` → `400`.
Then stop the host.

- [ ] **Step 6: Commit**

```bash
git add src/backend/FamilyTree.Api/Data/family.json tests/integration
git commit -m "$(cat <<'EOF'
feat(api): localize sample family data and integration fixture

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

---

## Final verification

- [ ] `dotnet test` → all green (unit + integration).
- [ ] `dotnet run --project src/backend/FamilyTree.Api` → `/api/family/graph` returns localized `{ru,be,en}` name objects; `/api/people/p-0016` returns Tadeusz with localized fields.
- [ ] **DTO contract for Plan B (frontend):** `LocalizedTextDto { ru, be, en }`; `PersonSummaryDto.givenName/surname/maidenName` and `PersonDto.givenName/surname/maidenName/summary/biography`, `LifeEventDto.place`, `ResidenceDto.place` are all `LocalizedTextDto`. The frontend `localize(...)` helper (Plan B) resolves these with the ru→en→any fallback.

---

## Plan self-review notes

- **Spec coverage (Plan A scope):** §3 of the spec (`LocalizedText`, localized Person free-text fields, `LocalizedTextDto`, Mapster, localized sample data, updated tests) → Tasks 1–3. §7 storage alignment is honored by keeping `LocalizedText` a pure domain value object behind the repositories (no persistence attributes) — no code change needed now, just the design rule.
- **Out of scope (Plan B — frontend):** vue-i18n, `useLocale` store, `localize` helper, flag picker, localized rendering. The `vocation`/`sex` enum *labels* are localized on the frontend (Plan B), not here — they remain enums in the API.
- **Type consistency:** `LocalizedText` (Task 1) is used across Domain (Task 2 Step 1), and `LocalizedTextDto` (Task 2 Step 2) is mapped from it (Task 2 Step 3) and asserted in the loader/mapping/integration tests (Tasks 2–3). All localized fields use the same `{ru,be,en}` shape in domain, DTO, and JSON.
- **Known intermediate red state:** after Task 2 the integration suite fails (its data is still string-shaped); Task 3 restores it. Task 2 verifies the **unit** suite only; Task 3 verifies the full suite. This is called out in Task 2's intro and Step 7.
- **No new packages**; loader/repos/services/handlers/controllers/validators unchanged (STJ deserializes the nested `{ru,be,en}` object into `LocalizedText` automatically via the existing Web options).
```
