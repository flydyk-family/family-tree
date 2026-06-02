using FamilyTree.Domain;

namespace FamilyTree.Application.Services;

/// <summary>
/// Memoized depth-first generation calculation over parent edges. Missing parent references are
/// treated as unknown roots; cycles are rejected rather than silently producing wrong levels.
/// </summary>
public sealed class GenerationCalculator : IGenerationCalculator
{
    public IReadOnlyDictionary<Guid, int> CalculateGenerations(IReadOnlyCollection<Person> people)
    {
        var byId = people.ToDictionary(person => person.Id);
        var generations = new Dictionary<Guid, int>(people.Count);
        var inProgress = new HashSet<Guid>();

        foreach (var person in people)
        {
            Resolve(person.Id, byId, generations, inProgress);
        }

        return generations;
    }

    private static int Resolve(
        Guid id,
        IReadOnlyDictionary<Guid, Person> byId,
        Dictionary<Guid, int> generations,
        HashSet<Guid> inProgress)
    {
        if (generations.TryGetValue(id, out var cached))
        {
            return cached;
        }

        if (!inProgress.Add(id))
        {
            throw new InvalidFamilyDataException($"Ancestry cycle detected involving person '{id}'.");
        }

        var person = byId[id];
        var parentLevels = new List<int>(capacity: 2);

        if (person.FatherId is { } fatherId && byId.ContainsKey(fatherId))
        {
            parentLevels.Add(Resolve(fatherId, byId, generations, inProgress));
        }

        if (person.MotherId is { } motherId && byId.ContainsKey(motherId))
        {
            parentLevels.Add(Resolve(motherId, byId, generations, inProgress));
        }

        var generation = parentLevels.Count == 0 ? 0 : parentLevels.Max() + 1;

        inProgress.Remove(id);
        generations[id] = generation;
        return generation;
    }
}
