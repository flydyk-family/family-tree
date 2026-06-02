using FamilyTree.Application.Abstractions;

namespace FamilyTree.Application.People;

public sealed class GetAllPeopleHandler : IRequestHandler<GetAllPeopleQuery, IReadOnlyList<PersonSummaryDto>>
{
    private readonly IFamilyQueryService _service;
    private readonly IMapper _mapper;

    public GetAllPeopleHandler(IFamilyQueryService service, IMapper mapper)
    {
        _service = service;
        _mapper = mapper;
    }

    public async Task<IReadOnlyList<PersonSummaryDto>> Handle(GetAllPeopleQuery request, CancellationToken cancellationToken)
    {
        var people = await _service.GetAllPeopleAsync(cancellationToken);
        return _mapper.Map<IReadOnlyList<PersonSummaryDto>>(people);
    }
}
