namespace FamilyTree.Application.Geocoding;

/// <summary>Free-text place search, e.g. for the residence map picker's search box.</summary>
/// <param name="Query">The user-entered search text.</param>
public sealed record SearchGeocodeQuery(string Query) : IRequest<IReadOnlyList<GeocodePlaceDto>>;
