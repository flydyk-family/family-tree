namespace FamilyTree.Domain;

public sealed record Residence
{
    public required LocalizedText Place { get; init; }
    public int? FromYear { get; init; }
    public int? ToYear { get; init; }
    public double? Lat { get; init; }
    public double? Lng { get; init; }
    public string? MapUrl { get; init; }

    /// <summary>Google Maps place ID for the picked locality, when one was resolved. Lets the
    /// visitor link target the exact place (<c>query_place_id</c>) rather than an ambiguous name.</summary>
    public string? PlaceId { get; init; }
}
