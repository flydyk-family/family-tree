namespace FamilyTree.Application.Geocoding;

/// <summary>Delegates reverse geocoding of a coordinate pair to the geocoding client.</summary>
public sealed class ReverseGeocodeHandler : IRequestHandler<ReverseGeocodeQuery, string?>
{
    private readonly IGeocodingClient _client;

    public ReverseGeocodeHandler(IGeocodingClient client)
    {
        _client = client;
    }

    public Task<string?> Handle(ReverseGeocodeQuery request, CancellationToken cancellationToken) =>
        _client.ReverseAsync(request.Lat, request.Lng, cancellationToken);
}
