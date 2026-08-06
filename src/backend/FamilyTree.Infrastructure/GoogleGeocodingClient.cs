using System.Globalization;
using System.Net.Http.Json;
using System.Text.Json;
using System.Text.Json.Serialization;
using FamilyTree.Domain;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;

namespace FamilyTree.Infrastructure;

/// <summary>Calls the Google Geocoding web service with the server-side API key.</summary>
public sealed class GoogleGeocodingClient : IGeocodingClient
{
    private const int MaxSearchResults = 5;
    private static readonly string[] Locales = ["ru", "be", "en"];
    private static readonly JsonSerializerOptions JsonOptions = new(JsonSerializerDefaults.Web);

    private readonly HttpClient _httpClient;
    private readonly GoogleMapsOptions _options;
    private readonly ILogger<GoogleGeocodingClient> _logger;

    public GoogleGeocodingClient(HttpClient httpClient, IOptions<GoogleMapsOptions> options, ILogger<GoogleGeocodingClient> logger)
    {
        _httpClient = httpClient;
        _options = options.Value;
        _logger = logger;
    }

    public async Task<IReadOnlyList<GeocodePlace>> SearchAsync(string query, CancellationToken cancellationToken)
    {
        if (!_options.IsConfigured)
        {
            return [];
        }

        var response = await FetchAsync($"maps/api/geocode/json?address={Uri.EscapeDataString(query)}&language=en", cancellationToken);
        if (response?.Results is null)
        {
            return [];
        }

        return response.Results
            .Take(MaxSearchResults)
            .Select(r => new GeocodePlace(r.Geometry.Location.Lat, r.Geometry.Location.Lng, r.FormattedAddress, r.PlaceId, ViewportOf(r.Geometry)))
            .ToList();
    }

    public async Task<string?> ReverseAsync(double lat, double lng, CancellationToken cancellationToken)
    {
        if (!_options.IsConfigured)
        {
            return null;
        }

        var latLng = string.Create(CultureInfo.InvariantCulture, $"{lat},{lng}");
        var response = await FetchAsync($"maps/api/geocode/json?latlng={Uri.EscapeDataString(latLng)}&language=en", cancellationToken);
        return response?.Results is [var top, ..] ? top.PlaceId : null;
    }

    public async Task<LocalizedNames?> LocalizedNamesAsync(string placeId, CancellationToken cancellationToken)
    {
        if (!_options.IsConfigured)
        {
            return null;
        }

        // Deliberately 3 concurrent calls (one per app locale) — the Geocoding web service has
        // no multi-language mode, so this is the only way to get all three names, and it costs
        // 3 requests per residence pick. Accepted: picks are rare, editor-gated, and far inside
        // the free tier. Revisit (cache by place id) only if quota ever becomes a concern.
        var responses = await Task.WhenAll(Locales.Select(locale => FetchAsync(
            $"maps/api/geocode/json?place_id={Uri.EscapeDataString(placeId)}&language={locale}", cancellationToken)));
        var names = responses
            .Select(response => NameFor(response?.Results?.Count > 0 ? response.Results[0] : null) ?? "")
            .ToArray();

        return new LocalizedNames(names[0], names[1], names[2]);
    }

    private static GeocodeViewport? ViewportOf(GeocodeGeometry geometry) =>
        geometry.Viewport is { } v
            ? new GeocodeViewport(v.Southwest.Lat, v.Southwest.Lng, v.Northeast.Lat, v.Northeast.Lng)
            : null;

    private static string? NameFor(GeocodeResult? result)
    {
        if (result is null)
        {
            return null;
        }

        var locality = result.AddressComponents?.FirstOrDefault(c => c.Types.Contains("locality"))
            ?? result.AddressComponents?.FirstOrDefault(c => c.Types.Contains("administrative_area_level_2"));
        return locality?.LongName ?? result.FormattedAddress;
    }

    private async Task<GeocodeResponse?> FetchAsync(string relativeUrl, CancellationToken cancellationToken)
    {
        // The key is appended here (never logged, never included in any exception message)
        // rather than baked into relativeUrl so callers never build a URL that carries it.
        var url = $"{relativeUrl}&key={Uri.EscapeDataString(_options.GeocodingApiKey)}";

        HttpResponseMessage httpResponse;
        try
        {
            httpResponse = await _httpClient.GetAsync(url, cancellationToken);
        }
        catch (HttpRequestException ex)
        {
            _logger.LogWarning(ex, "Geocoding request failed.");
            return null;
        }
        catch (TaskCanceledException ex) when (!cancellationToken.IsCancellationRequested)
        {
            _logger.LogWarning(ex, "Geocoding request timed out.");
            return null;
        }

        using (httpResponse)
        {
            if (!httpResponse.IsSuccessStatusCode)
            {
                _logger.LogWarning("Geocoding request returned HTTP {StatusCode}.", (int)httpResponse.StatusCode);
                return null;
            }

            GeocodeResponse? payload;
            try
            {
                payload = await httpResponse.Content.ReadFromJsonAsync<GeocodeResponse>(JsonOptions, cancellationToken);
            }
            catch (JsonException ex)
            {
                _logger.LogWarning(ex, "Geocoding response could not be parsed.");
                return null;
            }

            if (payload is null || payload.Status != "OK")
            {
                var status = payload?.Status ?? "unknown";
                // ZERO_RESULTS is a normal answer ("no such place"); everything else means the
                // proxy is degraded — a revoked key, an exhausted quota, a malformed request.
                // Those must not hide at Debug (off in production), where a dead geocoder would
                // look indistinguishable from a search that simply found nothing.
                if (status == "ZERO_RESULTS")
                {
                    _logger.LogDebug("Geocoding returned no results.");
                }
                else
                {
                    _logger.LogWarning("Geocoding request failed with status {Status}.", status);
                }

                return null;
            }

            return payload;
        }
    }

    private sealed record GeocodeResponse(string Status, IReadOnlyList<GeocodeResult>? Results);

    private sealed record GeocodeResult(
        [property: JsonPropertyName("place_id")] string PlaceId,
        [property: JsonPropertyName("formatted_address")] string FormattedAddress,
        GeocodeGeometry Geometry,
        [property: JsonPropertyName("address_components")] IReadOnlyList<AddressComponent>? AddressComponents);

    private sealed record GeocodeGeometry(GeocodeLocation Location, GeocodeViewportJson? Viewport);

    private sealed record GeocodeViewportJson(GeocodeLocation Northeast, GeocodeLocation Southwest);

    private sealed record GeocodeLocation(double Lat, double Lng);

    private sealed record AddressComponent(
        [property: JsonPropertyName("long_name")] string LongName,
        IReadOnlyList<string> Types);
}
