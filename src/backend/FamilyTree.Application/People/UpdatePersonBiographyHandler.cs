using FamilyTree.Application.Abstractions;

namespace FamilyTree.Application.People;

public sealed class UpdatePersonBiographyHandler : IRequestHandler<UpdatePersonBiographyCommand, PersonDto?>
{
    private readonly IFamilyQueryService _service;
    private readonly IPersonOverrideStore _overrides;
    private readonly IMapper _mapper;

    public UpdatePersonBiographyHandler(
        IFamilyQueryService service,
        IPersonOverrideStore overrides,
        IMapper mapper)
    {
        _service = service;
        _overrides = overrides;
        _mapper = mapper;
    }

    public async Task<PersonDto?> Handle(UpdatePersonBiographyCommand request, CancellationToken cancellationToken)
    {
        var existing = await _service.GetPersonAsync(request.Id, cancellationToken);
        if (existing is null)
        {
            return null;
        }

        var biography = _mapper.Map<LocalizedText>(request.Biography);
        await _overrides.AppendBiographyAsync(request.Id, biography, request.EditorEmail, cancellationToken);

        var merged = await _service.GetPersonAsync(request.Id, cancellationToken);
        return merged is null ? null : _mapper.Map<PersonDto>(merged);
    }
}
