namespace FamilyTree.Infrastructure;

/// <summary>Cloudflare R2 (S3-compatible) credentials for the media store. When unset,
/// the app uses the local-folder media store instead.</summary>
public sealed class R2Options
{
    public string AccountId { get; init; } = "";
    public string Bucket { get; init; } = "";
    public string AccessKeyId { get; init; } = "";
    public string SecretAccessKey { get; init; } = "";
    public string LocalMediaDirectory { get; init; } = "";

    public bool IsConfigured =>
        !string.IsNullOrWhiteSpace(AccountId) &&
        !string.IsNullOrWhiteSpace(Bucket) &&
        !string.IsNullOrWhiteSpace(AccessKeyId) &&
        !string.IsNullOrWhiteSpace(SecretAccessKey);
}
