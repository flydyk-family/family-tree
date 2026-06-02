using FamilyTree.Domain;

namespace FamilyTree.Application.Dtos;

/// <summary>
/// Full member detail shown in the popup. The "normal" layout uses the photo, dates, place and
/// key facts; the "expanded" layout adds <see cref="Bio"/> and <see cref="SocialLinks"/>.
/// </summary>
public sealed record MemberDetailDto(
    Guid Id,
    string DisplayName,
    Sex Sex,
    string? BirthDateText,
    string? DeathDateText,
    string? BirthPlace,
    string? PhotoUrl,
    IReadOnlyList<string> KeyFacts,
    string? Bio,
    IReadOnlyList<SocialLinkDto> SocialLinks);

public sealed record SocialLinkDto(string Kind, string Url);
