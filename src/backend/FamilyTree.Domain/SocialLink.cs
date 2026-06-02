namespace FamilyTree.Domain;

public sealed record SocialLink
{
    public required string Type { get; init; }
    public required string Url { get; init; }
}
