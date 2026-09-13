namespace FamilyTree.Infrastructure;

/// <summary>Which families' data sources are currently degraded, across every created provider.</summary>
public interface IFamilyHealthRollup
{
    IReadOnlyList<string> DegradedFamilies { get; }
}
