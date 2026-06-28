using FamilyTree.Application.Abstractions;
using Microsoft.Extensions.Logging;

namespace FamilyTree.Application.People;

/// <summary>Removes a portrait or gallery photo and performs a best-effort media-store cleanup.</summary>
public sealed class DeletePersonPhotoHandler : IRequestHandler<DeletePersonPhotoCommand, PersonDto?>
{
    private readonly IFamilyQueryService _service;
    private readonly IPersonOverrideStore _overrides;
    private readonly IFamilySnapshotProvider _snapshot;
    private readonly IMediaStore _media;
    private readonly IMapper _mapper;
    private readonly ILogger<DeletePersonPhotoHandler> _logger;

    public DeletePersonPhotoHandler(
        IFamilyQueryService service,
        IPersonOverrideStore overrides,
        IFamilySnapshotProvider snapshot,
        IMediaStore media,
        IMapper mapper,
        ILogger<DeletePersonPhotoHandler> logger)
    {
        _service = service;
        _overrides = overrides;
        _snapshot = snapshot;
        _media = media;
        _mapper = mapper;
        _logger = logger;
    }

    public async Task<PersonDto?> Handle(DeletePersonPhotoCommand request, CancellationToken cancellationToken)
    {
        var existing = await _service.GetPersonAsync(request.Id, cancellationToken);
        if (existing is null)
        {
            return null;
        }

        var current = await _overrides.GetLatestMediaAsync(request.Id, cancellationToken);
        if (current is null)
        {
            // Nothing has been overridden — return the current merged person unchanged.
            return _mapper.Map<PersonDto>(existing);
        }

        PersonMediaOverride next;
        Photo? removed;
        if (request.Target == "portrait")
        {
            removed = current.Portrait;
            next = current with { Portrait = null };
        }
        else
        {
            removed = current.Gallery.FirstOrDefault(p => p.Id == request.Target);
            next = current with { Gallery = current.Gallery.Where(p => p.Id != request.Target).ToList() };
        }

        await _overrides.AppendMediaAsync(request.Id, next, request.EditorEmail, cancellationToken);
        await _snapshot.RefreshAsync(cancellationToken);

        // Best-effort cleanup — after the override is committed, so orphaned bytes are harmless.
        await BestEffortDeleteAsync(removed, next, cancellationToken);

        var merged = await _service.GetPersonAsync(request.Id, cancellationToken);
        _logger.LogInformation("Photo removed for person {PersonId}.", request.Id);
        return merged is null ? null : _mapper.Map<PersonDto>(merged);
    }

    /// <summary>Deletes both keys of <paramref name="removed"/> only when no surviving reference still points at them.</summary>
    private async Task BestEffortDeleteAsync(Photo? removed, PersonMediaOverride next, CancellationToken cancellationToken)
    {
        if (removed is null)
        {
            return;
        }

        var stillUsed = next.Portrait?.Id == removed.Id || next.Gallery.Any(p => p.Id == removed.Id);
        if (stillUsed || !removed.Full.Contains('/'))
        {
            return;
        }

        try
        {
            await _media.DeleteAsync(removed.Full, cancellationToken);
            await _media.DeleteAsync(removed.Thumb, cancellationToken);
        }
        catch (Exception ex)
        {
            // Orphaned bytes are harmless; never fail the user's delete because cleanup failed.
            _logger.LogWarning(ex, "Best-effort media delete failed.");
        }
    }
}
