namespace FamilyTree.Application.Abstractions;

public interface IFamilyCatalogService
{
    Task<IReadOnlyList<FamilySummary>> GetFamiliesAsync(CancellationToken cancellationToken);
}
