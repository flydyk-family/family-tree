using FamilyTree.Domain;

namespace FamilyTree.UnitTests.Domain;

public sealed class PersonTests
{
    [Fact]
    public void Person_WhenCollectionsOmitted_ShouldDefaultToEmptyNotNull()
    {
        var person = new Person
        {
            Id = "p-0001",
            GivenName = new LocalizedText { Ru = "Анна" },
            Surname = new LocalizedText { Ru = "Ковальская" },
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
