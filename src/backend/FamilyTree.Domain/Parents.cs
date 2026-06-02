namespace FamilyTree.Domain;

public sealed record Parents
{
    public string? MotherId { get; init; }
    public string? FatherId { get; init; }
}
