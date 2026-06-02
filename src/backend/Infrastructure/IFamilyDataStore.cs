using FamilyTree.Domain;

namespace FamilyTree.Infrastructure;

/// <summary>Holds the family dataset in memory after a single load at startup.</summary>
public interface IFamilyDataStore
{
    IReadOnlyList<Person> People { get; }

    IReadOnlyDictionary<Guid, Person> PeopleById { get; }
}
