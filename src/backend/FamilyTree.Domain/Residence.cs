namespace FamilyTree.Domain;

public sealed record Residence
{
    public required LocalizedText Place { get; init; }
    public int? FromYear { get; init; }
    public int? ToYear { get; init; }
    public string? MapUrl { get; init; }
}
