namespace FamilyTree.Application.People;

public sealed record UpdatePersonProfileCommand(
    string Id,
    PersonProfileDto Profile,
    string EditorEmail) : IRequest<PersonDto?>;
