using FamilyTree.Application.Abstractions;
using FamilyTree.Domain;

namespace FamilyTree.Infrastructure;

/// <summary>Serves family data from the in-memory <see cref="IFamilyDataStore"/>.</summary>
public sealed class JsonFamilyRepository : IFamilyRepository
{
    private readonly IFamilyDataStore _dataStore;

    public JsonFamilyRepository(IFamilyDataStore dataStore)
    {
        _dataStore = dataStore;
    }

    public Task<IReadOnlyList<Person>> GetAllAsync(CancellationToken cancellationToken)
    {
        return Task.FromResult(_dataStore.People);
    }

    public Task<Person?> GetByIdAsync(Guid id, CancellationToken cancellationToken)
    {
        return Task.FromResult(_dataStore.PeopleById.GetValueOrDefault(id));
    }
}
