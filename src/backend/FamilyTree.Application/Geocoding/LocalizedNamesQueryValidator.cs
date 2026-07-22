using FluentValidation;

namespace FamilyTree.Application.Geocoding;

public sealed class LocalizedNamesQueryValidator : AbstractValidator<LocalizedNamesQuery>
{
    private const int MaxPlaceIdLength = 200;

    public LocalizedNamesQueryValidator()
    {
        RuleFor(q => q.PlaceId)
            .NotEmpty()
            .MaximumLength(MaxPlaceIdLength);
    }
}
