using FamilyTree.Application.Abstractions;
using FamilyTree.Domain;

namespace FamilyTree.Application.People;

public sealed class GetPersonProfileHandler : IRequestHandler<GetPersonProfileQuery, PersonProfileDto?>
{
    private readonly IFamilyQueryService _service;
    private readonly IPersonOverrideStore _overrides;
    private readonly IMapper _mapper;

    public GetPersonProfileHandler(IFamilyQueryService service, IPersonOverrideStore overrides, IMapper mapper)
    {
        _service = service;
        _overrides = overrides;
        _mapper = mapper;
    }

    public async Task<PersonProfileDto?> Handle(GetPersonProfileQuery request, CancellationToken cancellationToken)
    {
        var person = await _service.GetPersonAsync(request.Id, cancellationToken);
        if (person is null)
        {
            return null;
        }

        var profile = await _overrides.GetLatestProfileAsync(request.Id, cancellationToken)
                      ?? new PersonProfileOverride();
        return _mapper.Map<PersonProfileDto>(profile);
    }
}
