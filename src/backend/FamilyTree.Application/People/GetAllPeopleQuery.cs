namespace FamilyTree.Application.People;

public sealed record GetAllPeopleQuery : IRequest<IReadOnlyList<PersonSummaryDto>>;
