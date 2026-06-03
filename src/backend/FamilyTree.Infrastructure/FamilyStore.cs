namespace FamilyTree.Infrastructure;

public sealed class FamilyStore
{
    public FamilyStore(IFamilyDataLoader loader)
    {
        var graph = loader.Load();
        People = graph.People;
        Unions = graph.Unions;
    }

    public IReadOnlyList<Person> People { get; }

    public IReadOnlyList<Union> Unions { get; }
}
