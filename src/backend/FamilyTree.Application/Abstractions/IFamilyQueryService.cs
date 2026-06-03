namespace FamilyTree.Application.Abstractions;

public interface IFamilyQueryService
{
    Task<IReadOnlyList<Person>> GetAllPeopleAsync(CancellationToken cancellationToken);
    Task<Person?> GetPersonAsync(string id, CancellationToken cancellationToken);
    Task<FamilyGraph> GetGraphAsync(CancellationToken cancellationToken);
}
