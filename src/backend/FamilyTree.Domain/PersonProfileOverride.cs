namespace FamilyTree.Domain;

/// <summary>An editor's override of one person's editable scalar fields, layered over the
/// JSON seed. Every field is nullable and a <c>null</c> field means "inherit the seed value"
/// (per locale for the <see cref="LocalizedText"/> names). Carries no biography or media —
/// those are separate overrides — so the three override kinds never clobber one another.</summary>
public sealed record PersonProfileOverride
{
    public LocalizedText? GivenName { get; init; }
    public LocalizedText? Surname { get; init; }
    public LocalizedText? MaidenName { get; init; }
    public LocalizedText? MiddleName { get; init; }
    public Sex? Sex { get; init; }
    public int? BirthYear { get; init; }
    public int? BirthMonth { get; init; }
    public int? BirthDay { get; init; }
    public int? DeathYear { get; init; }
    public int? DeathMonth { get; init; }
    public int? DeathDay { get; init; }
    public Vocation? Vocation { get; init; }

    /// <summary>Whole-list override of the person's residences: <c>null</c> inherits the seed
    /// list, a non-null value replaces it wholesale. Kept disjoint from the scalar fields so a
    /// scalar-only edit that carries residences forward never fossilizes them.</summary>
    public IReadOnlyList<Residence>? Residences { get; init; }
}
