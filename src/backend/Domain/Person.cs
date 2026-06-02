namespace FamilyTree.Domain;

/// <summary>
/// A single family member. Relationships are stored as identifiers (not nested objects)
/// so the model maps cleanly onto a future relational schema.
/// </summary>
public sealed class Person
{
    public required Guid Id { get; init; }
    public required string GivenName { get; init; }
    public string? FamilyName { get; init; }
    public string? MaidenName { get; init; }
    public Sex Sex { get; init; }

    public PartialDate? BirthDate { get; init; }
    public PartialDate? DeathDate { get; init; }
    public string? BirthPlace { get; init; }

    public string? PhotoUrl { get; init; }

    /// <summary>Short bullet facts shown in the normal popup layout.</summary>
    public IReadOnlyList<string> KeyFacts { get; init; } = [];

    /// <summary>Longer biography shown in the expanded popup layout.</summary>
    public string? Bio { get; init; }

    /// <summary>External profile links shown in the expanded popup layout.</summary>
    public IReadOnlyList<SocialLink> SocialLinks { get; init; } = [];

    public Guid? FatherId { get; init; }
    public Guid? MotherId { get; init; }

    /// <summary>Marriage edges. Stored symmetrically (each spouse lists the other).</summary>
    public IReadOnlyList<Guid> SpouseIds { get; init; } = [];
}
