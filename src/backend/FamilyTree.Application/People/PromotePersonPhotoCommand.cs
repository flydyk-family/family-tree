namespace FamilyTree.Application.People;

/// <summary>Promotes a gallery photo to become the person's portrait.</summary>
/// <param name="Id">The person's identifier.</param>
/// <param name="PhotoId">The id of the gallery photo to promote.</param>
/// <param name="EditorEmail">Email of the authenticated editor — stored on the revision, not logged.</param>
public sealed record PromotePersonPhotoCommand(string Id, string PhotoId, string EditorEmail)
    : IRequest<PersonDto?>;
