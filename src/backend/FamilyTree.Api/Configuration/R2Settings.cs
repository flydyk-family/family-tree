namespace FamilyTree.Api.Configuration;

/// <summary>Cloudflare R2 credentials and local fallback directory, mirroring R2Options in Infrastructure.</summary>
public sealed class R2Settings
{
    public string AccountId { get; init; } = "";
    public string Bucket { get; init; } = "";
    public string AccessKeyId { get; init; } = "";
    public string SecretAccessKey { get; init; } = "";
    public string LocalMediaDirectory { get; init; } = "";
}
