namespace FamilyTree.Infrastructure;

public sealed class InMemoryPersonRepository : IPersonRepository
{
    private readonly IFamilySnapshotProvider _snapshot;

    public InMemoryPersonRepository(IFamilySnapshotProvider snapshot)
    {
        _snapshot = snapshot;
    }

    public async Task<IReadOnlyList<Person>> GetAllAsync(CancellationToken cancellationToken)
    {
        var graph = await _snapshot.GetAsync(cancellationToken);
        return graph.People;
    }

    public async Task<Person?> GetByIdAsync(string id, CancellationToken cancellationToken)
    {
        var graph = await _snapshot.GetAsync(cancellationToken);
        return graph.People.FirstOrDefault(person => person.Id == id);
    }
}
