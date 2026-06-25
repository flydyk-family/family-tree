namespace FamilyTree.Api.Security;

public sealed class OriginVerifyOptions
{
    /// <summary>Accepted origin-verification secrets; empty ⇒ gate dormant (a second entry exists only during rotation).</summary>
    public IReadOnlyList<string> Secrets { get; set; } = [];
}
