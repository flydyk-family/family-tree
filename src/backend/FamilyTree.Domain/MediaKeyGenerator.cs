using System.Security.Cryptography;

namespace FamilyTree.Domain;

/// <summary>Derives immutable, content-addressed R2 keys for an uploaded photo so re-uploading
/// identical bytes is idempotent and the long-cache convention holds.</summary>
public static class MediaKeyGenerator
{
    /// <summary>Computes a stable key tuple for <paramref name="personId"/> from the SHA-256
    /// of <paramref name="fullBytes"/>.</summary>
    /// <param name="personId">The person's identifier, used as the path segment.</param>
    /// <param name="fullBytes">Raw bytes of the full-size photo.</param>
    /// <returns>A tuple of (<c>Id</c>, <c>FullKey</c>, <c>ThumbKey</c>) where <c>Id</c> is the
    /// first 20 hex characters of the SHA-256 hash.</returns>
    public static (string Id, string FullKey, string ThumbKey) ForPerson(string personId, ReadOnlySpan<byte> fullBytes)
    {
        var hash = SHA256.HashData(fullBytes);
        var id = Convert.ToHexStringLower(hash)[..20];
        return (id, $"uploads/{personId}/{id}.webp", $"uploads/{personId}/{id}.thumb.webp");
    }
}
