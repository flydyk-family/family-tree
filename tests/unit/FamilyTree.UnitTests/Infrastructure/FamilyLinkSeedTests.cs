using FamilyTree.Domain;
using FamilyTree.Infrastructure;

namespace FamilyTree.UnitTests.Infrastructure;

public sealed class FamilyLinkSeedTests
{
    [Fact]
    public void Deserialize_WhenPersonDeclaresFamilyLinks_ShouldReadRelationAndCounterpart()
    {
        var json = """
        { "people": [ { "id": "p-1", "givenName": { "en": "A" }, "surname": { "en": "B" },
            "birth": { "year": 1900 },
            "familyLinks": [ { "family": "kowalski", "personId": "p-42", "relation": "origin" },
                             { "family": "nowak", "relation": "joined" } ] } ],
          "unions": [] }
        """;

        var links = JsonFamilyDataLoader.Deserialize(json).People.Single().FamilyLinks;

        links.Should().Equal(
            new FamilyLink("kowalski", "p-42", FamilyLinkRelation.Origin),
            new FamilyLink("nowak", null, FamilyLinkRelation.Joined));
    }

    [Fact]
    public void Deserialize_WhenPersonHasNoFamilyLinks_ShouldDefaultToEmpty()
    {
        var json = """
        { "people": [ { "id": "p-1", "givenName": { "en": "A" }, "surname": { "en": "B" },
            "birth": { "year": 1900 } } ], "unions": [] }
        """;

        JsonFamilyDataLoader.Deserialize(json).People.Single().FamilyLinks.Should().BeEmpty();
    }
}
