namespace FamilyTree.Application.Dtos;

/// <summary>The wire shape of a <c>PersonProfileOverride</c>: the editable scalar fields, each
/// nullable. A null field means "inherit the seed value"; the editor submits the full set.</summary>
public sealed record PersonProfileDto(
    LocalizedTextDto? GivenName,
    LocalizedTextDto? Surname,
    LocalizedTextDto? MaidenName,
    string? Sex,
    int? BirthYear,
    int? DeathYear,
    string? Vocation);
