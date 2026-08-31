namespace FamilyTree.Application.Geocoding;

/// <summary>The settlement at a coordinate pair: its place id, canonical centre (so the
/// picker can snap the pin onto the town), and recommended framing. Every field is null when
/// nothing was found there.</summary>
public sealed record ReverseGeocodeResultDto(string? PlaceId, double? Lat, double? Lng, GeocodeViewportDto? Viewport);
