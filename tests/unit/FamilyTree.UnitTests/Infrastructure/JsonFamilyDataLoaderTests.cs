using System.IO;
using FamilyTree.Domain;
using FamilyTree.Infrastructure;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging.Abstractions;
using Microsoft.Extensions.Options;
using Moq;

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
              "givenName": { "ru": "Анна", "en": "Anna" },
              "surname": { "ru": "Ковальская", "en": "Kowalska" },
              "maidenName": { "ru": "Новак", "en": "Nowak" },
              "middleName": { "ru": "Янович", "be": "Янавіч", "en": "Yanovich" },
              "sex": "female",
              "birth": { "year": 1842, "month": 5, "approx": false, "place": { "ru": "Краков", "en": "Kraków" } },
              "death": { "year": 1910, "approx": true },
              "vocation": "teacher",
              "portrait": "p-0001.jpg",
              "portraitVideo": "p-0001.mp4",
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
        person.MiddleName!.Ru.Should().Be("Янович");
        person.MiddleName.Resolve("en").Should().Be("Yanovich");
        person.Sex.Should().Be(Sex.Female);
        person.Vocation.Should().Be(Vocation.Teacher);
        person.Birth.Year.Should().Be(1842);
        person.Birth.Place!.Resolve("en").Should().Be("Kraków");
        person.Death!.Approx.Should().BeTrue();
        person.IsDefaultRoot.Should().BeTrue();
        person.Portrait.Should().Be("p-0001.jpg");
        person.PortraitVideo.Should().Be("p-0001.mp4");
        person.Residences.Should().ContainSingle().Which.MapUrl.Should().Be("https://maps.google.com/x");
        // Seed rows predate the place-ID field, so it stays null without breaking the load.
        person.Residences.Should().ContainSingle().Which.PlaceId.Should().BeNull();
        person.Links.Should().ContainSingle().Which.Type.Should().Be("facebook");
        graph.Unions.Should().ContainSingle().Which.PartnerIds.Should().Equal("p-0001", "p-0002");
    }

    private static JsonFamilyDataLoader Loader(string source)
    {
        var environment = new Mock<IHostEnvironment>();
        environment.SetupGet(e => e.ContentRootPath).Returns(Path.GetTempPath());
        return new JsonFamilyDataLoader(
            Options.Create(new FamilyDataOptions { Source = source }),
            environment.Object,
            NullLogger<JsonFamilyDataLoader>.Instance);
    }

    [Fact]
    public async Task LoadAsync_WhenFileHasValidJson_ShouldReturnGraph()
    {
        var path = Path.Combine(Path.GetTempPath(), $"ft-seed-{Guid.NewGuid():N}.json");
        await File.WriteAllTextAsync(path, """
        { "people": [ { "id": "p1", "givenName": { "ru": "A" }, "surname": { "ru": "B" }, "birth": { "year": 1900 } } ], "unions": [] }
        """);
        try
        {
            var graph = await Loader(path).LoadAsync(default);

            graph.People.Should().ContainSingle().Which.Id.Should().Be("p1");
        }
        finally
        {
            File.Delete(path);
        }
    }

    [Fact]
    public async Task LoadAsync_WhenFileMissing_ShouldThrowFileNotFound()
    {
        var path = Path.Combine(Path.GetTempPath(), $"ft-missing-{Guid.NewGuid():N}.json");

        var act = async () => await Loader(path).LoadAsync(default);

        await act.Should().ThrowAsync<FileNotFoundException>();
    }

    [Fact]
    public async Task LoadAsync_WhenFileHasInvalidJson_ShouldThrow()
    {
        var path = Path.Combine(Path.GetTempPath(), $"ft-bad-{Guid.NewGuid():N}.json");
        await File.WriteAllTextAsync(path, "{ not json");
        try
        {
            var act = async () => await Loader(path).LoadAsync(default);

            await act.Should().ThrowAsync<Exception>();
        }
        finally
        {
            File.Delete(path);
        }
    }

    [Fact]
    public async Task LoadAsync_WhenFileIsJsonNull_ShouldThrowInvalidOperation()
    {
        // Valid JSON that deserializes to a null model — exercises the InvalidOperationException
        // arm of the loader's exception filter (distinct from the JsonException arm above).
        var path = Path.Combine(Path.GetTempPath(), $"ft-null-{Guid.NewGuid():N}.json");
        await File.WriteAllTextAsync(path, "null");
        try
        {
            var act = async () => await Loader(path).LoadAsync(default);

            await act.Should().ThrowAsync<InvalidOperationException>();
        }
        finally
        {
            File.Delete(path);
        }
    }
}
