using FamilyTree.Application.Abstractions;
using FamilyTree.Domain;
using Microsoft.Extensions.Logging;

namespace FamilyTree.Application.People;

public sealed class UpdatePersonBiographyHandler : IRequestHandler<UpdatePersonBiographyCommand, PersonDto?>
{
    private readonly IFamilyQueryService _service;
    private readonly IPersonOverrideStore _overrides;
    private readonly IFamilySnapshotProvider _snapshot;
    private readonly IMapper _mapper;
    private readonly ILogger<UpdatePersonBiographyHandler> _logger;

    public UpdatePersonBiographyHandler(
        IFamilyQueryService service,
        IPersonOverrideStore overrides,
        IFamilySnapshotProvider snapshot,
        IMapper mapper,
        ILogger<UpdatePersonBiographyHandler> logger)
    {
        _service = service;
        _overrides = overrides;
        _snapshot = snapshot;
        _mapper = mapper;
        _logger = logger;
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
        await _snapshot.RefreshAsync(cancellationToken);

        var merged = await _service.GetPersonAsync(request.Id, cancellationToken);
        // Do not log the editor email (PII / private information). The authoritative
        // "who edited" is persisted on the override revision, not in application logs.
        _logger.LogInformation("Biography for person {PersonId} updated.", request.Id);
        return merged is null ? null : _mapper.Map<PersonDto>(merged);
    }
}
