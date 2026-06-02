using FamilyTree.Application.Abstractions;

namespace FamilyTree.Application.Family;

public sealed class GetFamilyGraphHandler : IRequestHandler<GetFamilyGraphQuery, FamilyGraphDto>
{
    private readonly IFamilyQueryService _service;
    private readonly IMapper _mapper;

    public GetFamilyGraphHandler(IFamilyQueryService service, IMapper mapper)
    {
        _service = service;
        _mapper = mapper;
    }

    public async Task<FamilyGraphDto> Handle(GetFamilyGraphQuery request, CancellationToken cancellationToken)
    {
        var graph = await _service.GetGraphAsync(cancellationToken);
        return _mapper.Map<FamilyGraphDto>(graph);
    }
}
