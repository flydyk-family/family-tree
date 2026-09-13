namespace FamilyTree.Domain;

/// <summary>The single home of the family-scoping rule for durable keys: the default family keeps
/// its historical bare keys; every other family is prefixed with its id.</summary>
/// <remarks>Because the default family's keys are unprefixed, promoting a different family to
/// default would orphan its existing overrides and uploads; that would need a one-time rewrite.</remarks>
public static class StorageKeys
{
    /// <summary>Separates family and person in an override key. Firestore document ids cannot contain
    /// '/'; family ids cannot contain '_', so the separator is unambiguous.</summary>
    public const string OverrideSeparator = "__";

    private const string UploadsRoot = "uploads/";

    /// <summary>Firestore document id for a person's override documents.</summary>
    public static string OverrideKey(FamilyRegistry registry, string familyId, string personId) =>
        registry.IsDefault(familyId) ? personId : $"{familyId}{OverrideSeparator}{personId}";

    /// <summary>R2 key prefix for a person's uploaded media.</summary>
    public static string UploadPrefix(FamilyRegistry registry, string familyId, string personId) =>
        registry.IsDefault(familyId) ? $"{UploadsRoot}{personId}" : $"{UploadsRoot}{familyId}/{personId}";

    /// <summary>Expands a seed media reference to a full key. The default family's references stay
    /// bare; for any other family, a reference already containing '/' is returned unchanged, and a
    /// bare name belongs under the family's media prefix.</summary>
    public static string ExpandSeedMedia(FamilyRegistry registry, string familyId, string reference)
    {
        if (registry.IsDefault(familyId))
        {
            return reference;
        }

        return reference.Contains('/') ? reference : $"{registry.MediaPrefixFor(familyId)}/{reference}";
    }

    /// <summary>True for an uploaded object; every other media reference is a seed.</summary>
    public static bool IsUploadKey(string reference) =>
        reference.StartsWith(UploadsRoot, StringComparison.Ordinal);
}
