using FamilyTree.Domain;
using FamilyTree.Infrastructure;

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
        person.Sex.Should().Be(Sex.Female);
        person.Vocation.Should().Be(Vocation.Teacher);
        person.Birth.Year.Should().Be(1842);
        person.Birth.Place!.Resolve("en").Should().Be("Kraków");
        person.Death!.Approx.Should().BeTrue();
        person.IsDefaultRoot.Should().BeTrue();
        person.Portrait.Should().Be("p-0001.jpg");
        person.PortraitVideo.Should().Be("p-0001.mp4");
        person.Residences.Should().ContainSingle().Which.MapUrl.Should().Be("https://maps.google.com/x");
        person.Links.Should().ContainSingle().Which.Type.Should().Be("facebook");
        graph.Unions.Should().ContainSingle().Which.PartnerIds.Should().Equal("p-0001", "p-0002");
    }
}
