namespace FamilyTree.Infrastructure;

/// <summary>Cloudflare R2 (S3-compatible) credentials for the media store. When unset,
/// the app uses the local-folder media store instead.</summary>
public sealed class R2Options
{
    public string AccountId { get; set; } = "";
    public string Bucket { get; set; } = "";
    public string AccessKeyId { get; set; } = "";
    public string SecretAccessKey { get; set; } = "";
    public string LocalMediaDirectory { get; set; } = "";

    public bool IsConfigured =>
        !string.IsNullOrWhiteSpace(AccountId) &&
        !string.IsNullOrWhiteSpace(Bucket) &&
        !string.IsNullOrWhiteSpace(AccessKeyId) &&
        !string.IsNullOrWhiteSpace(SecretAccessKey);
}
