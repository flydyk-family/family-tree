namespace FamilyTree.Application.Geocoding;

/// <summary>Localized (ru/be/en) locality names for a place, keyed by Google's place id.</summary>
/// <param name="PlaceId">Google's stable place identifier.</param>
public sealed record LocalizedNamesQuery(string PlaceId) : IRequest<LocalizedNamesDto?>;
