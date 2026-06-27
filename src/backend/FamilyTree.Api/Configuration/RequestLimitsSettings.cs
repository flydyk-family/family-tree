namespace FamilyTree.Api.Configuration;

public sealed class RequestLimitsSettings
{
    /// <summary>
    /// Maximum accepted request-body size in bytes. Bounds pre-deserialization input so a
    /// large body can't be pushed through any endpoint (the biography write is additionally
    /// capped per-locale by validation). 256 KiB comfortably covers a full three-locale
    /// biography edit plus JSON overhead while rejecting anything abusive.
    /// </summary>
    public long MaxRequestBodyBytes { get; init; } = 256 * 1024;
}
