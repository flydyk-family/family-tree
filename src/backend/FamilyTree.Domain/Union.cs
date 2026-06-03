namespace FamilyTree.Domain;

public sealed record Union
{
    public required string Id { get; init; }
    public IReadOnlyList<string> PartnerIds { get; init; } = [];
    public int? MarriageYear { get; init; }
    public IReadOnlyList<string> ChildIds { get; init; } = [];
}
