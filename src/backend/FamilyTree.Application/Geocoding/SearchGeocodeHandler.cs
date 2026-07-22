namespace FamilyTree.Application.Geocoding;

/// <summary>Delegates a free-text place search to the geocoding client.</summary>
public sealed class SearchGeocodeHandler : IRequestHandler<SearchGeocodeQuery, IReadOnlyList<GeocodePlaceDto>>
{
    private readonly IGeocodingClient _client;

    public SearchGeocodeHandler(IGeocodingClient client)
    {
        _client = client;
    }

    public async Task<IReadOnlyList<GeocodePlaceDto>> Handle(SearchGeocodeQuery request, CancellationToken cancellationToken)
    {
        var places = await _client.SearchAsync(request.Query, cancellationToken);
        return places.Select(p => new GeocodePlaceDto(p.Lat, p.Lng, p.Description, p.PlaceId)).ToList();
    }
}
