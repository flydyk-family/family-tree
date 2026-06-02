using FamilyTree.Application.Dtos;
using FamilyTree.Domain;
using Riok.Mapperly.Abstractions;

namespace FamilyTree.Application.Mapping;

/// <summary>
/// Source-generated (Riok.Mapperly, Apache-2.0) mapping for the straightforward parts of a member.
/// Computed/formatted fields (display name, date text) are produced by the handler, not here.
/// </summary>
[Mapper]
public partial class PersonMapper
{
    public partial IReadOnlyList<SocialLinkDto> ToSocialLinkDtos(IReadOnlyList<SocialLink> links);

    private partial SocialLinkDto ToSocialLinkDto(SocialLink link);
}
