namespace FamilyTree.Application.Dtos;

public sealed record PersonDto(
    string Id,
    string GivenName,
    string Surname,
    string? MaidenName,
    string Sex,
    LifeEventDto Birth,
    LifeEventDto? Death,
    string Vocation,
    string? Summary,
    string? Biography,
    string? Portrait,
    IReadOnlyList<string> Gallery,
    IReadOnlyList<SocialLinkDto> Links,
    IReadOnlyList<ResidenceDto> Residences,
    ParentsDto Parents,
    bool MarriedIntoFamily,
    bool IsDefaultRoot);
