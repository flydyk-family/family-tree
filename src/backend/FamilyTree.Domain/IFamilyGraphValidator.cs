namespace FamilyTree.Domain;

public readonly record struct GraphValidationResult(bool IsValid, string? Error)
{
    public static GraphValidationResult Ok() => new(true, null);
    public static GraphValidationResult Fail(string error) => new(false, error);
}

/// <summary>Cross-entity validation that a single-record validator cannot do: it needs the
/// whole graph to check a person's proposed birth year against parents and children.</summary>
public interface IFamilyGraphValidator
{
    GraphValidationResult ValidateBirthYear(FamilyGraph graph, string personId, int? newBirthYear);
}
