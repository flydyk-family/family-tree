namespace FamilyTree.Infrastructure;

public sealed class FamilyDataOptions
{
    public const string SectionName = "FamilyData";

    public string FilePath { get; set; } = "Data/family.json";
}
