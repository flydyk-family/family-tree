namespace FamilyTree.Api.Security;

public sealed class OriginVerifyOptions
{
    /// <summary>
    /// Accepted origin-verification secrets. Empty disables the gate; a second entry exists
    /// only transiently during a zero-downtime rotation.
    /// </summary>
    // `set` (not `init`): assigned by Configure<T> at startup, like the other *Options classes.
    public IReadOnlyList<string> Secrets { get; set; } = [];
}
