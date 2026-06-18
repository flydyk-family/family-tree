using System.Diagnostics.CodeAnalysis;
using FamilyTree.Domain;
using Google.Cloud.Firestore;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;

namespace FamilyTree.Infrastructure;

/// <summary>
/// Firestore-backed append-only person-override store for deployment. One document per
/// person holds a "versions" array (newest last), each { biographyRu/Be/En, editorEmail,
/// editedAt }; reads take the latest. [ExcludeFromCodeCoverage]: thin SDK wrapper,
/// emulator-verified only (optional, not required by CI) — same rationale as Task 6.
/// </summary>
[ExcludeFromCodeCoverage]
public sealed class FirestorePersonOverrideStore : IPersonOverrideStore
{
    private readonly CollectionReference _overrides;
    private readonly ILogger<FirestorePersonOverrideStore> _logger;

    public FirestorePersonOverrideStore(FirestoreDb db, IOptions<FirestoreOptions> options, ILogger<FirestorePersonOverrideStore> logger)
    {
        _overrides = db.Collection(options.Value.OverridesCollection);
        _logger = logger;
    }

    public async Task AppendBiographyAsync(string personId, LocalizedText biography, string editorEmail, CancellationToken cancellationToken)
    {
        // Firestore field values cannot be null in a Dictionary<string,object>; coalesce
        // nullable LocalizedText fields to empty string so documents are always valid.
        var version = new Dictionary<string, object>
        {
            ["biographyRu"] = biography.Ru ?? "",
            ["biographyBe"] = biography.Be ?? "",
            ["biographyEn"] = biography.En ?? "",
            ["editorEmail"] = editorEmail,
            ["editedAt"] = DateTime.UtcNow
        };

        await _overrides.Document(personId).SetAsync(
            new Dictionary<string, object> { ["versions"] = FieldValue.ArrayUnion(version) },
            SetOptions.MergeAll,
            cancellationToken);
    }

    public async Task<LocalizedText?> GetLatestBiographyAsync(string personId, CancellationToken cancellationToken)
    {
        var snapshot = await _overrides.Document(personId).GetSnapshotAsync(cancellationToken);
        return snapshot.Exists ? LatestFrom(snapshot) : null;
    }

    public async Task<IReadOnlyDictionary<string, LocalizedText>> GetLatestBiographiesAsync(CancellationToken cancellationToken)
    {
        var result = new Dictionary<string, LocalizedText>(StringComparer.Ordinal);
        var snapshot = await _overrides.GetSnapshotAsync(cancellationToken);
        foreach (var doc in snapshot.Documents)
        {
            var latest = LatestFrom(doc);
            if (latest is not null)
            {
                result[doc.Id] = latest;
            }
        }

        return result;
    }

    private static LocalizedText? LatestFrom(DocumentSnapshot doc)
    {
        if (!doc.TryGetValue<List<Dictionary<string, object>>>("versions", out var versions) || versions.Count == 0)
        {
            return null;
        }

        var latest = versions[^1];
        return new LocalizedText
        {
            Ru = (string)latest["biographyRu"],
            Be = (string)latest["biographyBe"],
            En = (string)latest["biographyEn"]
        };
    }
}
