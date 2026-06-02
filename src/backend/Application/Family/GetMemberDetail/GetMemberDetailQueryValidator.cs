using FluentValidation;

namespace FamilyTree.Application.Family.GetMemberDetail;

public sealed class GetMemberDetailQueryValidator : AbstractValidator<GetMemberDetailQuery>
{
    public GetMemberDetailQueryValidator()
    {
        RuleFor(query => query.Id).NotEmpty();
    }
}
