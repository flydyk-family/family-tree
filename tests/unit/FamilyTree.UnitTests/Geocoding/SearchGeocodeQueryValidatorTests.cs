using FamilyTree.Application.Geocoding;

namespace FamilyTree.UnitTests.Geocoding;

public sealed class SearchGeocodeQueryValidatorTests
{
    private readonly SearchGeocodeQueryValidator _validator = new();

    [Fact]
    public void Validate_WhenQueryEmpty_ShouldFail()
    {
        var result = _validator.Validate(new SearchGeocodeQuery(""));

        result.IsValid.Should().BeFalse();
    }

    [Fact]
    public void Validate_WhenQueryExceedsMaxLength_ShouldFail()
    {
        var result = _validator.Validate(new SearchGeocodeQuery(new string('a', 201)));

        result.IsValid.Should().BeFalse();
    }

    [Fact]
    public void Validate_WhenQueryReasonable_ShouldPass()
    {
        var result = _validator.Validate(new SearchGeocodeQuery("Minsk"));

        result.IsValid.Should().BeTrue();
    }
}
