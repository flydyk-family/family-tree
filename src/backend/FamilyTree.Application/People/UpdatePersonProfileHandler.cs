using FamilyTree.Application.Abstractions;
using FamilyTree.Domain;
using FluentValidation;
using FluentValidation.Results;
using Microsoft.Extensions.Logging;

namespace FamilyTree.Application.People;

public sealed class UpdatePersonProfileHandler : IRequestHandler<UpdatePersonProfileCommand, PersonDto?>
{
    private readonly IFamilyQueryService _service;
    private readonly IPersonOverrideStore _overrides;
    private readonly IFamilySnapshotProvider _snapshot;
    private readonly IFamilyGraphValidator _graphValidator;
    private readonly IMapper _mapper;
    private readonly ILogger<UpdatePersonProfileHandler> _logger;

    public UpdatePersonProfileHandler(
        IFamilyQueryService service,
        IPersonOverrideStore overrides,
        IFamilySnapshotProvider snapshot,
        IFamilyGraphValidator graphValidator,
        IMapper mapper,
        ILogger<UpdatePersonProfileHandler> logger)
    {
        _service = service;
        _overrides = overrides;
        _snapshot = snapshot;
        _graphValidator = graphValidator;
        _mapper = mapper;
        _logger = logger;
    }

    public async Task<PersonDto?> Handle(UpdatePersonProfileCommand request, CancellationToken cancellationToken)
    {
        var existing = await _service.GetPersonAsync(request.Id, cancellationToken);
        if (existing is null)
        {
            return null;
        }

        // Cross-entity check needs the whole graph — a single-record validator cannot do it.
        var graph = await _service.GetGraphAsync(cancellationToken);
        var check = _graphValidator.ValidateBirthYear(graph, request.Id, request.Profile.BirthYear);
        if (!check.IsValid)
        {
            _logger.LogWarning("Rejected profile edit for {PersonId}: {Reason}", request.Id, check.Error);
            throw new ValidationException(new[] { new ValidationFailure("Profile.BirthYear", check.Error) });
        }

        // Validate the date that will actually be RENDERED after the write. A profile save is a
        // whole-document replace (latest override wins), so a null field inherits the SEED, not
        // whatever a prior override happened to set. Coalescing against the merged `existing` would
        // let a replace that drops a coarser unit (e.g. omits the month a prior override supplied)
        // pass validation, then silently render a day-without-month once the seed baseline reasserts.
        var seedGraph = await _snapshot.GetSeedAsync(cancellationToken);
        var seed = seedGraph.People.FirstOrDefault(p => p.Id == request.Id);

        var birthDateError = ProfileDate.Validate(
            request.Profile.BirthYear ?? seed?.Birth.Year,
            request.Profile.BirthMonth ?? seed?.Birth.Month,
            request.Profile.BirthDay ?? seed?.Birth.Day);
        if (birthDateError is not null)
        {
            _logger.LogWarning("Rejected profile edit for {PersonId}: {Reason}", request.Id, birthDateError);
            throw new ValidationException(new[] { new ValidationFailure("Profile.BirthDate", birthDateError) });
        }

        var deathDateError = ProfileDate.Validate(
            request.Profile.DeathYear ?? seed?.Death?.Year,
            request.Profile.DeathMonth ?? seed?.Death?.Month,
            request.Profile.DeathDay ?? seed?.Death?.Day);
        if (deathDateError is not null)
        {
            _logger.LogWarning("Rejected profile edit for {PersonId}: {Reason}", request.Id, deathDateError);
            throw new ValidationException(new[] { new ValidationFailure("Profile.DeathDate", deathDateError) });
        }

        var profile = _mapper.Map<PersonProfileOverride>(request.Profile);
        await _overrides.AppendProfileAsync(request.Id, profile, request.EditorEmail, cancellationToken);
        await _snapshot.RefreshAsync(cancellationToken);

        var merged = await _service.GetPersonAsync(request.Id, cancellationToken);
        // Do not log the editor email (PII / private information). The authoritative
        // "who edited" is persisted on the override revision, not in application logs.
        _logger.LogInformation("Profile for person {PersonId} updated.", request.Id);
        return merged is null ? null : _mapper.Map<PersonDto>(merged);
    }
}
