namespace FamilyTree.Application.Dtos;

public sealed record ResidenceDto(LocalizedTextDto Place, int? FromYear, int? ToYear, string? MapUrl);
