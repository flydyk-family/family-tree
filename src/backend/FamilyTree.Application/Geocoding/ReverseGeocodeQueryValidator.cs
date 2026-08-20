using FluentValidation;

namespace FamilyTree.Application.Geocoding;

public sealed class ReverseGeocodeQueryValidator : AbstractValidator<ReverseGeocodeQuery>
{
    public ReverseGeocodeQueryValidator()
    {
        RuleFor(q => q.Lat).InclusiveBetween(-90, 90);
        RuleFor(q => q.Lng).InclusiveBetween(-180, 180);
    }
}
