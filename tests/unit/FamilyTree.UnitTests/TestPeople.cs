using FamilyTree.Domain;

namespace FamilyTree.UnitTests;

/// <summary>Shared <see cref="Person"/> builder for unit tests: defaults every required field so
/// call sites only set what the scenario cares about.</summary>
internal static class TestPeople
{
    public static Person Person(
        string id,
        int? birthYear = null,
        LocalizedText? surname = null,
        string? fatherId = null,
        string? motherId = null) =>
        new()
        {
            Id = id,
            GivenName = new LocalizedText { Ru = id, Be = id, En = id },
            Surname = surname ?? new LocalizedText { Ru = id, Be = id, En = id },
            Sex = Sex.Unknown,
            Birth = new LifeEvent { Year = birthYear },
            Vocation = Vocation.Other,
            Parents = new Parents { FatherId = fatherId, MotherId = motherId }
        };
}
