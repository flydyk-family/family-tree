namespace FamilyTree.Infrastructure;

public interface IFamilyDataLoader
{
    Task<FamilyGraph> LoadAsync(CancellationToken cancellationToken);
}
