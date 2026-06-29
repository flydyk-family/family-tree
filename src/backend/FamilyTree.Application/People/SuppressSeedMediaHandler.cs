using FamilyTree.Application.Abstractions;
using Microsoft.Extensions.Logging;

namespace FamilyTree.Application.People;

/// <summary>Records a seed portrait or seed video as hidden for one person, then refreshes the snapshot.</summary>
public sealed class SuppressSeedMediaHandler : IRequestHandler<SuppressSeedMediaCommand, PersonDto?>
{
    private readonly IFamilyQueryService _service;
    private readonly IPersonOverrideStore _overrides;
    private readonly IFamilySnapshotProvider _snapshot;
    private readonly IMapper _mapper;
    private readonly ILogger<SuppressSeedMediaHandler> _logger;

    public SuppressSeedMediaHandler(
        IFamilyQueryService service,
        IPersonOverrideStore overrides,
        IFamilySnapshotProvider snapshot,
        IMapper mapper,
        ILogger<SuppressSeedMediaHandler> logger)
    {
        _service = service;
        _overrides = overrides;
        _snapshot = snapshot;
        _mapper = mapper;
        _logger = logger;
    }

    public async Task<PersonDto?> Handle(SuppressSeedMediaCommand request, CancellationToken cancellationToken)
    {
        var existing = await _service.GetPersonAsync(request.Id, cancellationToken);
        if (existing is null)
        {
            return null;
        }

        var seedKey = ResolveSeedKey(existing, request.Role);
        if (seedKey is null)
        {
            // Nothing to hide (no such seed) — return the current merged person unchanged.
            return _mapper.Map<PersonDto>(existing);
        }

        var current = await _overrides.GetLatestMediaAsync(request.Id, cancellationToken)
            ?? new PersonMediaOverride(null, []);
        if (current.HiddenSeeds.Contains(seedKey))
        {
            return _mapper.Map<PersonDto>(existing); // already hidden — idempotent no-op
        }

        var next = current with { HiddenSeeds = [.. current.HiddenSeeds, seedKey] };
        await _overrides.AppendMediaAsync(request.Id, next, request.EditorEmail, cancellationToken);
        await _snapshot.RefreshAsync(cancellationToken);

        var merged = await _service.GetPersonAsync(request.Id, cancellationToken);
        _logger.LogInformation("Seed media hidden for person {PersonId} (role={Role}).", request.Id, request.Role);
        return merged is null ? null : _mapper.Map<PersonDto>(merged);
    }

    /// <summary>Recovers the bare seed key to hide from the merged person: the active bare-filename
    /// portrait or the displaced virtual seed gallery tile (role=portrait), or the seed video (role=video).</summary>
    private static string? ResolveSeedKey(Person person, string role) => role switch
    {
        "portrait" => person.Portrait is { } p && !p.Contains('/')
            ? p
            : person.Gallery.FirstOrDefault(g => !g.Full.Contains('/'))?.Full,
        "video" => person.PortraitVideo,
        _ => null
    };
}
