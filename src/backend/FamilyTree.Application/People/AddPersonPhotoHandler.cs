using FamilyTree.Application.Abstractions;
using Microsoft.Extensions.Logging;

namespace FamilyTree.Application.People;

/// <summary>Processes and stores an uploaded photo, then records the media override.</summary>
public sealed class AddPersonPhotoHandler : IRequestHandler<AddPersonPhotoCommand, PersonDto?>
{
    private const string WebpContentType = "image/webp";

    private readonly IFamilyQueryService _service;
    private readonly IPersonOverrideStore _overrides;
    private readonly IFamilySnapshotProvider _snapshot;
    private readonly IMediaStore _media;
    private readonly IImageProcessor _processor;
    private readonly IMapper _mapper;
    private readonly ILogger<AddPersonPhotoHandler> _logger;

    public AddPersonPhotoHandler(
        IFamilyQueryService service,
        IPersonOverrideStore overrides,
        IFamilySnapshotProvider snapshot,
        IMediaStore media,
        IImageProcessor processor,
        IMapper mapper,
        ILogger<AddPersonPhotoHandler> logger)
    {
        _service = service;
        _overrides = overrides;
        _snapshot = snapshot;
        _media = media;
        _processor = processor;
        _mapper = mapper;
        _logger = logger;
    }

    public async Task<PersonDto?> Handle(AddPersonPhotoCommand request, CancellationToken cancellationToken)
    {
        var existing = await _service.GetPersonAsync(request.Id, cancellationToken);
        if (existing is null)
        {
            return null;
        }

        var processed = _processor.Process(request.Content);
        var (id, fullKey, thumbKey) = MediaKeyGenerator.ForPerson(request.Id, processed.Full);

        // Store bytes BEFORE recording metadata: an orphaned object is harmless, but a dangling
        // metadata reference would render as a broken image. Bytes are the commit point.
        await _media.PutAsync(fullKey, processed.Full, WebpContentType, cancellationToken);
        await _media.PutAsync(thumbKey, processed.Thumb, WebpContentType, cancellationToken);

        var photo = new Photo(id, fullKey, thumbKey);
        var current = await _overrides.GetLatestMediaAsync(request.Id, cancellationToken)
            ?? new PersonMediaOverride(null, []);

        var next = request.Role == PhotoRole.Portrait
            ? current with { Portrait = photo }
            : current with { Gallery = Append(current.Gallery, photo) };

        await _overrides.AppendMediaAsync(request.Id, next, request.EditorEmail, cancellationToken);
        await _snapshot.RefreshAsync(cancellationToken);

        var merged = await _service.GetPersonAsync(request.Id, cancellationToken);
        _logger.LogInformation("Photo added for person {PersonId} (role={Role}).", request.Id, request.Role);
        return merged is null ? null : _mapper.Map<PersonDto>(merged);
    }

    /// <summary>Appends <paramref name="photo"/> to <paramref name="gallery"/> unless its id is already present.</summary>
    private static IReadOnlyList<Photo> Append(IReadOnlyList<Photo> gallery, Photo photo) =>
        gallery.Any(p => p.Id == photo.Id) ? gallery : [.. gallery, photo];
}
