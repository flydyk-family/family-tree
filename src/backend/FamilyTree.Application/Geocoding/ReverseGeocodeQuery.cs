namespace FamilyTree.Application.Geocoding;

/// <summary>Reverse geocoding for a dropped/dragged map pin.</summary>
/// <param name="Lat">Latitude, in [-90, 90].</param>
/// <param name="Lng">Longitude, in [-180, 180].</param>
public sealed record ReverseGeocodeQuery(double Lat, double Lng) : IRequest<string?>;
