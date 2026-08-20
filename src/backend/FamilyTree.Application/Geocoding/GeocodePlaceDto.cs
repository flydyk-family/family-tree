namespace FamilyTree.Application.Geocoding;

/// <summary>A single geocoding search candidate.</summary>
/// <param name="Lat">Latitude of the place.</param>
/// <param name="Lng">Longitude of the place.</param>
/// <param name="Description">Google's formatted address for the place.</param>
/// <param name="PlaceId">Google's stable place identifier.</param>
/// <param name="Viewport">Google's recommended framing for the place, so the picker can show
/// the whole locality rather than zooming to its centre point. Null when Google omits it.</param>
public sealed record GeocodePlaceDto(double Lat, double Lng, string Description, string PlaceId, GeocodeViewportDto? Viewport);

/// <summary>A place's recommended map framing, as south/west/north/east degrees.</summary>
public sealed record GeocodeViewportDto(double South, double West, double North, double East);
