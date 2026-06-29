namespace FamilyTree.Application.People;

/// <summary>Uploads a new photo for a person and stores it as portrait or gallery image.</summary>
/// <param name="Id">The person's identifier (e.g. "p-0001").</param>
/// <param name="Role">Whether the photo becomes the portrait or is appended to the gallery.</param>
/// <param name="Content">Raw image bytes (any supported format; up to 15 MiB).</param>
/// <param name="EditorEmail">Email of the authenticated editor — stored on the revision, not logged.</param>
public sealed record AddPersonPhotoCommand(string Id, PhotoRole Role, byte[] Content, string EditorEmail)
    : IRequest<PersonDto?>;
