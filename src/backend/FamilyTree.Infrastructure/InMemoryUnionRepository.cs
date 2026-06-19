namespace FamilyTree.Infrastructure;

public sealed class InMemoryUnionRepository : IUnionRepository
{
    private readonly IFamilySnapshotProvider _snapshot;

    public InMemoryUnionRepository(IFamilySnapshotProvider snapshot)
    {
        _snapshot = snapshot;
    }

    public async Task<IReadOnlyList<Union>> GetAllAsync(CancellationToken cancellationToken)
    {
        var graph = await _snapshot.GetAsync(cancellationToken);
        return graph.Unions;
    }
}
