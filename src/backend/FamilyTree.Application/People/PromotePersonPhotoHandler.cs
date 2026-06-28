using FamilyTree.Application.Abstractions;
using Microsoft.Extensions.Logging;

namespace FamilyTree.Application.People;

/// <summary>Promotes a gallery photo to portrait; the previous portrait (if any) moves to gallery front.</summary>
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

        var current = await _overrides.GetLatestMediaAsync(request.Id, cancellationToken);
        var target = current?.Gallery.FirstOrDefault(p => p.Id == request.PhotoId);
        if (current is null || target is null)
        {
            // No such gallery photo — return the current merged person unchanged.
            return _mapper.Map<PersonDto>(existing);
        }

        // Build the new gallery: remove the promoted photo, then optionally insert the
        // previous portrait at the front so no photo is ever lost.
        var newGallery = current.Gallery.Where(p => p.Id != target.Id).ToList();
        if (current.Portrait is not null)
        {
            newGallery.Insert(0, current.Portrait);
        }

        var next = new PersonMediaOverride(target, newGallery);
        await _overrides.AppendMediaAsync(request.Id, next, request.EditorEmail, cancellationToken);
        await _snapshot.RefreshAsync(cancellationToken);

        var merged = await _service.GetPersonAsync(request.Id, cancellationToken);
        _logger.LogInformation("Gallery photo promoted to portrait for person {PersonId}.", request.Id);
        return merged is null ? null : _mapper.Map<PersonDto>(merged);
    }
}
