using FamilyTree.Application.Dtos;
using FluentValidation;

namespace FamilyTree.Application.People;

public sealed class UpdatePersonProfileValidator : AbstractValidator<UpdatePersonProfileCommand>
{
    private const int MinYear = 1000;
    private const int MaxYear = 2100;

    public UpdatePersonProfileValidator()
    {
        RuleFor(c => c.Id).NotEmpty().Matches("^p-\\d+$")
            .WithMessage("Person id must match the pattern 'p-<number>'.");
        RuleFor(c => c.EditorEmail).NotEmpty();
        RuleFor(c => c.Profile).NotNull();

        When(c => c.Profile is not null, () =>
        {
            RuleFor(c => c.Profile.BirthYear).InclusiveBetween(MinYear, MaxYear).When(c => c.Profile.BirthYear.HasValue);
            RuleFor(c => c.Profile.DeathYear).InclusiveBetween(MinYear, MaxYear).When(c => c.Profile.DeathYear.HasValue);
            RuleFor(c => c.Profile)
                .Must(p => !(p.BirthYear.HasValue && p.DeathYear.HasValue) || p.BirthYear!.Value <= p.DeathYear!.Value)
                .WithMessage("Birth year must not be after death year.");
            RuleFor(c => c.Profile.GivenName).Must(HaveLocaleWhenProvided).WithMessage("A provided given name must have at least one locale set.");
            RuleFor(c => c.Profile.Surname).Must(HaveLocaleWhenProvided).WithMessage("A provided surname must have at least one locale set.");
            RuleFor(c => c.Profile.MaidenName).Must(HaveLocaleWhenProvided).WithMessage("A provided maiden name must have at least one locale set.");
        });
    }

    // null name = "inherit seed" (fine). A provided name object must carry at least one locale.
    private static bool HaveLocaleWhenProvided(LocalizedTextDto? name)
    {
        if (name is null)
        {
            return true;
        }

        return !string.IsNullOrWhiteSpace(name.Ru)
            || !string.IsNullOrWhiteSpace(name.Be)
            || !string.IsNullOrWhiteSpace(name.En);
    }
}
