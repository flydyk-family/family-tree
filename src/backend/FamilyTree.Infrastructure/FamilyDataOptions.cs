namespace FamilyTree.Infrastructure;

public sealed class FamilyDataOptions
{
    public string FilePath { get; set; } = "Data/family.json";

    /// <summary>
    /// How long the merged family snapshot is served from memory before the next read
    /// re-reads family.json and re-pulls overrides. A save refreshes it immediately.
    /// </summary>
    public int SnapshotTtlMinutes { get; set; } = 10;
}
