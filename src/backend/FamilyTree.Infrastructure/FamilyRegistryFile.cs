namespace FamilyTree.Infrastructure;

internal sealed record FamilyRegistryFile
{
    public string? DefaultFamily { get; init; }
    public IReadOnlyList<FamilyRegistryFileEntry> Families { get; init; } = [];
}

internal sealed record FamilyRegistryFileEntry
{
    public string? Id { get; init; }
    public string? Source { get; init; }
    public LocalizedText? Name { get; init; }
    public string? MediaPrefix { get; init; }
}
