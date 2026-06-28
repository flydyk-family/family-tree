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

    /// <summary>
    /// Maximum accepted body size for photo upload endpoints in bytes. Only POST /api/people/{id}/photos
    /// is granted this larger cap; all other routes remain bound to <see cref="MaxRequestBodyBytes"/>.
    /// Default: 15 MiB.
    /// </summary>
    public long MaxPhotoUploadBytes { get; init; } = 15 * 1024 * 1024;
}
