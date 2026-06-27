using FluentValidation;

namespace FamilyTree.Application.People;

public sealed class UpdatePersonBiographyValidator : AbstractValidator<UpdatePersonBiographyCommand>
{
    /// <summary>
    /// Maximum characters accepted per locale. Caps a persisted, publicly-served field so a
    /// single edit cannot bloat the snapshot/Firestore document or the graph payload shipped
    /// to every client. ~20k chars is far longer than any real biography yet well under
    /// Firestore's 1 MiB/document limit even across all three locales.
    /// </summary>
    public const int MaxLocaleLength = 20_000;

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

        // Cap each locale independently so one oversized field can't bloat the persisted,
        // publicly-served biography. Applied only when Biography is non-null (the NotNull
        // rule above already rejects null) so a missing payload still fails cleanly.
        When(command => command.Biography is not null, () =>
        {
            RuleFor(command => command.Biography.Ru).MaximumLength(MaxLocaleLength);
            RuleFor(command => command.Biography.Be).MaximumLength(MaxLocaleLength);
            RuleFor(command => command.Biography.En).MaximumLength(MaxLocaleLength);
        });

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
