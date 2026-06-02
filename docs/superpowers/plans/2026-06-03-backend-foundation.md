# Backend Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the read-only .NET 10 backend that loads a JSON family file into memory and exposes it over three HTTP endpoints (`GET /api/people`, `GET /api/people/{id}`, `GET /api/family/graph`), fully covered by unit and integration tests.

**Architecture:** Clean layering — `Domain` (models + repository interfaces), `Application` (MediatR queries/handlers that delegate to a query service, DTOs, Mapster mapping, FluentValidation), `Infrastructure` (JSON loader, in-memory store, repositories), `Api` (thin controllers, DI wiring, OpenAPI, CORS). Storage is hidden behind repository interfaces so a real database can replace the JSON store with no changes above the repository layer.

**Tech Stack:** .NET 10, ASP.NET Core Web API (controllers), MediatR 12.5.0 (last free/OSS version), FluentValidation 11.x, Mapster 7.x, System.Text.Json. Tests: xUnit, Moq, AwesomeAssertions (free FluentAssertions fork — drop-in, keeps the `FluentAssertions` namespace), Microsoft.AspNetCore.Mvc.Testing.

**Conventions (from CLAUDE.md):** file-scoped namespaces; `_camelCase` private fields; `I`-prefixed interfaces; `Async` suffix; `CancellationToken` last; nullable enabled; `var` when obvious; K&R braces; always brace control statements. Test names: `<Method>_When<Conditions>_Should<ExpectedResult>`.

---

## File Structure

```
FamilyTree.sln                                              (repo root)
src/backend/FamilyTree.Domain/                              pure models + repo interfaces
  Enums.cs  LifeEvent.cs  Residence.cs  SocialLink.cs  Parents.cs
  Person.cs  Union.cs  FamilyGraph.cs
  IPersonRepository.cs  IUnionRepository.cs
src/backend/FamilyTree.Application/
  Dtos/  (LifeEventDto, ResidenceDto, SocialLinkDto, ParentsDto, PersonSummaryDto, PersonDto, UnionDto, FamilyGraphDto)
  Abstractions/IFamilyQueryService.cs
  Services/FamilyQueryService.cs
  Mapping/MappingConfig.cs
  Behaviors/ValidationBehavior.cs
  People/  (GetAllPeopleQuery+Handler, GetPersonByIdQuery+Handler+Validator)
  Family/  (GetFamilyGraphQuery+Handler)
  ApplicationServiceCollectionExtensions.cs
src/backend/FamilyTree.Infrastructure/
  FamilyDataOptions.cs  IFamilyDataLoader.cs  JsonFamilyDataLoader.cs  FamilyFileModel.cs
  FamilyStore.cs  InMemoryPersonRepository.cs  InMemoryUnionRepository.cs
  InfrastructureServiceCollectionExtensions.cs
src/backend/FamilyTree.Api/
  Program.cs  appsettings.json
  Controllers/PeopleController.cs  Controllers/FamilyController.cs
  Data/family.json
tests/unit/FamilyTree.UnitTests/
  Infrastructure/  Application/  (test classes per component)
tests/integration/FamilyTree.IntegrationTests/
  FamilyApiFactory.cs  PeopleEndpointsTests.cs  FamilyEndpointsTests.cs
  Fixtures/family.test.json
```

---

## Task 1: Solution, projects, references, packages

**Files:** creates the solution and six projects; no application code yet.

- [ ] **Step 1: Create solution and projects**

Run from the repo root (`C:\Users\perov\Code\My\family-tree`):

```bash
dotnet new sln -n FamilyTree
dotnet new classlib -n FamilyTree.Domain -o src/backend/FamilyTree.Domain
dotnet new classlib -n FamilyTree.Application -o src/backend/FamilyTree.Application
dotnet new classlib -n FamilyTree.Infrastructure -o src/backend/FamilyTree.Infrastructure
dotnet new webapi --use-controllers -n FamilyTree.Api -o src/backend/FamilyTree.Api
dotnet new xunit -n FamilyTree.UnitTests -o tests/unit/FamilyTree.UnitTests
dotnet new xunit -n FamilyTree.IntegrationTests -o tests/integration/FamilyTree.IntegrationTests
```

- [ ] **Step 2: Add all projects to the solution**

```bash
dotnet sln add src/backend/FamilyTree.Domain/FamilyTree.Domain.csproj
dotnet sln add src/backend/FamilyTree.Application/FamilyTree.Application.csproj
dotnet sln add src/backend/FamilyTree.Infrastructure/FamilyTree.Infrastructure.csproj
dotnet sln add src/backend/FamilyTree.Api/FamilyTree.Api.csproj
dotnet sln add tests/unit/FamilyTree.UnitTests/FamilyTree.UnitTests.csproj
dotnet sln add tests/integration/FamilyTree.IntegrationTests/FamilyTree.IntegrationTests.csproj
```

- [ ] **Step 3: Wire project references**

```bash
dotnet add src/backend/FamilyTree.Application reference src/backend/FamilyTree.Domain
dotnet add src/backend/FamilyTree.Infrastructure reference src/backend/FamilyTree.Domain
dotnet add src/backend/FamilyTree.Api reference src/backend/FamilyTree.Application
dotnet add src/backend/FamilyTree.Api reference src/backend/FamilyTree.Infrastructure
dotnet add tests/unit/FamilyTree.UnitTests reference src/backend/FamilyTree.Domain
dotnet add tests/unit/FamilyTree.UnitTests reference src/backend/FamilyTree.Application
dotnet add tests/unit/FamilyTree.UnitTests reference src/backend/FamilyTree.Infrastructure
dotnet add tests/integration/FamilyTree.IntegrationTests reference src/backend/FamilyTree.Api
```

- [ ] **Step 4: Add NuGet packages**

```bash
# Application
dotnet add src/backend/FamilyTree.Application package MediatR --version 12.5.0
dotnet add src/backend/FamilyTree.Application package FluentValidation --version 11.11.0
dotnet add src/backend/FamilyTree.Application package FluentValidation.DependencyInjectionExtensions --version 11.11.0
dotnet add src/backend/FamilyTree.Application package Mapster --version 7.4.0
dotnet add src/backend/FamilyTree.Application package MapsterMapper --version 7.4.0

# Infrastructure
dotnet add src/backend/FamilyTree.Infrastructure package Microsoft.Extensions.Hosting.Abstractions
dotnet add src/backend/FamilyTree.Infrastructure package Microsoft.Extensions.Options.ConfigurationExtensions

# Unit tests
dotnet add tests/unit/FamilyTree.UnitTests package Moq --version 4.20.72
dotnet add tests/unit/FamilyTree.UnitTests package AwesomeAssertions

# Integration tests
dotnet add tests/integration/FamilyTree.IntegrationTests package Microsoft.AspNetCore.Mvc.Testing
dotnet add tests/integration/FamilyTree.IntegrationTests package AwesomeAssertions
```

> Note: `MediatR 12.5.0` is the last free/OSS (Apache-2.0) release — do **not** upgrade to 13+. `Microsoft.Extensions.*` and `Microsoft.AspNetCore.Mvc.Testing` resolve to the latest 10.0.x. `AwesomeAssertions` is a drop-in fork of FluentAssertions; test files use `using FluentAssertions;`.

- [ ] **Step 5: Remove webapi template cruft**

Delete the template's sample endpoint so it doesn't pollute the API:

```bash
rm src/backend/FamilyTree.Api/Controllers/WeatherForecastController.cs
rm src/backend/FamilyTree.Api/WeatherForecast.cs
```

(If a file does not exist, ignore — template contents vary slightly by SDK.)

- [ ] **Step 6: Verify the solution builds**

Run: `dotnet build`
Expected: `Build succeeded` with 0 errors (template Program.cs may still reference removed types — if so, leave Program.cs for Task 10 which rewrites it; comment out any `MapGet("/weatherforecast"...)` line to get a green build now).

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "$(cat <<'EOF'
chore(backend): scaffold solution, projects, references and packages

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: Domain models and repository interfaces

**Files:**
- Create: `src/backend/FamilyTree.Domain/Enums.cs`, `LifeEvent.cs`, `Residence.cs`, `SocialLink.cs`, `Parents.cs`, `Person.cs`, `Union.cs`, `FamilyGraph.cs`, `IPersonRepository.cs`, `IUnionRepository.cs`
- Test: `tests/unit/FamilyTree.UnitTests/Domain/PersonTests.cs`

- [ ] **Step 1: Write the failing test**

Create `tests/unit/FamilyTree.UnitTests/Domain/PersonTests.cs`:

```csharp
using FamilyTree.Domain;
using FluentAssertions;
using Xunit;

namespace FamilyTree.UnitTests.Domain;

public sealed class PersonTests
{
    [Fact]
    public void Person_WhenCollectionsOmitted_ShouldDefaultToEmptyNotNull()
    {
        var person = new Person
        {
            Id = "p-0001",
            GivenName = "Anna",
            Surname = "Kowalska",
            Birth = new LifeEvent { Year = 1842 }
        };

        person.Gallery.Should().BeEmpty();
        person.Links.Should().BeEmpty();
        person.Residences.Should().BeEmpty();
        person.Parents.Should().NotBeNull();
        person.Parents.MotherId.Should().BeNull();
        person.Sex.Should().Be(Sex.Unknown);
        person.Vocation.Should().Be(Vocation.Other);
    }
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `dotnet test tests/unit/FamilyTree.UnitTests --filter "FullyQualifiedName~PersonTests"`
Expected: FAIL — `Person`, `LifeEvent`, `Sex`, `Vocation` do not exist (compile error).

- [ ] **Step 3: Create the domain types**

`src/backend/FamilyTree.Domain/Enums.cs`:

```csharp
namespace FamilyTree.Domain;

public enum Sex
{
    Unknown,
    Female,
    Male
}

public enum Vocation
{
    Other,
    Teacher,
    Church,
    Writer,
    Office
}
```

`src/backend/FamilyTree.Domain/LifeEvent.cs`:

```csharp
namespace FamilyTree.Domain;

public sealed record LifeEvent
{
    public int? Year { get; init; }
    public int? Month { get; init; }
    public int? Day { get; init; }
    public bool Approx { get; init; }
    public string? Place { get; init; }
}
```

`src/backend/FamilyTree.Domain/Residence.cs`:

```csharp
namespace FamilyTree.Domain;

public sealed record Residence
{
    public required string Place { get; init; }
    public int? FromYear { get; init; }
    public int? ToYear { get; init; }
    public string? MapUrl { get; init; }
}
```

`src/backend/FamilyTree.Domain/SocialLink.cs`:

```csharp
namespace FamilyTree.Domain;

public sealed record SocialLink
{
    public required string Type { get; init; }
    public required string Url { get; init; }
}
```

`src/backend/FamilyTree.Domain/Parents.cs`:

```csharp
namespace FamilyTree.Domain;

public sealed record Parents
{
    public string? MotherId { get; init; }
    public string? FatherId { get; init; }
}
```

`src/backend/FamilyTree.Domain/Person.cs`:

```csharp
namespace FamilyTree.Domain;

public sealed record Person
{
    public required string Id { get; init; }
    public required string GivenName { get; init; }
    public required string Surname { get; init; }
    public string? MaidenName { get; init; }
    public Sex Sex { get; init; }
    public required LifeEvent Birth { get; init; }
    public LifeEvent? Death { get; init; }
    public Vocation Vocation { get; init; }
    public string? Summary { get; init; }
    public string? Biography { get; init; }
    public string? Portrait { get; init; }
    public IReadOnlyList<string> Gallery { get; init; } = [];
    public IReadOnlyList<SocialLink> Links { get; init; } = [];
    public IReadOnlyList<Residence> Residences { get; init; } = [];
    public Parents Parents { get; init; } = new();
    public bool MarriedIntoFamily { get; init; }
    public bool IsDefaultRoot { get; init; }
}
```

`src/backend/FamilyTree.Domain/Union.cs`:

```csharp
namespace FamilyTree.Domain;

public sealed record Union
{
    public required string Id { get; init; }
    public IReadOnlyList<string> PartnerIds { get; init; } = [];
    public int? MarriageYear { get; init; }
    public IReadOnlyList<string> ChildIds { get; init; } = [];
}
```

`src/backend/FamilyTree.Domain/FamilyGraph.cs`:

```csharp
namespace FamilyTree.Domain;

public sealed record FamilyGraph(IReadOnlyList<Person> People, IReadOnlyList<Union> Unions);
```

`src/backend/FamilyTree.Domain/IPersonRepository.cs`:

```csharp
namespace FamilyTree.Domain;

public interface IPersonRepository
{
    Task<IReadOnlyList<Person>> GetAllAsync(CancellationToken cancellationToken);
    Task<Person?> GetByIdAsync(string id, CancellationToken cancellationToken);
}
```

`src/backend/FamilyTree.Domain/IUnionRepository.cs`:

```csharp
namespace FamilyTree.Domain;

public interface IUnionRepository
{
    Task<IReadOnlyList<Union>> GetAllAsync(CancellationToken cancellationToken);
}
```

> The `Domain.csproj` from the `classlib` template already has `<Nullable>enable</Nullable>` and `<ImplicitUsings>enable</ImplicitUsings>`. Confirm both are present; implicit usings supply `System.Collections.Generic`, `System.Threading`, and `System.Threading.Tasks`.

- [ ] **Step 4: Run test to verify it passes**

Run: `dotnet test tests/unit/FamilyTree.UnitTests --filter "FullyQualifiedName~PersonTests"`
Expected: PASS (1 test).

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "$(cat <<'EOF'
feat(domain): add Person/Union models and repository interfaces

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: JSON loader (deserialization)

**Files:**
- Create: `src/backend/FamilyTree.Infrastructure/FamilyDataOptions.cs`, `IFamilyDataLoader.cs`, `FamilyFileModel.cs`, `JsonFamilyDataLoader.cs`
- Test: `tests/unit/FamilyTree.UnitTests/Infrastructure/JsonFamilyDataLoaderTests.cs`

- [ ] **Step 1: Write the failing test**

Create `tests/unit/FamilyTree.UnitTests/Infrastructure/JsonFamilyDataLoaderTests.cs`:

```csharp
using FamilyTree.Domain;
using FamilyTree.Infrastructure;
using FluentAssertions;
using Xunit;

namespace FamilyTree.UnitTests.Infrastructure;

public sealed class JsonFamilyDataLoaderTests
{
    [Fact]
    public void Deserialize_WhenGivenValidJson_ShouldMapPeopleUnionsAndLowercaseEnums()
    {
        const string json = """
        {
          "people": [
            {
              "id": "p-0001",
              "givenName": "Anna",
              "surname": "Kowalska",
              "maidenName": "Nowak",
              "sex": "female",
              "birth": { "year": 1842, "month": 5, "approx": false, "place": "Kraków" },
              "death": { "year": 1910, "approx": true },
              "vocation": "teacher",
              "marriedIntoFamily": true,
              "isDefaultRoot": true,
              "residences": [
                { "place": "Vilnius", "fromYear": 1870, "toYear": 1885, "mapUrl": "https://maps.google.com/x" }
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
        person.Sex.Should().Be(Sex.Female);
        person.Vocation.Should().Be(Vocation.Teacher);
        person.Birth.Year.Should().Be(1842);
        person.Birth.Place.Should().Be("Kraków");
        person.Death!.Approx.Should().BeTrue();
        person.IsDefaultRoot.Should().BeTrue();
        person.Residences.Should().ContainSingle().Which.MapUrl.Should().Be("https://maps.google.com/x");
        person.Links.Should().ContainSingle().Which.Type.Should().Be("facebook");
        graph.Unions.Should().ContainSingle().Which.PartnerIds.Should().Equal("p-0001", "p-0002");
    }
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `dotnet test tests/unit/FamilyTree.UnitTests --filter "FullyQualifiedName~JsonFamilyDataLoaderTests"`
Expected: FAIL — `JsonFamilyDataLoader` does not exist.

- [ ] **Step 3: Create the loader and supporting types**

`src/backend/FamilyTree.Infrastructure/FamilyDataOptions.cs`:

```csharp
namespace FamilyTree.Infrastructure;

public sealed class FamilyDataOptions
{
    public const string SectionName = "FamilyData";

    public string FilePath { get; set; } = "Data/family.json";
}
```

`src/backend/FamilyTree.Infrastructure/IFamilyDataLoader.cs`:

```csharp
using FamilyTree.Domain;

namespace FamilyTree.Infrastructure;

public interface IFamilyDataLoader
{
    FamilyGraph Load();
}
```

`src/backend/FamilyTree.Infrastructure/FamilyFileModel.cs`:

```csharp
using FamilyTree.Domain;

namespace FamilyTree.Infrastructure;

internal sealed record FamilyFileModel
{
    public IReadOnlyList<Person> People { get; init; } = [];
    public IReadOnlyList<Union> Unions { get; init; } = [];
}
```

`src/backend/FamilyTree.Infrastructure/JsonFamilyDataLoader.cs`:

```csharp
using System.Text.Json;
using System.Text.Json.Serialization;
using FamilyTree.Domain;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Options;

namespace FamilyTree.Infrastructure;

public sealed class JsonFamilyDataLoader : IFamilyDataLoader
{
    private static readonly JsonSerializerOptions SerializerOptions = new(JsonSerializerDefaults.Web)
    {
        Converters = { new JsonStringEnumConverter(JsonNamingPolicy.CamelCase) }
    };

    private readonly FamilyDataOptions _options;
    private readonly IHostEnvironment _environment;

    public JsonFamilyDataLoader(IOptions<FamilyDataOptions> options, IHostEnvironment environment)
    {
        _options = options.Value;
        _environment = environment;
    }

    public FamilyGraph Load()
    {
        var path = Path.IsPathRooted(_options.FilePath)
            ? _options.FilePath
            : Path.Combine(_environment.ContentRootPath, _options.FilePath);

        if (!File.Exists(path))
        {
            throw new FileNotFoundException($"Family data file not found at '{path}'.", path);
        }

        var json = File.ReadAllText(path);
        return Deserialize(json);
    }

    public static FamilyGraph Deserialize(string json)
    {
        var model = JsonSerializer.Deserialize<FamilyFileModel>(json, SerializerOptions)
            ?? throw new InvalidOperationException("Family data file deserialized to null.");

        return new FamilyGraph(model.People, model.Unions);
    }
}
```

> `JsonSerializerDefaults.Web` gives camelCase + case-insensitive matching; the `JsonStringEnumConverter(JsonNamingPolicy.CamelCase)` maps `"female"`↔`Sex.Female` and `"teacher"`↔`Vocation.Teacher`. The static `Deserialize` method keeps the JSON logic file-IO-free and unit-testable.

- [ ] **Step 4: Run test to verify it passes**

Run: `dotnet test tests/unit/FamilyTree.UnitTests --filter "FullyQualifiedName~JsonFamilyDataLoaderTests"`
Expected: PASS.

> If deserialization into `IReadOnlyList<T>` ever fails on your runtime, change the `FamilyFileModel` collection properties to `List<Person>` / `List<Union>` (still assignable to `IReadOnlyList<T>` in the `FamilyGraph` constructor). The test will confirm.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "$(cat <<'EOF'
feat(infra): add JSON family data loader with enum + collection mapping

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: In-memory store, repositories, and Infrastructure DI

**Files:**
- Create: `src/backend/FamilyTree.Infrastructure/FamilyStore.cs`, `InMemoryPersonRepository.cs`, `InMemoryUnionRepository.cs`, `InfrastructureServiceCollectionExtensions.cs`
- Test: `tests/unit/FamilyTree.UnitTests/Infrastructure/InMemoryRepositoryTests.cs`

- [ ] **Step 1: Write the failing test**

Create `tests/unit/FamilyTree.UnitTests/Infrastructure/InMemoryRepositoryTests.cs`:

```csharp
using FamilyTree.Domain;
using FamilyTree.Infrastructure;
using FluentAssertions;
using Moq;
using Xunit;

namespace FamilyTree.UnitTests.Infrastructure;

public sealed class InMemoryRepositoryTests
{
    private static FamilyStore BuildStore()
    {
        var people = new List<Person>
        {
            new() { Id = "p-0001", GivenName = "Jan", Surname = "Kowalski", Birth = new LifeEvent { Year = 1750 } },
            new() { Id = "p-0002", GivenName = "Anna", Surname = "Kowalska", Birth = new LifeEvent { Year = 1755 } }
        };
        var unions = new List<Union>
        {
            new() { Id = "u-0001", PartnerIds = ["p-0001", "p-0002"] }
        };

        var loader = new Mock<IFamilyDataLoader>();
        loader.Setup(l => l.Load()).Returns(new FamilyGraph(people, unions));
        return new FamilyStore(loader.Object);
    }

    [Fact]
    public async Task GetAllAsync_WhenStoreHasPeople_ShouldReturnAllPeople()
    {
        var repository = new InMemoryPersonRepository(BuildStore());

        var result = await repository.GetAllAsync(CancellationToken.None);

        result.Should().HaveCount(2);
    }

    [Fact]
    public async Task GetByIdAsync_WhenIdExists_ShouldReturnMatchingPerson()
    {
        var repository = new InMemoryPersonRepository(BuildStore());

        var result = await repository.GetByIdAsync("p-0002", CancellationToken.None);

        result.Should().NotBeNull();
        result!.GivenName.Should().Be("Anna");
    }

    [Fact]
    public async Task GetByIdAsync_WhenIdMissing_ShouldReturnNull()
    {
        var repository = new InMemoryPersonRepository(BuildStore());

        var result = await repository.GetByIdAsync("p-9999", CancellationToken.None);

        result.Should().BeNull();
    }

    [Fact]
    public async Task GetAllAsync_WhenStoreHasUnions_ShouldReturnAllUnions()
    {
        var repository = new InMemoryUnionRepository(BuildStore());

        var result = await repository.GetAllAsync(CancellationToken.None);

        result.Should().ContainSingle().Which.Id.Should().Be("u-0001");
    }
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `dotnet test tests/unit/FamilyTree.UnitTests --filter "FullyQualifiedName~InMemoryRepositoryTests"`
Expected: FAIL — `FamilyStore`, `InMemoryPersonRepository`, `InMemoryUnionRepository` do not exist.

- [ ] **Step 3: Implement store and repositories**

`src/backend/FamilyTree.Infrastructure/FamilyStore.cs`:

```csharp
using FamilyTree.Domain;

namespace FamilyTree.Infrastructure;

public sealed class FamilyStore
{
    public FamilyStore(IFamilyDataLoader loader)
    {
        var graph = loader.Load();
        People = graph.People;
        Unions = graph.Unions;
    }

    public IReadOnlyList<Person> People { get; }

    public IReadOnlyList<Union> Unions { get; }
}
```

`src/backend/FamilyTree.Infrastructure/InMemoryPersonRepository.cs`:

```csharp
using FamilyTree.Domain;

namespace FamilyTree.Infrastructure;

public sealed class InMemoryPersonRepository : IPersonRepository
{
    private readonly FamilyStore _store;

    public InMemoryPersonRepository(FamilyStore store)
    {
        _store = store;
    }

    public Task<IReadOnlyList<Person>> GetAllAsync(CancellationToken cancellationToken)
    {
        return Task.FromResult(_store.People);
    }

    public Task<Person?> GetByIdAsync(string id, CancellationToken cancellationToken)
    {
        var person = _store.People.FirstOrDefault(candidate => candidate.Id == id);
        return Task.FromResult(person);
    }
}
```

`src/backend/FamilyTree.Infrastructure/InMemoryUnionRepository.cs`:

```csharp
using FamilyTree.Domain;

namespace FamilyTree.Infrastructure;

public sealed class InMemoryUnionRepository : IUnionRepository
{
    private readonly FamilyStore _store;

    public InMemoryUnionRepository(FamilyStore store)
    {
        _store = store;
    }

    public Task<IReadOnlyList<Union>> GetAllAsync(CancellationToken cancellationToken)
    {
        return Task.FromResult(_store.Unions);
    }
}
```

`src/backend/FamilyTree.Infrastructure/InfrastructureServiceCollectionExtensions.cs`:

```csharp
using FamilyTree.Domain;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;

namespace FamilyTree.Infrastructure;

public static class InfrastructureServiceCollectionExtensions
{
    public static IServiceCollection AddInfrastructure(this IServiceCollection services, IConfiguration configuration)
    {
        services.Configure<FamilyDataOptions>(configuration.GetSection(FamilyDataOptions.SectionName));
        services.AddSingleton<IFamilyDataLoader, JsonFamilyDataLoader>();
        services.AddSingleton<FamilyStore>();
        services.AddScoped<IPersonRepository, InMemoryPersonRepository>();
        services.AddScoped<IUnionRepository, InMemoryUnionRepository>();
        return services;
    }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `dotnet test tests/unit/FamilyTree.UnitTests --filter "FullyQualifiedName~InMemoryRepositoryTests"`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "$(cat <<'EOF'
feat(infra): add in-memory family store, repositories and DI extension

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

---

## Task 5: Application query service

**Files:**
- Create: `src/backend/FamilyTree.Application/Abstractions/IFamilyQueryService.cs`, `src/backend/FamilyTree.Application/Services/FamilyQueryService.cs`
- Test: `tests/unit/FamilyTree.UnitTests/Application/FamilyQueryServiceTests.cs`

- [ ] **Step 1: Write the failing test**

Create `tests/unit/FamilyTree.UnitTests/Application/FamilyQueryServiceTests.cs`:

```csharp
using FamilyTree.Application.Services;
using FamilyTree.Domain;
using FluentAssertions;
using Moq;
using Xunit;

namespace FamilyTree.UnitTests.Application;

public sealed class FamilyQueryServiceTests
{
    private static Person NewPerson(string id) =>
        new() { Id = id, GivenName = "Test", Surname = "Person", Birth = new LifeEvent { Year = 1800 } };

    [Fact]
    public async Task GetGraphAsync_WhenCalled_ShouldCombinePeopleAndUnionsFromRepositories()
    {
        var people = new List<Person> { NewPerson("p-0001") };
        var unions = new List<Union> { new() { Id = "u-0001" } };

        var personRepository = new Mock<IPersonRepository>();
        personRepository.Setup(r => r.GetAllAsync(It.IsAny<CancellationToken>()))
            .ReturnsAsync(people);
        var unionRepository = new Mock<IUnionRepository>();
        unionRepository.Setup(r => r.GetAllAsync(It.IsAny<CancellationToken>()))
            .ReturnsAsync(unions);

        var service = new FamilyQueryService(personRepository.Object, unionRepository.Object);

        var graph = await service.GetGraphAsync(CancellationToken.None);

        graph.People.Should().ContainSingle().Which.Id.Should().Be("p-0001");
        graph.Unions.Should().ContainSingle().Which.Id.Should().Be("u-0001");
    }

    [Fact]
    public async Task GetPersonAsync_WhenCalled_ShouldDelegateToRepository()
    {
        var personRepository = new Mock<IPersonRepository>();
        personRepository.Setup(r => r.GetByIdAsync("p-0001", It.IsAny<CancellationToken>()))
            .ReturnsAsync(NewPerson("p-0001"));
        var unionRepository = new Mock<IUnionRepository>();

        var service = new FamilyQueryService(personRepository.Object, unionRepository.Object);

        var person = await service.GetPersonAsync("p-0001", CancellationToken.None);

        person.Should().NotBeNull();
        personRepository.Verify(r => r.GetByIdAsync("p-0001", It.IsAny<CancellationToken>()), Times.Once);
    }
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `dotnet test tests/unit/FamilyTree.UnitTests --filter "FullyQualifiedName~FamilyQueryServiceTests"`
Expected: FAIL — `IFamilyQueryService`/`FamilyQueryService` do not exist.

- [ ] **Step 3: Implement the service**

`src/backend/FamilyTree.Application/Abstractions/IFamilyQueryService.cs`:

```csharp
using FamilyTree.Domain;

namespace FamilyTree.Application.Abstractions;

public interface IFamilyQueryService
{
    Task<IReadOnlyList<Person>> GetAllPeopleAsync(CancellationToken cancellationToken);
    Task<Person?> GetPersonAsync(string id, CancellationToken cancellationToken);
    Task<FamilyGraph> GetGraphAsync(CancellationToken cancellationToken);
}
```

`src/backend/FamilyTree.Application/Services/FamilyQueryService.cs`:

```csharp
using FamilyTree.Application.Abstractions;
using FamilyTree.Domain;

namespace FamilyTree.Application.Services;

public sealed class FamilyQueryService : IFamilyQueryService
{
    private readonly IPersonRepository _persons;
    private readonly IUnionRepository _unions;

    public FamilyQueryService(IPersonRepository persons, IUnionRepository unions)
    {
        _persons = persons;
        _unions = unions;
    }

    public Task<IReadOnlyList<Person>> GetAllPeopleAsync(CancellationToken cancellationToken)
    {
        return _persons.GetAllAsync(cancellationToken);
    }

    public Task<Person?> GetPersonAsync(string id, CancellationToken cancellationToken)
    {
        return _persons.GetByIdAsync(id, cancellationToken);
    }

    public async Task<FamilyGraph> GetGraphAsync(CancellationToken cancellationToken)
    {
        var people = await _persons.GetAllAsync(cancellationToken);
        var unions = await _unions.GetAllAsync(cancellationToken);
        return new FamilyGraph(people, unions);
    }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `dotnet test tests/unit/FamilyTree.UnitTests --filter "FullyQualifiedName~FamilyQueryServiceTests"`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "$(cat <<'EOF'
feat(application): add family query service over repositories

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

---

## Task 6: DTOs and Mapster mapping

**Files:**
- Create all DTOs under `src/backend/FamilyTree.Application/Dtos/` and `src/backend/FamilyTree.Application/Mapping/MappingConfig.cs`
- Test: `tests/unit/FamilyTree.UnitTests/Application/MappingConfigTests.cs`

- [ ] **Step 1: Write the failing test**

Create `tests/unit/FamilyTree.UnitTests/Application/MappingConfigTests.cs`:

```csharp
using FamilyTree.Application.Dtos;
using FamilyTree.Application.Mapping;
using FamilyTree.Domain;
using FluentAssertions;
using Mapster;
using Xunit;

namespace FamilyTree.UnitTests.Application;

public sealed class MappingConfigTests
{
    private static TypeAdapterConfig BuildConfig()
    {
        var config = new TypeAdapterConfig();
        MappingConfig.Register(config);
        return config;
    }

    private static Person SamplePerson() => new()
    {
        Id = "p-0001",
        GivenName = "Anna",
        Surname = "Kowalska",
        MaidenName = "Nowak",
        Sex = Sex.Female,
        Birth = new LifeEvent { Year = 1842, Place = "Kraków" },
        Death = new LifeEvent { Year = 1910, Approx = true },
        Vocation = Vocation.Teacher,
        Portrait = "p-0001.jpg",
        Residences = [new Residence { Place = "Vilnius", MapUrl = "https://maps.google.com/x" }],
        Links = [new SocialLink { Type = "facebook", Url = "https://fb.com/x" }],
        Parents = new Parents { MotherId = "p-0003", FatherId = "p-0004" },
        MarriedIntoFamily = true,
        IsDefaultRoot = true
    };

    [Fact]
    public void Map_WhenPersonToSummary_ShouldLowercaseEnumsAndFlattenYears()
    {
        var dto = SamplePerson().Adapt<PersonSummaryDto>(BuildConfig());

        dto.Sex.Should().Be("female");
        dto.Vocation.Should().Be("teacher");
        dto.BirthYear.Should().Be(1842);
        dto.DeathYear.Should().Be(1910);
        dto.Parents.MotherId.Should().Be("p-0003");
        dto.IsDefaultRoot.Should().BeTrue();
    }

    [Fact]
    public void Map_WhenPersonToDetail_ShouldMapNestedCollectionsAndEvents()
    {
        var dto = SamplePerson().Adapt<PersonDto>(BuildConfig());

        dto.Sex.Should().Be("female");
        dto.Birth.Place.Should().Be("Kraków");
        dto.Death!.Approx.Should().BeTrue();
        dto.Residences.Should().ContainSingle().Which.MapUrl.Should().Be("https://maps.google.com/x");
        dto.Links.Should().ContainSingle().Which.Type.Should().Be("facebook");
    }

    [Fact]
    public void Map_WhenGraphToDto_ShouldMapPeopleAndUnions()
    {
        var graph = new FamilyGraph(
            [SamplePerson()],
            [new Union { Id = "u-0001", PartnerIds = ["p-0001", "p-0002"], MarriageYear = 1865 }]);

        var dto = graph.Adapt<FamilyGraphDto>(BuildConfig());

        dto.People.Should().ContainSingle().Which.Id.Should().Be("p-0001");
        dto.Unions.Should().ContainSingle().Which.PartnerIds.Should().Equal("p-0001", "p-0002");
    }
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `dotnet test tests/unit/FamilyTree.UnitTests --filter "FullyQualifiedName~MappingConfigTests"`
Expected: FAIL — DTOs and `MappingConfig` do not exist.

- [ ] **Step 3: Create the DTOs**

`src/backend/FamilyTree.Application/Dtos/LifeEventDto.cs`:

```csharp
namespace FamilyTree.Application.Dtos;

public sealed record LifeEventDto(int? Year, int? Month, int? Day, bool Approx, string? Place);
```

`src/backend/FamilyTree.Application/Dtos/ResidenceDto.cs`:

```csharp
namespace FamilyTree.Application.Dtos;

public sealed record ResidenceDto(string Place, int? FromYear, int? ToYear, string? MapUrl);
```

`src/backend/FamilyTree.Application/Dtos/SocialLinkDto.cs`:

```csharp
namespace FamilyTree.Application.Dtos;

public sealed record SocialLinkDto(string Type, string Url);
```

`src/backend/FamilyTree.Application/Dtos/ParentsDto.cs`:

```csharp
namespace FamilyTree.Application.Dtos;

public sealed record ParentsDto(string? MotherId, string? FatherId);
```

`src/backend/FamilyTree.Application/Dtos/PersonSummaryDto.cs`:

```csharp
namespace FamilyTree.Application.Dtos;

public sealed record PersonSummaryDto(
    string Id,
    string GivenName,
    string Surname,
    string? MaidenName,
    string Sex,
    int? BirthYear,
    int? DeathYear,
    string Vocation,
    string? Portrait,
    ParentsDto Parents,
    bool MarriedIntoFamily,
    bool IsDefaultRoot);
```

`src/backend/FamilyTree.Application/Dtos/PersonDto.cs`:

```csharp
namespace FamilyTree.Application.Dtos;

public sealed record PersonDto(
    string Id,
    string GivenName,
    string Surname,
    string? MaidenName,
    string Sex,
    LifeEventDto Birth,
    LifeEventDto? Death,
    string Vocation,
    string? Summary,
    string? Biography,
    string? Portrait,
    IReadOnlyList<string> Gallery,
    IReadOnlyList<SocialLinkDto> Links,
    IReadOnlyList<ResidenceDto> Residences,
    ParentsDto Parents,
    bool MarriedIntoFamily,
    bool IsDefaultRoot);
```

`src/backend/FamilyTree.Application/Dtos/UnionDto.cs`:

```csharp
namespace FamilyTree.Application.Dtos;

public sealed record UnionDto(
    string Id,
    IReadOnlyList<string> PartnerIds,
    int? MarriageYear,
    IReadOnlyList<string> ChildIds);
```

`src/backend/FamilyTree.Application/Dtos/FamilyGraphDto.cs`:

```csharp
namespace FamilyTree.Application.Dtos;

public sealed record FamilyGraphDto(
    IReadOnlyList<PersonSummaryDto> People,
    IReadOnlyList<UnionDto> Unions);
```

- [ ] **Step 4: Create the mapping config**

`src/backend/FamilyTree.Application/Mapping/MappingConfig.cs`:

```csharp
using FamilyTree.Application.Dtos;
using FamilyTree.Domain;
using Mapster;

namespace FamilyTree.Application.Mapping;

public static class MappingConfig
{
    public static void Register(TypeAdapterConfig config)
    {
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
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `dotnet test tests/unit/FamilyTree.UnitTests --filter "FullyQualifiedName~MappingConfigTests"`
Expected: PASS (3 tests).

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "$(cat <<'EOF'
feat(application): add DTOs and Mapster mapping configuration

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

---

## Task 7: MediatR queries and handlers

**Files:**
- Create: `src/backend/FamilyTree.Application/People/GetAllPeopleQuery.cs`, `GetAllPeopleHandler.cs`, `GetPersonByIdQuery.cs`, `GetPersonByIdHandler.cs`; `src/backend/FamilyTree.Application/Family/GetFamilyGraphQuery.cs`, `GetFamilyGraphHandler.cs`
- Test: `tests/unit/FamilyTree.UnitTests/Application/HandlerTests.cs`

- [ ] **Step 1: Write the failing test**

Create `tests/unit/FamilyTree.UnitTests/Application/HandlerTests.cs`:

```csharp
using FamilyTree.Application.Abstractions;
using FamilyTree.Application.Family;
using FamilyTree.Application.Mapping;
using FamilyTree.Application.People;
using FamilyTree.Domain;
using FluentAssertions;
using Mapster;
using MapsterMapper;
using Moq;
using Xunit;

namespace FamilyTree.UnitTests.Application;

public sealed class HandlerTests
{
    private static IMapper BuildMapper()
    {
        var config = new TypeAdapterConfig();
        MappingConfig.Register(config);
        return new Mapper(config);
    }

    private static Person NewPerson(string id) => new()
    {
        Id = id,
        GivenName = "Anna",
        Surname = "Kowalska",
        Sex = Sex.Female,
        Vocation = Vocation.Teacher,
        Birth = new LifeEvent { Year = 1842 }
    };

    [Fact]
    public async Task Handle_WhenGetAllPeople_ShouldReturnMappedSummaries()
    {
        var service = new Mock<IFamilyQueryService>();
        service.Setup(s => s.GetAllPeopleAsync(It.IsAny<CancellationToken>()))
            .ReturnsAsync(new List<Person> { NewPerson("p-0001") });
        var handler = new GetAllPeopleHandler(service.Object, BuildMapper());

        var result = await handler.Handle(new GetAllPeopleQuery(), CancellationToken.None);

        result.Should().ContainSingle();
        result[0].Sex.Should().Be("female");
    }

    [Fact]
    public async Task Handle_WhenGetPersonByIdAndMissing_ShouldReturnNull()
    {
        var service = new Mock<IFamilyQueryService>();
        service.Setup(s => s.GetPersonAsync("p-9999", It.IsAny<CancellationToken>()))
            .ReturnsAsync((Person?)null);
        var handler = new GetPersonByIdHandler(service.Object, BuildMapper());

        var result = await handler.Handle(new GetPersonByIdQuery("p-9999"), CancellationToken.None);

        result.Should().BeNull();
    }

    [Fact]
    public async Task Handle_WhenGetPersonByIdAndFound_ShouldReturnMappedDetail()
    {
        var service = new Mock<IFamilyQueryService>();
        service.Setup(s => s.GetPersonAsync("p-0001", It.IsAny<CancellationToken>()))
            .ReturnsAsync(NewPerson("p-0001"));
        var handler = new GetPersonByIdHandler(service.Object, BuildMapper());

        var result = await handler.Handle(new GetPersonByIdQuery("p-0001"), CancellationToken.None);

        result.Should().NotBeNull();
        result!.Vocation.Should().Be("teacher");
    }

    [Fact]
    public async Task Handle_WhenGetFamilyGraph_ShouldReturnMappedGraph()
    {
        var service = new Mock<IFamilyQueryService>();
        service.Setup(s => s.GetGraphAsync(It.IsAny<CancellationToken>()))
            .ReturnsAsync(new FamilyGraph(
                [NewPerson("p-0001")],
                [new Union { Id = "u-0001", PartnerIds = ["p-0001"] }]));
        var handler = new GetFamilyGraphHandler(service.Object, BuildMapper());

        var result = await handler.Handle(new GetFamilyGraphQuery(), CancellationToken.None);

        result.People.Should().ContainSingle();
        result.Unions.Should().ContainSingle().Which.Id.Should().Be("u-0001");
    }
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `dotnet test tests/unit/FamilyTree.UnitTests --filter "FullyQualifiedName~HandlerTests"`
Expected: FAIL — queries/handlers do not exist.

- [ ] **Step 3: Implement queries and handlers**

`src/backend/FamilyTree.Application/People/GetAllPeopleQuery.cs`:

```csharp
using FamilyTree.Application.Dtos;
using MediatR;

namespace FamilyTree.Application.People;

public sealed record GetAllPeopleQuery : IRequest<IReadOnlyList<PersonSummaryDto>>;
```

`src/backend/FamilyTree.Application/People/GetAllPeopleHandler.cs`:

```csharp
using FamilyTree.Application.Abstractions;
using FamilyTree.Application.Dtos;
using MapsterMapper;
using MediatR;

namespace FamilyTree.Application.People;

public sealed class GetAllPeopleHandler : IRequestHandler<GetAllPeopleQuery, IReadOnlyList<PersonSummaryDto>>
{
    private readonly IFamilyQueryService _service;
    private readonly IMapper _mapper;

    public GetAllPeopleHandler(IFamilyQueryService service, IMapper mapper)
    {
        _service = service;
        _mapper = mapper;
    }

    public async Task<IReadOnlyList<PersonSummaryDto>> Handle(GetAllPeopleQuery request, CancellationToken cancellationToken)
    {
        var people = await _service.GetAllPeopleAsync(cancellationToken);
        return _mapper.Map<IReadOnlyList<PersonSummaryDto>>(people);
    }
}
```

`src/backend/FamilyTree.Application/People/GetPersonByIdQuery.cs`:

```csharp
using FamilyTree.Application.Dtos;
using MediatR;

namespace FamilyTree.Application.People;

public sealed record GetPersonByIdQuery(string Id) : IRequest<PersonDto?>;
```

`src/backend/FamilyTree.Application/People/GetPersonByIdHandler.cs`:

```csharp
using FamilyTree.Application.Abstractions;
using FamilyTree.Application.Dtos;
using MapsterMapper;
using MediatR;

namespace FamilyTree.Application.People;

public sealed class GetPersonByIdHandler : IRequestHandler<GetPersonByIdQuery, PersonDto?>
{
    private readonly IFamilyQueryService _service;
    private readonly IMapper _mapper;

    public GetPersonByIdHandler(IFamilyQueryService service, IMapper mapper)
    {
        _service = service;
        _mapper = mapper;
    }

    public async Task<PersonDto?> Handle(GetPersonByIdQuery request, CancellationToken cancellationToken)
    {
        var person = await _service.GetPersonAsync(request.Id, cancellationToken);
        return person is null ? null : _mapper.Map<PersonDto>(person);
    }
}
```

`src/backend/FamilyTree.Application/Family/GetFamilyGraphQuery.cs`:

```csharp
using FamilyTree.Application.Dtos;
using MediatR;

namespace FamilyTree.Application.Family;

public sealed record GetFamilyGraphQuery : IRequest<FamilyGraphDto>;
```

`src/backend/FamilyTree.Application/Family/GetFamilyGraphHandler.cs`:

```csharp
using FamilyTree.Application.Abstractions;
using FamilyTree.Application.Dtos;
using MapsterMapper;
using MediatR;

namespace FamilyTree.Application.Family;

public sealed class GetFamilyGraphHandler : IRequestHandler<GetFamilyGraphQuery, FamilyGraphDto>
{
    private readonly IFamilyQueryService _service;
    private readonly IMapper _mapper;

    public GetFamilyGraphHandler(IFamilyQueryService service, IMapper mapper)
    {
        _service = service;
        _mapper = mapper;
    }

    public async Task<FamilyGraphDto> Handle(GetFamilyGraphQuery request, CancellationToken cancellationToken)
    {
        var graph = await _service.GetGraphAsync(cancellationToken);
        return _mapper.Map<FamilyGraphDto>(graph);
    }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `dotnet test tests/unit/FamilyTree.UnitTests --filter "FullyQualifiedName~HandlerTests"`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "$(cat <<'EOF'
feat(application): add MediatR queries and handlers for people and graph

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

---

## Task 8: Validation (validator + pipeline behavior)

**Files:**
- Create: `src/backend/FamilyTree.Application/People/GetPersonByIdQueryValidator.cs`, `src/backend/FamilyTree.Application/Behaviors/ValidationBehavior.cs`
- Test: `tests/unit/FamilyTree.UnitTests/Application/ValidationTests.cs`

- [ ] **Step 1: Write the failing test**

Create `tests/unit/FamilyTree.UnitTests/Application/ValidationTests.cs`:

```csharp
using FamilyTree.Application.Behaviors;
using FamilyTree.Application.Dtos;
using FamilyTree.Application.People;
using FluentAssertions;
using FluentValidation;
using FluentValidation.TestHelper;
using Xunit;

namespace FamilyTree.UnitTests.Application;

public sealed class ValidationTests
{
    [Theory]
    [InlineData("")]
    [InlineData("invalid")]
    [InlineData("x-0001")]
    public void Validate_WhenIdMalformed_ShouldHaveError(string id)
    {
        var validator = new GetPersonByIdQueryValidator();

        var result = validator.TestValidate(new GetPersonByIdQuery(id));

        result.ShouldHaveValidationErrorFor(query => query.Id);
    }

    [Fact]
    public void Validate_WhenIdWellFormed_ShouldNotHaveError()
    {
        var validator = new GetPersonByIdQueryValidator();

        var result = validator.TestValidate(new GetPersonByIdQuery("p-0001"));

        result.ShouldNotHaveAnyValidationErrors();
    }

    [Fact]
    public async Task Handle_WhenRequestInvalid_ShouldThrowValidationException()
    {
        var behavior = new ValidationBehavior<GetPersonByIdQuery, PersonDto?>(
            new[] { new GetPersonByIdQueryValidator() });

        var act = () => behavior.Handle(
            new GetPersonByIdQuery("invalid"),
            () => Task.FromResult<PersonDto?>(null),
            CancellationToken.None);

        await act.Should().ThrowAsync<ValidationException>();
    }

    [Fact]
    public async Task Handle_WhenRequestValid_ShouldCallNext()
    {
        var behavior = new ValidationBehavior<GetPersonByIdQuery, PersonDto?>(
            new[] { new GetPersonByIdQueryValidator() });
        var nextCalled = false;

        await behavior.Handle(
            new GetPersonByIdQuery("p-0001"),
            () =>
            {
                nextCalled = true;
                return Task.FromResult<PersonDto?>(null);
            },
            CancellationToken.None);

        nextCalled.Should().BeTrue();
    }
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `dotnet test tests/unit/FamilyTree.UnitTests --filter "FullyQualifiedName~ValidationTests"`
Expected: FAIL — validator and behavior do not exist.

- [ ] **Step 3: Implement the validator and behavior**

`src/backend/FamilyTree.Application/People/GetPersonByIdQueryValidator.cs`:

```csharp
using FluentValidation;

namespace FamilyTree.Application.People;

public sealed class GetPersonByIdQueryValidator : AbstractValidator<GetPersonByIdQuery>
{
    public GetPersonByIdQueryValidator()
    {
        RuleFor(query => query.Id)
            .NotEmpty()
            .Matches("^p-\\d+$")
            .WithMessage("Person id must match the pattern 'p-<number>'.");
    }
}
```

`src/backend/FamilyTree.Application/Behaviors/ValidationBehavior.cs`:

```csharp
using FluentValidation;
using FluentValidation.Results;
using MediatR;

namespace FamilyTree.Application.Behaviors;

public sealed class ValidationBehavior<TRequest, TResponse> : IPipelineBehavior<TRequest, TResponse>
    where TRequest : notnull
{
    private readonly IEnumerable<IValidator<TRequest>> _validators;

    public ValidationBehavior(IEnumerable<IValidator<TRequest>> validators)
    {
        _validators = validators;
    }

    public async Task<TResponse> Handle(
        TRequest request,
        RequestHandlerDelegate<TResponse> next,
        CancellationToken cancellationToken)
    {
        if (_validators.Any())
        {
            var context = new ValidationContext<TRequest>(request);
            var failures = new List<ValidationFailure>();

            foreach (var validator in _validators)
            {
                var result = await validator.ValidateAsync(context, cancellationToken);
                failures.AddRange(result.Errors.Where(failure => failure is not null));
            }

            if (failures.Count > 0)
            {
                throw new ValidationException(failures);
            }
        }

        return await next();
    }
}
```

> MediatR 12's `RequestHandlerDelegate<TResponse>` is parameterless — call `next()` with no arguments (matches the test's `() => Task.FromResult(...)`).

- [ ] **Step 4: Run test to verify it passes**

Run: `dotnet test tests/unit/FamilyTree.UnitTests --filter "FullyQualifiedName~ValidationTests"`
Expected: PASS (6 tests — 3 theory cases + 3 facts).

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "$(cat <<'EOF'
feat(application): add id validator and MediatR validation behavior

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

---

## Task 9: Application DI extension

**Files:**
- Create: `src/backend/FamilyTree.Application/ApplicationServiceCollectionExtensions.cs`
- Test: `tests/unit/FamilyTree.UnitTests/Application/ApplicationRegistrationTests.cs`

- [ ] **Step 1: Write the failing test**

Create `tests/unit/FamilyTree.UnitTests/Application/ApplicationRegistrationTests.cs`:

```csharp
using FamilyTree.Application;
using FamilyTree.Application.Abstractions;
using FamilyTree.Application.People;
using FamilyTree.Domain;
using FluentAssertions;
using MapsterMapper;
using MediatR;
using Microsoft.Extensions.DependencyInjection;
using Moq;
using Xunit;

namespace FamilyTree.UnitTests.Application;

public sealed class ApplicationRegistrationTests
{
    [Fact]
    public void AddApplication_WhenResolvingMediator_ShouldDispatchGetAllPeople()
    {
        var services = new ServiceCollection();

        // Application needs an IFamilyQueryService; supply a stub.
        var service = new Mock<IFamilyQueryService>();
        service.Setup(s => s.GetAllPeopleAsync(It.IsAny<CancellationToken>()))
            .ReturnsAsync(new List<Person>());

        services.AddApplication();
        services.AddSingleton(service.Object);

        var provider = services.BuildServiceProvider();
        var sender = provider.GetRequiredService<ISender>();
        provider.GetRequiredService<IMapper>().Should().NotBeNull();

        var act = async () => await sender.Send(new GetAllPeopleQuery());

        act.Should().NotThrowAsync();
    }
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `dotnet test tests/unit/FamilyTree.UnitTests --filter "FullyQualifiedName~ApplicationRegistrationTests"`
Expected: FAIL — `AddApplication` does not exist.

- [ ] **Step 3: Implement the DI extension**

`src/backend/FamilyTree.Application/ApplicationServiceCollectionExtensions.cs`:

```csharp
using System.Reflection;
using FamilyTree.Application.Abstractions;
using FamilyTree.Application.Behaviors;
using FamilyTree.Application.Mapping;
using FamilyTree.Application.Services;
using FluentValidation;
using Mapster;
using MapsterMapper;
using MediatR;
using Microsoft.Extensions.DependencyInjection;

namespace FamilyTree.Application;

public static class ApplicationServiceCollectionExtensions
{
    public static IServiceCollection AddApplication(this IServiceCollection services)
    {
        var assembly = Assembly.GetExecutingAssembly();

        services.AddMediatR(configuration => configuration.RegisterServicesFromAssembly(assembly));
        services.AddTransient(typeof(IPipelineBehavior<,>), typeof(ValidationBehavior<,>));
        services.AddValidatorsFromAssembly(assembly);

        var typeAdapterConfig = new TypeAdapterConfig();
        MappingConfig.Register(typeAdapterConfig);
        services.AddSingleton(typeAdapterConfig);
        services.AddScoped<IMapper, ServiceMapper>();

        services.AddScoped<IFamilyQueryService, FamilyQueryService>();

        return services;
    }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `dotnet test tests/unit/FamilyTree.UnitTests --filter "FullyQualifiedName~ApplicationRegistrationTests"`
Expected: PASS.

- [ ] **Step 5: Run the full unit suite**

Run: `dotnet test tests/unit/FamilyTree.UnitTests`
Expected: PASS — all unit tests green.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "$(cat <<'EOF'
feat(application): add DI registration for MediatR, validation and Mapster

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

---

## Task 10: API host, controllers, sample data

**Files:**
- Modify: `src/backend/FamilyTree.Api/Program.cs` (rewrite), `src/backend/FamilyTree.Api/appsettings.json`, `src/backend/FamilyTree.Api/FamilyTree.Api.csproj`
- Create: `src/backend/FamilyTree.Api/Controllers/PeopleController.cs`, `Controllers/FamilyController.cs`, `Data/family.json`

- [ ] **Step 1: Rewrite `Program.cs`**

Replace the entire contents of `src/backend/FamilyTree.Api/Program.cs`:

```csharp
using FamilyTree.Application;
using FamilyTree.Infrastructure;
using FluentValidation;
using Microsoft.AspNetCore.Diagnostics;

var builder = WebApplication.CreateBuilder(args);

builder.Services.AddControllers();
builder.Services.AddOpenApi();

builder.Services.AddApplication();
builder.Services.AddInfrastructure(builder.Configuration);

const string DevCorsPolicy = "frontend-dev";
builder.Services.AddCors(options =>
{
    options.AddPolicy(DevCorsPolicy, policy =>
        policy.WithOrigins("http://localhost:5173")
            .AllowAnyHeader()
            .AllowAnyMethod());
});

var app = builder.Build();

app.UseExceptionHandler(handler =>
{
    handler.Run(async context =>
    {
        var feature = context.Features.Get<IExceptionHandlerFeature>();
        if (feature?.Error is ValidationException validationException)
        {
            context.Response.StatusCode = StatusCodes.Status400BadRequest;
            await context.Response.WriteAsJsonAsync(new
            {
                title = "Validation failed",
                errors = validationException.Errors
                    .Select(error => new { error.PropertyName, error.ErrorMessage })
            });
        }
        else
        {
            context.Response.StatusCode = StatusCodes.Status500InternalServerError;
            await context.Response.WriteAsJsonAsync(new { title = "An unexpected error occurred." });
        }
    });
});

if (app.Environment.IsDevelopment())
{
    app.MapOpenApi();
    app.UseCors(DevCorsPolicy);
}

app.UseStaticFiles();
app.MapControllers();

app.Run();

public partial class Program { }
```

> `AddOpenApi`/`MapOpenApi` come from the first-party `Microsoft.AspNetCore.OpenApi` package included by the .NET 10 `webapi` template (serves the document at `/openapi/v1.json` in Development). If the package is missing, run `dotnet add src/backend/FamilyTree.Api package Microsoft.AspNetCore.OpenApi`. `public partial class Program { }` makes the host discoverable to `WebApplicationFactory<Program>` in Task 11.

- [ ] **Step 2: Create the controllers**

`src/backend/FamilyTree.Api/Controllers/PeopleController.cs`:

```csharp
using FamilyTree.Application.Dtos;
using FamilyTree.Application.People;
using MediatR;
using Microsoft.AspNetCore.Mvc;

namespace FamilyTree.Api.Controllers;

[ApiController]
[Route("api/people")]
public sealed class PeopleController : ControllerBase
{
    private readonly ISender _sender;

    public PeopleController(ISender sender)
    {
        _sender = sender;
    }

    [HttpGet]
    public async Task<ActionResult<IReadOnlyList<PersonSummaryDto>>> GetAll(CancellationToken cancellationToken)
    {
        var people = await _sender.Send(new GetAllPeopleQuery(), cancellationToken);
        return Ok(people);
    }

    [HttpGet("{id}")]
    public async Task<ActionResult<PersonDto>> GetById(string id, CancellationToken cancellationToken)
    {
        var person = await _sender.Send(new GetPersonByIdQuery(id), cancellationToken);
        return person is null ? NotFound() : Ok(person);
    }
}
```

`src/backend/FamilyTree.Api/Controllers/FamilyController.cs`:

```csharp
using FamilyTree.Application.Dtos;
using FamilyTree.Application.Family;
using MediatR;
using Microsoft.AspNetCore.Mvc;

namespace FamilyTree.Api.Controllers;

[ApiController]
[Route("api/family")]
public sealed class FamilyController : ControllerBase
{
    private readonly ISender _sender;

    public FamilyController(ISender sender)
    {
        _sender = sender;
    }

    [HttpGet("graph")]
    public async Task<ActionResult<FamilyGraphDto>> GetGraph(CancellationToken cancellationToken)
    {
        var graph = await _sender.Send(new GetFamilyGraphQuery(), cancellationToken);
        return Ok(graph);
    }
}
```

- [ ] **Step 3: Configure `appsettings.json`**

Add the `FamilyData` section to `src/backend/FamilyTree.Api/appsettings.json` (merge with existing keys; do not delete `Logging`/`AllowedHosts`):

```json
{
  "Logging": {
    "LogLevel": {
      "Default": "Information",
      "Microsoft.AspNetCore": "Warning"
    }
  },
  "AllowedHosts": "*",
  "FamilyData": {
    "FilePath": "Data/family.json"
  }
}
```

- [ ] **Step 4: Add the sample data and copy-to-output rule**

Create `src/backend/FamilyTree.Api/Data/family.json`:

```json
{
  "people": [
    {
      "id": "p-0001", "givenName": "Jan", "surname": "Kowalski", "sex": "male",
      "birth": { "year": 1750, "approx": true, "place": "Kraków" },
      "death": { "year": 1812, "approx": true },
      "vocation": "church", "marriedIntoFamily": false, "isDefaultRoot": false,
      "summary": "Parish cantor; kept the village chronicle.",
      "parents": {}
    },
    {
      "id": "p-0002", "givenName": "Anna", "surname": "Kowalska", "maidenName": "Nowak", "sex": "female",
      "birth": { "year": 1755, "approx": true }, "death": { "year": 1820, "approx": true },
      "vocation": "other", "marriedIntoFamily": true, "isDefaultRoot": false, "parents": {}
    },
    {
      "id": "p-0003", "givenName": "Piotr", "surname": "Kowalski", "sex": "male",
      "birth": { "year": 1780, "place": "Kraków" }, "death": { "year": 1851 },
      "vocation": "teacher", "marriedIntoFamily": false, "isDefaultRoot": false,
      "summary": "Village schoolteacher.",
      "parents": { "motherId": "p-0002", "fatherId": "p-0001" }
    },
    {
      "id": "p-0004", "givenName": "Maria", "surname": "Kowalska", "maidenName": "Wójcik", "sex": "female",
      "birth": { "year": 1785, "approx": true }, "death": { "year": 1860 },
      "vocation": "writer", "marriedIntoFamily": true, "isDefaultRoot": false,
      "summary": "Wrote folk tales for the parish school.",
      "parents": {}
    },
    {
      "id": "p-0005", "givenName": "Stefan", "surname": "Kowalski", "sex": "male",
      "birth": { "year": 1810, "place": "Vilnius" }, "death": { "year": 1879 },
      "vocation": "office", "marriedIntoFamily": false, "isDefaultRoot": false,
      "residences": [
        { "place": "Vilnius", "fromYear": 1810, "toYear": 1879, "mapUrl": "https://maps.google.com/?q=Vilnius" }
      ],
      "parents": { "motherId": "p-0004", "fatherId": "p-0003" }
    },
    {
      "id": "p-0006", "givenName": "Helena", "surname": "Kowalska", "maidenName": "Zielińska", "sex": "female",
      "birth": { "year": 1815, "approx": true }, "death": { "year": 1888 },
      "vocation": "other", "marriedIntoFamily": true, "isDefaultRoot": false, "parents": {}
    },
    {
      "id": "p-0007", "givenName": "Tadeusz", "surname": "Kowalski", "sex": "male",
      "birth": { "year": 1842, "month": 5, "place": "Vilnius" },
      "vocation": "teacher", "marriedIntoFamily": false, "isDefaultRoot": true,
      "summary": "The present-day focus of the tree.",
      "biography": "Tadeusz anchors the default view. Longer biography text goes here.",
      "links": [ { "type": "facebook", "url": "https://facebook.com/example" } ],
      "residences": [
        { "place": "Vilnius", "fromYear": 1842, "toYear": 1900, "mapUrl": "https://maps.google.com/?q=Vilnius" }
      ],
      "parents": { "motherId": "p-0006", "fatherId": "p-0005" }
    }
  ],
  "unions": [
    { "id": "u-0001", "partnerIds": ["p-0001", "p-0002"], "marriageYear": 1774, "childIds": ["p-0003"] },
    { "id": "u-0002", "partnerIds": ["p-0003", "p-0004"], "marriageYear": 1804, "childIds": ["p-0005"] },
    { "id": "u-0003", "partnerIds": ["p-0005", "p-0006"], "marriageYear": 1838, "childIds": ["p-0007"] }
  ]
}
```

Add the copy rule to `src/backend/FamilyTree.Api/FamilyTree.Api.csproj` inside the top-level `<Project>` element (a new `<ItemGroup>`):

```xml
  <ItemGroup>
    <Content Include="Data\family.json">
      <CopyToOutputDirectory>PreserveNewest</CopyToOutputDirectory>
    </Content>
  </ItemGroup>
```

- [ ] **Step 5: Build and smoke-test the host boots**

Run: `dotnet build src/backend/FamilyTree.Api`
Expected: `Build succeeded`.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "$(cat <<'EOF'
feat(api): add host wiring, controllers and sample family data

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

---

## Task 11: Integration tests (endpoints end-to-end)

**Files:**
- Create: `tests/integration/FamilyTree.IntegrationTests/Fixtures/family.test.json`, `FamilyApiFactory.cs`, `PeopleEndpointsTests.cs`, `FamilyEndpointsTests.cs`
- Modify: `tests/integration/FamilyTree.IntegrationTests/FamilyTree.IntegrationTests.csproj` (copy fixture to output)

- [ ] **Step 1: Add the test fixture data + copy rule**

Create `tests/integration/FamilyTree.IntegrationTests/Fixtures/family.test.json`:

```json
{
  "people": [
    {
      "id": "p-0001", "givenName": "Jan", "surname": "Kowalski", "sex": "male",
      "birth": { "year": 1750, "approx": true }, "vocation": "church",
      "marriedIntoFamily": false, "isDefaultRoot": true, "parents": {}
    },
    {
      "id": "p-0002", "givenName": "Anna", "surname": "Kowalska", "maidenName": "Nowak", "sex": "female",
      "birth": { "year": 1755, "approx": true }, "vocation": "other",
      "marriedIntoFamily": true, "isDefaultRoot": false, "parents": {}
    }
  ],
  "unions": [
    { "id": "u-0001", "partnerIds": ["p-0001", "p-0002"], "marriageYear": 1774, "childIds": [] }
  ]
}
```

Add the copy rule to `tests/integration/FamilyTree.IntegrationTests/FamilyTree.IntegrationTests.csproj` (new `<ItemGroup>` inside `<Project>`):

```xml
  <ItemGroup>
    <Content Include="Fixtures\family.test.json">
      <CopyToOutputDirectory>PreserveNewest</CopyToOutputDirectory>
    </Content>
  </ItemGroup>
```

- [ ] **Step 2: Create the test factory**

`tests/integration/FamilyTree.IntegrationTests/FamilyApiFactory.cs`:

```csharp
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;

namespace FamilyTree.IntegrationTests;

public sealed class FamilyApiFactory : WebApplicationFactory<Program>
{
    protected override void ConfigureWebHost(IWebHostBuilder builder)
    {
        var fixturePath = Path.Combine(AppContext.BaseDirectory, "Fixtures", "family.test.json");
        builder.UseSetting("FamilyData:FilePath", fixturePath);
        builder.UseEnvironment("Development");
    }
}
```

- [ ] **Step 3: Write the failing endpoint tests**

`tests/integration/FamilyTree.IntegrationTests/PeopleEndpointsTests.cs`:

```csharp
using System.Net;
using System.Net.Http.Json;
using FamilyTree.Application.Dtos;
using FluentAssertions;
using Xunit;

namespace FamilyTree.IntegrationTests;

public sealed class PeopleEndpointsTests : IClassFixture<FamilyApiFactory>
{
    private readonly FamilyApiFactory _factory;

    public PeopleEndpointsTests(FamilyApiFactory factory)
    {
        _factory = factory;
    }

    [Fact]
    public async Task GetAll_WhenCalled_ShouldReturnAllPeople()
    {
        var client = _factory.CreateClient();

        var people = await client.GetFromJsonAsync<List<PersonSummaryDto>>("/api/people");

        people.Should().NotBeNull();
        people!.Should().HaveCount(2);
        people.Should().ContainSingle(person => person.IsDefaultRoot);
    }

    [Fact]
    public async Task GetById_WhenIdExists_ShouldReturnPerson()
    {
        var client = _factory.CreateClient();

        var response = await client.GetAsync("/api/people/p-0001");
        var person = await response.Content.ReadFromJsonAsync<PersonDto>();

        response.StatusCode.Should().Be(HttpStatusCode.OK);
        person.Should().NotBeNull();
        person!.Surname.Should().Be("Kowalski");
        person.Sex.Should().Be("male");
    }

    [Fact]
    public async Task GetById_WhenIdMissing_ShouldReturn404()
    {
        var client = _factory.CreateClient();

        var response = await client.GetAsync("/api/people/p-9999");

        response.StatusCode.Should().Be(HttpStatusCode.NotFound);
    }

    [Fact]
    public async Task GetById_WhenIdMalformed_ShouldReturn400()
    {
        var client = _factory.CreateClient();

        var response = await client.GetAsync("/api/people/not-an-id");

        response.StatusCode.Should().Be(HttpStatusCode.BadRequest);
    }
}
```

`tests/integration/FamilyTree.IntegrationTests/FamilyEndpointsTests.cs`:

```csharp
using System.Net;
using System.Net.Http.Json;
using FamilyTree.Application.Dtos;
using FluentAssertions;
using Xunit;

namespace FamilyTree.IntegrationTests;

public sealed class FamilyEndpointsTests : IClassFixture<FamilyApiFactory>
{
    private readonly FamilyApiFactory _factory;

    public FamilyEndpointsTests(FamilyApiFactory factory)
    {
        _factory = factory;
    }

    [Fact]
    public async Task GetGraph_WhenCalled_ShouldReturnPeopleAndUnions()
    {
        var client = _factory.CreateClient();

        var response = await client.GetAsync("/api/family/graph");
        var graph = await response.Content.ReadFromJsonAsync<FamilyGraphDto>();

        response.StatusCode.Should().Be(HttpStatusCode.OK);
        graph.Should().NotBeNull();
        graph!.People.Should().HaveCount(2);
        graph.Unions.Should().ContainSingle().Which.PartnerIds.Should().Equal("p-0001", "p-0002");
    }
}
```

- [ ] **Step 4: Run tests to verify they fail (or build first)**

Run: `dotnet test tests/integration/FamilyTree.IntegrationTests`
Expected: At this point everything is implemented, so they should actually PASS. If any fail, treat the failure as the red step and fix the cause (common causes: fixture not copied to output → verify the `<Content>` rule; `Program` not public partial → verify the line in `Program.cs`).

- [ ] **Step 5: Run the full solution test suite**

Run: `dotnet test`
Expected: PASS — all unit and integration tests green.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "$(cat <<'EOF'
test(integration): cover people and family graph endpoints end-to-end

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

---

## Final verification

- [ ] **Run the whole suite:** `dotnet test` → all green.
- [ ] **Run the API and eyeball it:** `dotnet run --project src/backend/FamilyTree.Api`, then in another shell:
  - `curl http://localhost:5000/api/people` (or the printed port) → JSON array of 7 summaries.
  - `curl http://localhost:5000/api/people/p-0007` → Tadeusz detail with `isDefaultRoot: true`.
  - `curl http://localhost:5000/api/family/graph` → people + 3 unions.
  - `curl -i http://localhost:5000/api/people/bad-id` → `400`.
- [ ] **Confirm the DTO contract** matches the frontend's expectations (this is the hand-off artifact for the frontend plan): `PersonSummaryDto`, `PersonDto`, `UnionDto`, `FamilyGraphDto` as defined in Task 6.

---

## Plan self-review notes

- **Spec coverage:** §3 stack (MediatR 12/FluentValidation/Mapster/AwesomeAssertions) → Tasks 1,6,8; §5 data model → Task 2; §8 API (3 endpoints) → Tasks 7,10; storage abstraction → Tasks 3,4; §10 testing (unit + integration) → every task + Task 11. Layout/rendering (§6,§7,§9 frontend) are intentionally **out of scope** for this backend plan and handled in the follow-up frontend plan.
- **Out of scope here (deferred to frontend plan):** Vue SPA, SVG oak, year axis, pan/zoom, glass popup, layout engine, static portrait assets serving real images.
- **Type consistency:** DTO names/shapes defined in Task 6 are reused verbatim in Tasks 7, 10, 11. `IFamilyQueryService` (Task 5) is consumed in Tasks 7, 9. `FamilyStore`/`IFamilyDataLoader` (Tasks 3–4) reused in Task 4 DI and Task 11 factory override.
- **Known external-version checks the engineer must confirm at runtime (tests will catch):** MediatR `RequestHandlerDelegate` arity (parameterless in 12.x — used in Task 8); `IReadOnlyList<T>` STJ deserialization (Task 3 note); AwesomeAssertions namespace is `FluentAssertions` (drop-in).
