namespace FamilyTree.Application.Dtos;

public sealed record ResidenceDto(string Place, int? FromYear, int? ToYear, string? MapUrl);
