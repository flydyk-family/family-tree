using FamilyTree.Application.Geocoding;

namespace FamilyTree.UnitTests.Geocoding;

public sealed class LocalizedNamesQueryValidatorTests
{
    private readonly LocalizedNamesQueryValidator _validator = new();

    [Fact]
    public void Validate_WhenPlaceIdEmpty_ShouldFail()
    {
        var result = _validator.Validate(new LocalizedNamesQuery(""));

        result.IsValid.Should().BeFalse();
    }

    [Fact]
    public void Validate_WhenPlaceIdExceedsMaxLength_ShouldFail()
    {
        var result = _validator.Validate(new LocalizedNamesQuery(new string('a', 201)));

        result.IsValid.Should().BeFalse();
    }

    [Fact]
    public void Validate_WhenPlaceIdReasonable_ShouldPass()
    {
        var result = _validator.Validate(new LocalizedNamesQuery("ChIJRVY_etDA1EER8AjJZ4-oXBg"));

        result.IsValid.Should().BeTrue();
    }
}
