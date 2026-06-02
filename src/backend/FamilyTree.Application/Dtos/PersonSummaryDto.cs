namespace FamilyTree.Application.Dtos;

public sealed record PersonSummaryDto(
    string Id,
    string GivenName,
    string Surname,
    string? MaidenName,
    string Sex,
    int? BirthYear,
    int? DeathYear,
    string Vocation,
    string? Portrait,
    ParentsDto Parents,
    bool MarriedIntoFamily,
    bool IsDefaultRoot);
