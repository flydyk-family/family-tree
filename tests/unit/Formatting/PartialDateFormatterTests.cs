using AwesomeAssertions;
using FamilyTree.Application.Formatting;
using FamilyTree.Domain;

namespace FamilyTree.UnitTests.Formatting;

public sealed class PartialDateFormatterTests
{
    [Fact]
    public void ToText_WhenDateIsNull_ShouldReturnNull()
    {
        PartialDateFormatter.ToText(null).Should().BeNull();
    }

    [Fact]
    public void ToText_WhenOnlyYearKnown_ShouldReturnYear()
    {
        PartialDateFormatter.ToText(new PartialDate(1740)).Should().Be("1740");
    }

    [Fact]
    public void ToText_WhenYearAndMonthKnown_ShouldReturnMonthAndYear()
    {
        PartialDateFormatter.ToText(new PartialDate(1740, 3)).Should().Be("Mar 1740");
    }

    [Fact]
    public void ToText_WhenFullDateKnown_ShouldReturnDayMonthYear()
    {
        PartialDateFormatter.ToText(new PartialDate(1740, 3, 12)).Should().Be("12 Mar 1740");
    }

    [Fact]
    public void ToText_WhenMonthOutOfRange_ShouldFallBackToYear()
    {
        PartialDateFormatter.ToText(new PartialDate(1740, 13)).Should().Be("1740");
    }

    [Fact]
    public void ToText_WhenDayExceedsMonthLength_ShouldFallBackToMonthAndYear()
    {
        // February 1740 has 29 days (leap year); day 30 is impossible.
        PartialDateFormatter.ToText(new PartialDate(1740, 2, 30)).Should().Be("Feb 1740");
    }
}
