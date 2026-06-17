namespace FamilyTree.Api.Configuration;

public sealed class GoogleSettings
{
    public string ClientId { get; init; } = "";

    public IReadOnlyList<string> Editors { get; init; } = [];
}
