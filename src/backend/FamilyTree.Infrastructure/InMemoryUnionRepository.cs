namespace FamilyTree.Infrastructure;

public sealed class InMemoryUnionRepository : IUnionRepository
{
    private readonly FamilyStore _store;

    public InMemoryUnionRepository(FamilyStore store)
    {
        _store = store;
    }

    public Task<IReadOnlyList<Union>> GetAllAsync(CancellationToken cancellationToken)
    {
        return Task.FromResult(_store.Unions);
    }
}
