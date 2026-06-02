using FamilyTree.Application.Abstractions;

namespace FamilyTree.Application.Services;

public sealed class FamilyQueryService : IFamilyQueryService
{
    private readonly IPersonRepository _persons;
    private readonly IUnionRepository _unions;

    public FamilyQueryService(IPersonRepository persons, IUnionRepository unions)
    {
        _persons = persons;
        _unions = unions;
    }

    public Task<IReadOnlyList<Person>> GetAllPeopleAsync(CancellationToken cancellationToken)
    {
        return _persons.GetAllAsync(cancellationToken);
    }

    public Task<Person?> GetPersonAsync(string id, CancellationToken cancellationToken)
    {
        return _persons.GetByIdAsync(id, cancellationToken);
    }

    public async Task<FamilyGraph> GetGraphAsync(CancellationToken cancellationToken)
    {
        var people = await _persons.GetAllAsync(cancellationToken);
        var unions = await _unions.GetAllAsync(cancellationToken);
        return new FamilyGraph(people, unions);
    }
}
