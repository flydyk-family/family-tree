namespace FamilyTree.Api.Configuration;

public sealed class FamilyDataSettings
{
    public string Source { get; init; } = "Data/family.json";

    /// <summary>Optional path or gs:// URI of families.json. Empty means one family from <see cref="Source"/>.</summary>
    public string Registry { get; init; } = "";

    public int SnapshotTtlMinutes { get; init; } = 10;
}
