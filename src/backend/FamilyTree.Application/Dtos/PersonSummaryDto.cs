namespace FamilyTree.Application.Dtos;

public sealed record PersonSummaryDto(
    string Id,
    LocalizedTextDto GivenName,
    LocalizedTextDto Surname,
    LocalizedTextDto? MaidenName,
    string Sex,
    int? BirthYear,
    int? DeathYear,
    LocalizedTextDto? BirthPlace,
    string Vocation,
    string? Portrait,
    string? PortraitThumb,
    string? PortraitVideo,
    ParentsDto Parents,
    bool MarriedIntoFamily,
    bool IsDefaultRoot);
