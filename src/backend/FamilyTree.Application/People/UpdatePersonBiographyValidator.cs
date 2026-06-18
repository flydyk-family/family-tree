using FluentValidation;

namespace FamilyTree.Application.People;

public sealed class UpdatePersonBiographyValidator : AbstractValidator<UpdatePersonBiographyCommand>
{
    public UpdatePersonBiographyValidator()
    {
        RuleFor(command => command.Id)
            .NotEmpty()
            .Matches("^p-\\d+$")
            .WithMessage("Person id must match the pattern 'p-<number>'.");

        RuleFor(command => command.Biography)
            .NotNull()
            .Must(HaveAtLeastOneLocale)
            .WithMessage("Biography must have at least one of Ru, Be, or En set.");

        RuleFor(command => command.EditorEmail)
            .NotEmpty();
    }

    private static bool HaveAtLeastOneLocale(LocalizedTextDto? biography)
    {
        if (biography is null)
        {
            return false;
        }

        return !string.IsNullOrWhiteSpace(biography.Ru)
            || !string.IsNullOrWhiteSpace(biography.Be)
            || !string.IsNullOrWhiteSpace(biography.En);
    }
}
