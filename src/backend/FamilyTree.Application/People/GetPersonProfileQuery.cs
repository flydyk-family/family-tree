namespace FamilyTree.Application.People;

public sealed record GetPersonProfileQuery(string Id) : IRequest<PersonProfileDto?>;
