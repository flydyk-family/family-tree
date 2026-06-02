using FamilyTree.Domain;

namespace FamilyTree.Application.Abstractions;

/// <summary>
/// Read access to the family dataset. Implemented today by an in-memory JSON-backed store;
/// the abstraction lets a database-backed implementation replace it without touching handlers.
/// </summary>
public interface IFamilyRepository
{
    Task<IReadOnlyList<Person>> GetAllAsync(CancellationToken cancellationToken);

    Task<Person?> GetByIdAsync(Guid id, CancellationToken cancellationToken);
}
