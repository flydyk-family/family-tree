namespace FamilyTree.Infrastructure;

public sealed record Session
{
    public required string Email { get; init; }
    public required string Name { get; init; }
    public bool CanEdit { get; init; }
    public DateTimeOffset CreatedAt { get; init; }
    public DateTimeOffset ExpiresAt { get; init; }
}
