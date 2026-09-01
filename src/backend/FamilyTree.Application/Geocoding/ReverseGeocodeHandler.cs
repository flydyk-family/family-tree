namespace FamilyTree.Application.Geocoding;

/// <summary>Reverse geocodes a coordinate pair to the settlement there, flattening the
/// geocoding client's result into the wire DTO (all-null when nothing was found).</summary>
public sealed class ReverseGeocodeHandler : IRequestHandler<ReverseGeocodeQuery, ReverseGeocodeResultDto>
{
    private readonly IGeocodingClient _client;

    public ReverseGeocodeHandler(IGeocodingClient client)
    {
        _client = client;
    }

    public async Task<ReverseGeocodeResultDto> Handle(ReverseGeocodeQuery request, CancellationToken cancellationToken)
    {
        var place = await _client.ReverseAsync(request.Lat, request.Lng, cancellationToken);
        if (place is null)
        {
            return new ReverseGeocodeResultDto(null, null, null, null);
        }

        var viewport = place.Viewport is { } v ? new GeocodeViewportDto(v.South, v.West, v.North, v.East) : null;
        return new ReverseGeocodeResultDto(place.PlaceId, place.Lat, place.Lng, viewport);
    }
}
