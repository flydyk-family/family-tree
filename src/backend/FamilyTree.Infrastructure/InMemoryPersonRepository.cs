namespace FamilyTree.Infrastructure;

public sealed class InMemoryPersonRepository : IPersonRepository
{
    private readonly FamilyStore _store;
    private readonly IPersonOverrideStore _overrides;

    public InMemoryPersonRepository(FamilyStore store, IPersonOverrideStore overrides)
    {
        _store = store;
        _overrides = overrides;
    }

    public async Task<IReadOnlyList<Person>> GetAllAsync(CancellationToken cancellationToken)
    {
        var latest = await _overrides.GetLatestBiographiesAsync(cancellationToken);
        if (latest.Count == 0)
        {
            return _store.People;
        }

        return _store.People
            .Select(person => latest.TryGetValue(person.Id, out var biography)
                ? person with { Biography = biography }
                : person)
            .ToList();
    }

    public async Task<Person?> GetByIdAsync(string id, CancellationToken cancellationToken)
    {
        var person = _store.People.FirstOrDefault(candidate => candidate.Id == id);
        if (person is null)
        {
            return null;
        }

        var biography = await _overrides.GetLatestBiographyAsync(id, cancellationToken);
        return biography is null ? person : person with { Biography = biography };
    }
}
