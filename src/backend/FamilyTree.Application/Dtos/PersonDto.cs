namespace FamilyTree.Application.Dtos;

public sealed record PersonDto(
    string Id,
    LocalizedTextDto GivenName,
    LocalizedTextDto Surname,
    LocalizedTextDto? MaidenName,
    LocalizedTextDto? MiddleName,
    string Sex,
    LifeEventDto Birth,
    LifeEventDto? Death,
    string Vocation,
    LocalizedTextDto? Summary,
    LocalizedTextDto? Biography,
    string? Portrait,
    string? PortraitThumb,
    string? PortraitVideo,
    IReadOnlyList<PhotoDto> Gallery,
    IReadOnlyList<SocialLinkDto> Links,
    IReadOnlyList<ResidenceDto> Residences,
    ParentsDto Parents,
    bool MarriedIntoFamily,
    bool IsDefaultRoot);
