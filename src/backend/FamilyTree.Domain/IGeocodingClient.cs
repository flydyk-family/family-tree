namespace FamilyTree.Domain;

/// <summary>Server-side wrapper around the Google Geocoding web service. The API key never
/// reaches the browser — only the backend calls Google directly, so the key can stay
/// unrestricted without being scrapeable from the SPA bundle.</summary>
public interface IGeocodingClient
{
    /// <summary>Free-text place search. Returns up to 5 candidates, or an empty list when
    /// nothing matches or geocoding is unavailable/unconfigured.</summary>
    Task<IReadOnlyList<GeocodePlace>> SearchAsync(string query, CancellationToken cancellationToken);

    /// <summary>Resolves the place id of the top result at a coordinate pair, or null when
    /// nothing is found there or geocoding is unavailable/unconfigured.</summary>
    Task<string?> ReverseAsync(double lat, double lng, CancellationToken cancellationToken);

    /// <summary>Localized (ru/be/en) locality names for a place id, or null when geocoding is
    /// unavailable/unconfigured. When configured, a locale whose lookup does not resolve the
    /// place falls back to an empty string rather than failing the whole result.</summary>
    Task<LocalizedNames?> LocalizedNamesAsync(string placeId, CancellationToken cancellationToken);
}

/// <summary>A single geocoding search result. <paramref name="Viewport"/> is Google's
/// recommended framing for the place — null when the response omits it.</summary>
public sealed record GeocodePlace(double Lat, double Lng, string Description, string PlaceId, GeocodeViewport? Viewport = null);

/// <summary>A place's recommended map framing, as south/west/north/east degrees.</summary>
public sealed record GeocodeViewport(double South, double West, double North, double East);

/// <summary>A place's locality (or fallback) name in each app locale.</summary>
public sealed record LocalizedNames(string Ru, string Be, string En);
