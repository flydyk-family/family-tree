namespace FamilyTree.Application.People;

/// <summary>Removes a photo from a person's portrait or gallery.</summary>
/// <param name="Id">The person's identifier.</param>
/// <param name="Target"><c>"portrait"</c> to clear the portrait, or a gallery photo id to remove that item.</param>
/// <param name="EditorEmail">Email of the authenticated editor — stored on the revision, not logged.</param>
public sealed record DeletePersonPhotoCommand(string Id, string Target, string EditorEmail)
    : IRequest<PersonDto?>;
