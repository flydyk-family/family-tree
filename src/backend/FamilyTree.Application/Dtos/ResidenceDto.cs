namespace FamilyTree.Application.Dtos;

public sealed record ResidenceDto(
    LocalizedTextDto Place,
    int? FromYear,
    int? ToYear,
    double? Lat,
    double? Lng,
    string? MapUrl,
    string? PlaceId = null);
