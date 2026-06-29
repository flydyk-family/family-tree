using FamilyTree.Application.Abstractions;
using Microsoft.Extensions.Logging;

namespace FamilyTree.Application.People;

/// <summary>Promotes a gallery photo to portrait; the previous portrait moves to the gallery (a displaced seed is re-surfaced by the merge). The seed itself is re-selectable.</summary>
public sealed class PromotePersonPhotoHandler : IRequestHandler<PromotePersonPhotoCommand, PersonDto?>
{
    private readonly IFamilyQueryService _service;
    private readonly IPersonOverrideStore _overrides;
    private readonly IFamilySnapshotProvider _snapshot;
    private readonly IMapper _mapper;
    private readonly ILogger<PromotePersonPhotoHandler> _logger;

    public PromotePersonPhotoHandler(
        IFamilyQueryService service,
        IPersonOverrideStore overrides,
        IFamilySnapshotProvider snapshot,
        IMapper mapper,
        ILogger<PromotePersonPhotoHandler> logger)
    {
        _service = service;
        _overrides = overrides;
        _snapshot = snapshot;
        _mapper = mapper;
        _logger = logger;
    }

    public async Task<PersonDto?> Handle(PromotePersonPhotoCommand request, CancellationToken cancellationToken)
    {
        var existing = await _service.GetPersonAsync(request.Id, cancellationToken);
        if (existing is null)
        {
            return null;
        }

        // Find the target in the MERGED gallery — it includes the virtual seed tile.
        var target = existing.Gallery.FirstOrDefault(p => p.Id == request.PhotoId);
        if (target is null)
        {
            return _mapper.Map<PersonDto>(existing);
        }

        var current = await _overrides.GetLatestMediaAsync(request.Id, cancellationToken)
            ?? new PersonMediaOverride(null, []);

        PersonMediaOverride next;
        if (!target.Full.Contains('/'))
        {
            // Re-select the seed as portrait: clear the override portrait (the merge falls back to
            // the seed) and move the currently-uploaded portrait into the override gallery front.
            var gallery = current.Portrait is null
                ? current.Gallery.ToList()
                : [current.Portrait, .. current.Gallery];
            next = new PersonMediaOverride(null, gallery);
        }
        else
        {
            // Promote an uploaded gallery photo to portrait; move the previous override portrait (if
            // any) to the gallery front. A previous SEED portrait needs nothing — the merge re-adds it.
            var gallery = current.Gallery.Where(p => p.Id != target.Id).ToList();
            if (current.Portrait is not null)
            {
                gallery.Insert(0, current.Portrait);
            }
            next = new PersonMediaOverride(target, gallery);
        }

        await _overrides.AppendMediaAsync(request.Id, next, request.EditorEmail, cancellationToken);
        await _snapshot.RefreshAsync(cancellationToken);

        var merged = await _service.GetPersonAsync(request.Id, cancellationToken);
        _logger.LogInformation("Gallery photo promoted to portrait for person {PersonId}.", request.Id);
        return merged is null ? null : _mapper.Map<PersonDto>(merged);
    }
}
