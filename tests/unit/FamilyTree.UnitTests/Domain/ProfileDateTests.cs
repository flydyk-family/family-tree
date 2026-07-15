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
