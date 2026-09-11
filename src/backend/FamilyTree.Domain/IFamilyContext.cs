namespace FamilyTree.Domain;

/// <summary>Which family tree the current request is about. Scoped: defaults to the registry's default
/// family and is set from the route by the family middleware.</summary>
public interface IFamilyContext
{
    string FamilyId { get; }
}

public sealed class FamilyContext : IFamilyContext
{
    public FamilyContext(FamilyRegistry registry)
    {
        FamilyId = registry.DefaultFamilyId;
    }

    public string FamilyId { get; set; }
}
