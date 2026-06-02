namespace FamilyTree.Infrastructure;

/// <summary>Configures where the JSON family dataset is read from.</summary>
public sealed class FamilyDataOptions
{
    public const string SectionName = "FamilyData";

    /// <summary>
    /// Path to the data file. Relative paths are resolved against the application base directory.
    /// Defaults to the <c>Data/family-data.json</c> copied next to the build output.
    /// </summary>
    public string FilePath { get; set; } = Path.Combine("Data", "family-data.json");
}
