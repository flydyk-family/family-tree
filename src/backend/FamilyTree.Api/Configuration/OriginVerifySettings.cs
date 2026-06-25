namespace FamilyTree.Api.Configuration;

public sealed class OriginVerifySettings
{
    public IReadOnlyList<string> Secrets { get; init; } = [];
}
