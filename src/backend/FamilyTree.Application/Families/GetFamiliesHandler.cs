using FamilyTree.Application.Abstractions;

namespace FamilyTree.Application.Families;

/// <summary>Lists the registered families, thinly delegating to <see cref="IFamilyCatalogService"/>.</summary>
public sealed class GetFamiliesHandler : IRequestHandler<GetFamiliesQuery, IReadOnlyList<FamilySummaryDto>>
{
    private readonly IFamilyCatalogService _catalog;
    private readonly IMapper _mapper;

    public GetFamiliesHandler(IFamilyCatalogService catalog, IMapper mapper)
    {
        _catalog = catalog;
        _mapper = mapper;
    }

    public async Task<IReadOnlyList<FamilySummaryDto>> Handle(GetFamiliesQuery request, CancellationToken cancellationToken)
    {
        var families = await _catalog.GetFamiliesAsync(cancellationToken);
        return _mapper.Map<List<FamilySummaryDto>>(families);
    }
}
