namespace FamilyTree.Application.People;

/// <summary>Hides a person's seed portrait or seed video (the seed file is never deleted, only suppressed).</summary>
/// <param name="Id">The person's identifier.</param>
/// <param name="Role"><c>"portrait"</c> or <c>"video"</c> — which seed to hide.</param>
/// <param name="EditorEmail">Email of the authenticated editor — stored on the revision, not logged.</param>
public sealed record SuppressSeedMediaCommand(string Id, string Role, string EditorEmail)
    : IRequest<PersonDto?>;
