namespace FamilyTree.Application.Families;

public sealed record GetFamiliesQuery : IRequest<IReadOnlyList<FamilySummaryDto>>;
