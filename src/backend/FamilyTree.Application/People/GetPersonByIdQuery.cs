namespace FamilyTree.Application.People;

public sealed record GetPersonByIdQuery(string Id) : IRequest<PersonDto?>;
