using FluentValidation;

namespace FamilyTree.Application.Geocoding;

public sealed class SearchGeocodeQueryValidator : AbstractValidator<SearchGeocodeQuery>
{
    private const int MaxQueryLength = 200;

    public SearchGeocodeQueryValidator()
    {
        RuleFor(q => q.Query)
            .NotEmpty()
            .MaximumLength(MaxQueryLength);
    }
}
