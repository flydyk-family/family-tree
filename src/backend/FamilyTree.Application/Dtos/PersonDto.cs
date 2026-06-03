namespace FamilyTree.Application.Dtos;

public sealed record PersonDto(
    string Id,
    LocalizedTextDto GivenName,
    LocalizedTextDto Surname,
    LocalizedTextDto? MaidenName,
    string Sex,
    LifeEventDto Birth,
    LifeEventDto? Death,
    string Vocation,
    LocalizedTextDto? Summary,
    LocalizedTextDto? Biography,
    string? Portrait,
    IReadOnlyList<string> Gallery,
    IReadOnlyList<SocialLinkDto> Links,
    IReadOnlyList<ResidenceDto> Residences,
    ParentsDto Parents,
    bool MarriedIntoFamily,
    bool IsDefaultRoot);
