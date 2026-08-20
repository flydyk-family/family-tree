namespace FamilyTree.Application.Geocoding;

/// <summary>Delegates localized-name lookup for a place id to the geocoding client.</summary>
public sealed class LocalizedNamesHandler : IRequestHandler<LocalizedNamesQuery, LocalizedNamesDto?>
{
    private readonly IGeocodingClient _client;

    public LocalizedNamesHandler(IGeocodingClient client)
    {
        _client = client;
    }

    public async Task<LocalizedNamesDto?> Handle(LocalizedNamesQuery request, CancellationToken cancellationToken)
    {
        var names = await _client.LocalizedNamesAsync(request.PlaceId, cancellationToken);
        return names is null ? null : new LocalizedNamesDto(names.Ru, names.Be, names.En);
    }
}
