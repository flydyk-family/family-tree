using FamilyTree.Application.Geocoding;

namespace FamilyTree.UnitTests.Geocoding;

public sealed class ReverseGeocodeQueryValidatorTests
{
    private readonly ReverseGeocodeQueryValidator _validator = new();

    [Theory]
    [InlineData(-90, -180)]
    [InlineData(90, 180)]
    [InlineData(0, 0)]
    [InlineData(53.9, 27.5667)]
    public void Validate_WhenInBounds_ShouldPass(double lat, double lng)
    {
        var result = _validator.Validate(new ReverseGeocodeQuery(lat, lng));

        result.IsValid.Should().BeTrue();
    }

    [Theory]
    [InlineData(-90.0001, 0)]
    [InlineData(90.0001, 0)]
    [InlineData(0, -180.0001)]
    [InlineData(0, 180.0001)]
    public void Validate_WhenOutOfBounds_ShouldFail(double lat, double lng)
    {
        var result = _validator.Validate(new ReverseGeocodeQuery(lat, lng));

        result.IsValid.Should().BeFalse();
    }
}
