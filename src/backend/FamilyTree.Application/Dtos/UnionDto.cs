namespace FamilyTree.Application.Dtos;

public sealed record UnionDto(
    string Id,
    IReadOnlyList<string> PartnerIds,
    int? MarriageYear,
    IReadOnlyList<string> ChildIds);
