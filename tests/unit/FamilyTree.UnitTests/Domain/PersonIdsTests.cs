using FamilyTree.Domain;

namespace FamilyTree.UnitTests.Domain;

public sealed class PersonIdsTests
{
    [Theory]
    [InlineData("p-1", true)]
    [InlineData("p-0001", true)]
    [InlineData("p-", false)]
    [InlineData("p-12a", false)]
    [InlineData("k-0001", false)]
    [InlineData("P-0001", false)]
    [InlineData(" p-0001", false)]
    [InlineData("", false)]
    [InlineData(null, false)]
    public void IsValid_WhenGivenAnId_ShouldMatchThePDigitsRule(string? id, bool expected) =>
        PersonIds.IsValid(id).Should().Be(expected);
}
