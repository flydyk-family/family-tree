using System.Diagnostics.CodeAnalysis;
using FamilyTree.Domain;
using Google.Cloud.Firestore;
using Microsoft.Extensions.Options;

namespace FamilyTree.Infrastructure;

/// <summary>
/// Firestore-backed person-override store for deployment. Each person is one parent
/// document holding the LATEST biography snapshot ({ biographyRu/Be/En, editorEmail,
/// editedAt }); the full edit history is an append-only "versions" subcollection, one
/// document per edit. Reads take the parent snapshot, so listing every person's latest
/// biography never transfers history, and no single document grows without bound — each
/// version is its own document, well clear of Firestore's 1 MiB limit.
/// [ExcludeFromCodeCoverage]: thin SDK wrapper, emulator-verified only (optional, not
/// required by CI) — same rationale as Task 6.
/// </summary>
[ExcludeFromCodeCoverage]
public sealed class FirestorePersonOverrideStore : IPersonOverrideStore
{
    private const string VersionsSubcollection = "versions";

    private readonly FirestoreDb _db;
    private readonly CollectionReference _overrides;

    public FirestorePersonOverrideStore(FirestoreDb db, IOptions<FirestoreOptions> options)
    {
        _db = db;
        _overrides = db.Collection(options.Value.OverridesCollection);
    }

    public async Task AppendBiographyAsync(string personId, LocalizedText biography, string editorEmail, CancellationToken cancellationToken)
    {
        // Firestore field values cannot be null in a Dictionary<string,object>; coalesce
        // nullable LocalizedText fields to empty string so documents are always valid.
        var snapshot = new Dictionary<string, object>
        {
            ["biographyRu"] = biography.Ru ?? "",
            ["biographyBe"] = biography.Be ?? "",
            ["biographyEn"] = biography.En ?? "",
            ["editorEmail"] = editorEmail,
            ["editedAt"] = DateTime.UtcNow
        };

        // One atomic batch: overwrite the parent with the latest snapshot AND append an
        // immutable version document to the history subcollection. Overwriting the parent
        // (rather than merging) also drops any legacy "versions" array from the
        // pre-subcollection schema, so old documents self-heal on their next edit.
        var parent = _overrides.Document(personId);
        var batch = _db.StartBatch();
        batch.Set(parent, snapshot);
        batch.Create(parent.Collection(VersionsSubcollection).Document(), snapshot);
        await batch.CommitAsync(cancellationToken);
    }

    public async Task<LocalizedText?> GetLatestBiographyAsync(string personId, CancellationToken cancellationToken)
    {
        var snapshot = await _overrides.Document(personId).GetSnapshotAsync(cancellationToken);
        return snapshot.Exists ? LatestFrom(snapshot) : null;
    }

    public async Task<IReadOnlyDictionary<string, LocalizedText>> GetLatestBiographiesAsync(CancellationToken cancellationToken)
    {
        // Reads only the parent documents (each holding just the latest snapshot) — the
        // history subcollections are not part of this collection snapshot, so no prior
        // versions are transferred.
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
        // Current schema: the latest snapshot lives as flat fields on the parent document.
        if (doc.ContainsField("biographyRu") || doc.ContainsField("biographyBe") || doc.ContainsField("biographyEn"))
        {
            return new LocalizedText
            {
                Ru = ReadString(doc, "biographyRu"),
                Be = ReadString(doc, "biographyBe"),
                En = ReadString(doc, "biographyEn")
            };
        }

        // Legacy schema (pre-subcollection): a "versions" array, newest last. Kept so any
        // document written before this change still reads correctly until its next edit.
        if (doc.TryGetValue<List<Dictionary<string, object>>>("versions", out var versions) && versions.Count > 0)
        {
            var latest = versions[^1];
            return new LocalizedText
            {
                Ru = ReadString(latest, "biographyRu"),
                Be = ReadString(latest, "biographyBe"),
                En = ReadString(latest, "biographyEn")
            };
        }

        return null;
    }

    private static string ReadString(DocumentSnapshot doc, string field) =>
        doc.TryGetValue<string>(field, out var value) ? value : "";

    private static string ReadString(IReadOnlyDictionary<string, object> map, string key) =>
        map.TryGetValue(key, out var value) && value is string text ? text : "";
}
