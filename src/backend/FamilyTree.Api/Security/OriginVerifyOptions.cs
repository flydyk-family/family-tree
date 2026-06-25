namespace FamilyTree.Api.Security;

public sealed class OriginVerifyOptions
{
    /// <summary>
    /// Accepted origin-verification secrets. Empty ⇒ the gate is dormant. Normally one entry;
    /// a second entry exists only transiently during a zero-downtime rotation.
    /// </summary>
    public IReadOnlyList<string> Secrets { get; set; } = [];
}
