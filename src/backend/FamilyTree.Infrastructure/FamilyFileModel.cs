namespace FamilyTree.Infrastructure;

internal sealed record FamilyFileModel
{
    public IReadOnlyList<Person> People { get; init; } = [];
    public IReadOnlyList<Union> Unions { get; init; } = [];
}
