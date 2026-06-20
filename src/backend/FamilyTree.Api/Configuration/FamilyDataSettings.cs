namespace FamilyTree.Api.Configuration;

public sealed class FamilyDataSettings
{
    public string Source { get; init; } = "Data/family.json";

    public int SnapshotTtlMinutes { get; init; } = 10;
}
