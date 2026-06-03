namespace FamilyTree.Domain;

public interface IUnionRepository
{
    Task<IReadOnlyList<Union>> GetAllAsync(CancellationToken cancellationToken);
}
