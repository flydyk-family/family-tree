namespace FamilyTree.Application.Geocoding;

/// <summary>The place id at a coordinate pair, or null when nothing was found there.</summary>
public sealed record ReverseGeocodeResultDto(string? PlaceId);
