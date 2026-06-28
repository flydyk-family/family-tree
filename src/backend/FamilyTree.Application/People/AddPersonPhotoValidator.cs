using FluentValidation;

namespace FamilyTree.Application.People;

/// <summary>Validates an <see cref="AddPersonPhotoCommand"/> before it reaches the handler.</summary>
public sealed class AddPersonPhotoValidator : AbstractValidator<AddPersonPhotoCommand>
{
    /// <summary>Maximum accepted upload size in bytes (15 MiB).</summary>
    private const long MaxBytes = 15_728_640;

    public AddPersonPhotoValidator()
    {
        RuleFor(c => c.Id).Matches("^p-\\d+$")
            .WithMessage("Person id must match the pattern 'p-<number>'.");
        RuleFor(c => c.Content).NotEmpty()
            .Must(c => c.LongLength <= MaxBytes)
            .WithMessage("The image exceeds the maximum upload size.");
        RuleFor(c => c.Role).IsInEnum();
    }
}
