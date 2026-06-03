using FamilyTree.Application.Abstractions;

namespace FamilyTree.Application.People;

public sealed class GetPersonByIdHandler : IRequestHandler<GetPersonByIdQuery, PersonDto?>
{
    private readonly IFamilyQueryService _service;
    private readonly IMapper _mapper;

    public GetPersonByIdHandler(IFamilyQueryService service, IMapper mapper)
    {
        _service = service;
        _mapper = mapper;
    }

    public async Task<PersonDto?> Handle(GetPersonByIdQuery request, CancellationToken cancellationToken)
    {
        var person = await _service.GetPersonAsync(request.Id, cancellationToken);
        return person is null ? null : _mapper.Map<PersonDto>(person);
    }
}
