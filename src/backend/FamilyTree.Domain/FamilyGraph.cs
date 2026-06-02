namespace FamilyTree.Domain;

public sealed record FamilyGraph(IReadOnlyList<Person> People, IReadOnlyList<Union> Unions);
