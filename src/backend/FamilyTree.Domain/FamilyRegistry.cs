namespace FamilyTree.Domain;

/// <summary>One family tree the app serves: its id, resolved seed source, display name and
/// optional media key prefix.</summary>
public sealed record FamilyRegistryEntry(string Id, string Source, LocalizedText Name, string? MediaPrefix);

/// <summary>A registered family as the app lists it.</summary>
public sealed record FamilySummary(string Id, LocalizedText Name, bool IsDefault);

/// <summary>The family trees the app serves and which one is the default. The default family is
/// the one whose URLs and storage keys carry no family segment.</summary>
public sealed record FamilyRegistry(IReadOnlyList<FamilyRegistryEntry> Families, string DefaultFamilyId)
{
    /// <summary>The id of the synthesized family used when no registry is configured.</summary>
    public const string SyntheticId = "default";

    private const string SeedMediaRoot = "portraits";

    public FamilyRegistryEntry Default =>
        Find(DefaultFamilyId) ?? throw new InvalidOperationException($"Default family '{DefaultFamilyId}' is not registered.");

    public FamilyRegistryEntry? Find(string familyId) => Families.FirstOrDefault(family => family.Id == familyId);

    public bool Contains(string familyId) => Find(familyId) is not null;

    public bool IsDefault(string familyId) => familyId == DefaultFamilyId;

    /// <summary>The media key prefix for a family's seed media. The default family keeps the
    /// historical bare <c>portraits</c> prefix.</summary>
    public string MediaPrefixFor(string familyId)
    {
        if (Find(familyId)?.MediaPrefix is { Length: > 0 } configured)
        {
            return configured;
        }

        return IsDefault(familyId) ? SeedMediaRoot : $"{SeedMediaRoot}/{familyId}";
    }

    /// <summary>The one-family registry used when no registry file is configured.</summary>
    public static FamilyRegistry Single(string source) =>
        new([new FamilyRegistryEntry(SyntheticId, source, new LocalizedText(), null)], SyntheticId);
}
