namespace FamilyTree.Infrastructure;

/// <summary>Server-side Google Geocoding API key. Used only by the backend geocoding proxy —
/// never sent to the browser. When unset, the geocoding client degrades quietly (empty
/// results, no HTTP call) instead of failing.</summary>
public sealed class GoogleMapsOptions
{
    public string GeocodingApiKey { get; init; } = "";
    public bool IsConfigured => !string.IsNullOrWhiteSpace(GeocodingApiKey);
}
