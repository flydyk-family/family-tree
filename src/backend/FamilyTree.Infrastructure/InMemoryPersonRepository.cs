namespace FamilyTree.Infrastructure;

public sealed class InMemoryPersonRepository : IPersonRepository
{
    private readonly FamilyStore _store;

    public InMemoryPersonRepository(FamilyStore store)
    {
        _store = store;
    }

    public Task<IReadOnlyList<Person>> GetAllAsync(CancellationToken cancellationToken)
    {
        return Task.FromResult(_store.People);
    }

    public Task<Person?> GetByIdAsync(string id, CancellationToken cancellationToken)
    {
        var person = _store.People.FirstOrDefault(candidate => candidate.Id == id);
        return Task.FromResult(person);
    }
}
