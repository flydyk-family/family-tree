namespace FamilyTree.Api.Configuration;

/// <summary>Server-side Google Geocoding API key, mirroring GoogleMapsOptions in Infrastructure.</summary>
public sealed class GoogleMapsSettings
{
    public string GeocodingApiKey { get; init; } = "";
}
