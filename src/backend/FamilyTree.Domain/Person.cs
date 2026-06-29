namespace FamilyTree.Domain;

public sealed record Person
{
    public required string Id { get; init; }
    public required LocalizedText GivenName { get; init; }
    public required LocalizedText Surname { get; init; }
    public LocalizedText? MaidenName { get; init; }
    public Sex Sex { get; init; }
    public required LifeEvent Birth { get; init; }
    public LifeEvent? Death { get; init; }
    public Vocation Vocation { get; init; }
    public LocalizedText? Summary { get; init; }
    public LocalizedText? Biography { get; init; }
    public string? Portrait { get; init; }
    public string? PortraitThumb { get; init; }
    public string? PortraitVideo { get; init; }
    public IReadOnlyList<Photo> Gallery { get; init; } = [];
    public IReadOnlyList<SocialLink> Links { get; init; } = [];
    public IReadOnlyList<Residence> Residences { get; init; } = [];
    public Parents Parents { get; init; } = new();
    public bool MarriedIntoFamily { get; init; }
    public bool IsDefaultRoot { get; init; }
}
