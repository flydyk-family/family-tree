namespace FamilyTree.Application.Geocoding;

/// <summary>A single geocoding search candidate.</summary>
/// <param name="Lat">Latitude of the place.</param>
/// <param name="Lng">Longitude of the place.</param>
/// <param name="Description">Google's formatted address for the place.</param>
/// <param name="PlaceId">Google's stable place identifier.</param>
public sealed record GeocodePlaceDto(double Lat, double Lng, string Description, string PlaceId);
