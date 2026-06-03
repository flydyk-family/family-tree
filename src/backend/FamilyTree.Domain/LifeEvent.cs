namespace FamilyTree.Domain;

public sealed record LifeEvent
{
    public int? Year { get; init; }
    public int? Month { get; init; }
    public int? Day { get; init; }
    public bool Approx { get; init; }
    public LocalizedText? Place { get; init; }
}
