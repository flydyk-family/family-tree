using FamilyTree.Application.Abstractions;
using FamilyTree.Application.Dtos;
using FamilyTree.Application.Formatting;
using FamilyTree.Application.Mapping;
using MediatR;

namespace FamilyTree.Application.Family.GetMemberDetail;

/// <summary>
/// Thin handler: fetches the member and composes the popup DTO using the Mapperly mapper for
/// social links and the formatters for the display name and approximate dates.
/// </summary>
public sealed class GetMemberDetailQueryHandler : IRequestHandler<GetMemberDetailQuery, MemberDetailDto?>
{
    private readonly IFamilyRepository _familyRepository;
    private readonly PersonMapper _personMapper;

    public GetMemberDetailQueryHandler(IFamilyRepository familyRepository, PersonMapper personMapper)
    {
        _familyRepository = familyRepository;
        _personMapper = personMapper;
    }

    public async Task<MemberDetailDto?> Handle(GetMemberDetailQuery request, CancellationToken cancellationToken)
    {
        var person = await _familyRepository.GetByIdAsync(request.Id, cancellationToken);

        if (person is null)
        {
            return null;
        }

        return new MemberDetailDto(
            person.Id,
            PersonNameFormatter.DisplayName(person),
            person.Sex,
            PartialDateFormatter.ToText(person.BirthDate),
            PartialDateFormatter.ToText(person.DeathDate),
            person.BirthPlace,
            person.PhotoUrl,
            person.KeyFacts,
            person.Bio,
            _personMapper.ToSocialLinkDtos(person.SocialLinks));
    }
}
