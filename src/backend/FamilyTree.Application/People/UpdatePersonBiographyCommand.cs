namespace FamilyTree.Application.People;

public sealed record UpdatePersonBiographyCommand(
    string Id,
    LocalizedTextDto Biography,
    string EditorEmail) : IRequest<PersonDto?>;
