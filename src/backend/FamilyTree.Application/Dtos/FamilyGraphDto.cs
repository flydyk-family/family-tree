namespace FamilyTree.Application.Dtos;

public sealed record FamilyGraphDto(
    IReadOnlyList<PersonSummaryDto> People,
    IReadOnlyList<UnionDto> Unions);
