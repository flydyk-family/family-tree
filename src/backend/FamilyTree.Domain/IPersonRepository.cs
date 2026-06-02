namespace FamilyTree.Domain;

public interface IPersonRepository
{
    Task<IReadOnlyList<Person>> GetAllAsync(CancellationToken cancellationToken);
    Task<Person?> GetByIdAsync(string id, CancellationToken cancellationToken);
}
