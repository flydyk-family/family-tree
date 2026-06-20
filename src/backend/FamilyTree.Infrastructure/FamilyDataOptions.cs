namespace FamilyTree.Infrastructure;

public sealed class FamilyDataOptions
{
    /// <summary>
    /// Where the seed graph is read from: a local file path (default, used in dev/tests)
    /// or a "gs://bucket/object" URI (used in deployment). The loader is selected by this value.
    /// </summary>
    public string Source { get; set; } = "Data/family.json";

    /// <summary>
    /// True when <see cref="Source"/> is a "gs://" URI (read from Cloud Storage) rather
    /// than a local file path. The single home for the scheme check, used by loader selection.
    /// </summary>
    public bool IsGcsSource => Source.StartsWith("gs://", StringComparison.OrdinalIgnoreCase);

    /// <summary>
    /// How long the merged family snapshot is served from memory before the next read
    /// re-reads the seed and re-pulls overrides. A save refreshes it immediately.
    /// </summary>
    public int SnapshotTtlMinutes { get; set; } = 10;
}
