using AwesomeAssertions;
using FamilyTree.Application.Formatting;
using FamilyTree.UnitTests.TestData;

namespace FamilyTree.UnitTests.Formatting;

public sealed class PersonNameFormatterTests
{
    private static readonly Guid AnyId = Guid.Parse("11111111-1111-1111-1111-111111111111");

    [Fact]
    public void DisplayName_WhenFamilyNamePresent_ShouldCombineGivenAndFamilyName()
    {
        var person = PersonFactory.Create(AnyId, givenName: "Johann", familyName: "Bauer");

        PersonNameFormatter.DisplayName(person).Should().Be("Johann Bauer");
    }

    [Fact]
    public void DisplayName_WhenFamilyNameMissing_ShouldReturnGivenNameOnly()
    {
        var person = PersonFactory.Create(AnyId, givenName: "Johann", familyName: null);

        PersonNameFormatter.DisplayName(person).Should().Be("Johann");
    }
}
