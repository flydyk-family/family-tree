using FluentValidation;

namespace FamilyTree.Application.People;

public sealed class GetPersonByIdQueryValidator : AbstractValidator<GetPersonByIdQuery>
{
    public GetPersonByIdQueryValidator()
    {
        RuleFor(query => query.Id)
            .NotEmpty()
            .Matches("^p-\\d+$")
            .WithMessage("Person id must match the pattern 'p-<number>'.");
    }
}
