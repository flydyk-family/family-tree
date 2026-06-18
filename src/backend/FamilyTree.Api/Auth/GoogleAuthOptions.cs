namespace FamilyTree.Api.Auth;

public sealed class GoogleAuthOptions
{
    public string ClientId { get; set; } = "";

    public IReadOnlyList<string> Editors { get; set; } = [];
}
