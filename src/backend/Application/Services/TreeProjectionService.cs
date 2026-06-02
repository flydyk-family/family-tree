using FamilyTree.Application.Dtos;
using FamilyTree.Application.Formatting;
using FamilyTree.Domain;

namespace FamilyTree.Application.Services;

/// <summary>
/// Builds the tree projection: assigns generations, marks leaves (members nobody calls a parent),
/// and emits parent/child and spouse edges. Spouse pairs are emitted once despite symmetric data.
/// </summary>
public sealed class TreeProjectionService : ITreeProjectionService
{
    private readonly IGenerationCalculator _generationCalculator;

    public TreeProjectionService(IGenerationCalculator generationCalculator)
    {
        _generationCalculator = generationCalculator;
    }

    public FamilyTreeDto BuildTree(IReadOnlyCollection<Person> people)
    {
        if (people.Count == 0)
        {
            return new FamilyTreeDto([], [], MinGeneration: 0, MaxGeneration: 0);
        }

        var generations = _generationCalculator.CalculateGenerations(people);
        var presentIds = people.Select(person => person.Id).ToHashSet();
        var parentIds = CollectParentIds(people);

        var nodes = new List<TreeNodeDto>(people.Count);
        var edges = new List<TreeEdgeDto>();
        var spousePairs = new HashSet<(Guid, Guid)>();

        foreach (var person in people)
        {
            nodes.Add(new TreeNodeDto(
                person.Id,
                PersonNameFormatter.DisplayName(person),
                generations[person.Id],
                person.Sex,
                person.BirthDate?.Year,
                person.DeathDate?.Year,
                person.PhotoUrl,
                IsLeaf: !parentIds.Contains(person.Id)));

            AddParentEdge(edges, person.FatherId, person.Id, presentIds);
            AddParentEdge(edges, person.MotherId, person.Id, presentIds);
            CollectSpousePairs(spousePairs, person, presentIds);
        }

        foreach (var (first, second) in spousePairs)
        {
            edges.Add(new TreeEdgeDto(first, second, EdgeKind.Spouse));
        }

        return new FamilyTreeDto(nodes, edges, generations.Values.Min(), generations.Values.Max());
    }

    private static HashSet<Guid> CollectParentIds(IReadOnlyCollection<Person> people)
    {
        var parentIds = new HashSet<Guid>();
        foreach (var person in people)
        {
            if (person.FatherId is { } fatherId)
            {
                parentIds.Add(fatherId);
            }

            if (person.MotherId is { } motherId)
            {
                parentIds.Add(motherId);
            }
        }

        return parentIds;
    }

    private static void AddParentEdge(List<TreeEdgeDto> edges, Guid? parentId, Guid childId, HashSet<Guid> presentIds)
    {
        if (parentId is { } id && presentIds.Contains(id))
        {
            edges.Add(new TreeEdgeDto(id, childId, EdgeKind.ParentChild));
        }
    }

    private static void CollectSpousePairs(HashSet<(Guid, Guid)> pairs, Person person, HashSet<Guid> presentIds)
    {
        foreach (var spouseId in person.SpouseIds)
        {
            if (spouseId == person.Id || !presentIds.Contains(spouseId))
            {
                continue;
            }

            // Normalise to an unordered pair so the marriage is emitted exactly once, even if the
            // data only records the link on one of the two partners.
            var pair = person.Id.CompareTo(spouseId) < 0
                ? (person.Id, spouseId)
                : (spouseId, person.Id);
            pairs.Add(pair);
        }
    }
}
