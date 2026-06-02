using FamilyTree.Domain;

namespace FamilyTree.UnitTests.TestData;

/// <summary>Concise builders for <see cref="Person"/> instances used across the unit tests.</summary>
internal static class PersonFactory
{
    public static Person Create(
        Guid id,
        string givenName = "Test",
        string? familyName = "Person",
        Guid? fatherId = null,
        Guid? motherId = null,
        IReadOnlyList<Guid>? spouseIds = null,
        int? birthYear = null,
        int? deathYear = null,
        Sex sex = Sex.Unknown)
    {
        return new Person
        {
            Id = id,
            GivenName = givenName,
            FamilyName = familyName,
            Sex = sex,
            FatherId = fatherId,
            MotherId = motherId,
            SpouseIds = spouseIds ?? [],
            BirthDate = birthYear is { } by ? new PartialDate(by) : null,
            DeathDate = deathYear is { } dy ? new PartialDate(dy) : null
        };
    }
}
