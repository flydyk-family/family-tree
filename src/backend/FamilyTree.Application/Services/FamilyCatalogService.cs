using FamilyTree.Application.Abstractions;

namespace FamilyTree.Application.Services;

/// <summary>Lists the registered families from the singleton <see cref="FamilyRegistry"/>.</summary>
public sealed class FamilyCatalogService : IFamilyCatalogService
{
    private readonly FamilyRegistry _registry;

    public FamilyCatalogService(FamilyRegistry registry)
    {
        _registry = registry;
    }

    public Task<IReadOnlyList<FamilySummary>> GetFamiliesAsync(CancellationToken cancellationToken) =>
        Task.FromResult<IReadOnlyList<FamilySummary>>(
            [.. _registry.Families.Select(family => new FamilySummary(family.Id, family.Name, _registry.IsDefault(family.Id)))]);
}
