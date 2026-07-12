using FamilyTree.Domain;

namespace FamilyTree.Infrastructure;

/// <summary>
/// Rejects a temporally impossible birth year:
///
///   parent.birth  &lt;  person.birth  &lt;  child.birth
///
/// Unknown (null) years on the other party are skipped — we only reject a KNOWN violation.
/// </summary>
public sealed class FamilyGraphValidator : IFamilyGraphValidator
{
    public GraphValidationResult ValidateBirthYear(FamilyGraph graph, string personId, int? newBirthYear)
    {
        if (newBirthYear is null)
        {
            return GraphValidationResult.Ok();
        }

        var byId = graph.People.ToDictionary(p => p.Id, StringComparer.Ordinal);
        if (!byId.TryGetValue(personId, out var person))
        {
            return GraphValidationResult.Ok();
        }

        foreach (var parentId in new[] { person.Parents.FatherId, person.Parents.MotherId })
        {
            if (parentId is not null && byId.TryGetValue(parentId, out var parent) && parent.Birth.Year is { } py && newBirthYear <= py)
            {
                return GraphValidationResult.Fail($"Birth year {newBirthYear} must be after a parent's birth year ({py}).");
            }
        }

        foreach (var child in graph.People)
        {
            if ((child.Parents.FatherId == personId || child.Parents.MotherId == personId)
                && child.Birth.Year is { } cy && newBirthYear >= cy)
            {
                return GraphValidationResult.Fail($"Birth year {newBirthYear} must be before a child's birth year ({cy}).");
            }
        }

        return GraphValidationResult.Ok();
    }
}
