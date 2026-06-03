namespace FamilyTree.Domain;

public sealed record Person
{
    public required string Id { get; init; }
    public required string GivenName { get; init; }
    public required string Surname { get; init; }
    public string? MaidenName { get; init; }
    public Sex Sex { get; init; }
    public required LifeEvent Birth { get; init; }
    public LifeEvent? Death { get; init; }
    public Vocation Vocation { get; init; }
    public string? Summary { get; init; }
    public string? Biography { get; init; }
    public string? Portrait { get; init; }
    public IReadOnlyList<string> Gallery { get; init; } = [];
    public IReadOnlyList<SocialLink> Links { get; init; } = [];
    public IReadOnlyList<Residence> Residences { get; init; } = [];
    public Parents Parents { get; init; } = new();
    public bool MarriedIntoFamily { get; init; }
    public bool IsDefaultRoot { get; init; }
}
