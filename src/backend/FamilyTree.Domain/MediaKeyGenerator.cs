using System.Security.Cryptography;

namespace FamilyTree.Domain;

/// <summary>Derives immutable, content-addressed R2 keys for an uploaded photo so re-uploading
/// identical bytes is idempotent and the long-cache convention holds.</summary>
public static class MediaKeyGenerator
{
    /// <summary>Computes a stable key tuple for a person in a family from the SHA-256 of
    /// <paramref name="fullBytes"/>, under <see cref="StorageKeys.UploadPrefix"/>.</summary>
    /// <returns>(<c>Id</c>, <c>FullKey</c>, <c>ThumbKey</c>); <c>Id</c> is the first 20 hex chars of the hash.</returns>
    public static (string Id, string FullKey, string ThumbKey) ForPerson(
        FamilyRegistry registry, string familyId, string personId, ReadOnlySpan<byte> fullBytes)
    {
        var id = Convert.ToHexStringLower(SHA256.HashData(fullBytes))[..20];
        var prefix = StorageKeys.UploadPrefix(registry, familyId, personId);
        return (id, $"{prefix}/{id}.webp", $"{prefix}/{id}.thumb.webp");
    }
}
