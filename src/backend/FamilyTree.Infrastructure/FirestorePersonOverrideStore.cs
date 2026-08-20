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

    // App-imposed deadline (shared with FirestoreSessionStore) so a hung Firestore call
    // fails fast: the collection read runs inside the snapshot-refresh lock (a hang there
    // blocks every read), and the write is on the latency-sensitive biography-save path.
    private static readonly TimeSpan OperationTimeout = OperationDeadline.FirestoreTimeout;

    private readonly FirestoreDb _db;
    private readonly CollectionReference _overrides;
    private readonly CollectionReference _mediaOverrides;
    private readonly CollectionReference _profileOverrides;

    public FirestorePersonOverrideStore(FirestoreDb db, IOptions<FirestoreOptions> options)
    {
        _db = db;
        _overrides = db.Collection(options.Value.OverridesCollection);
        _mediaOverrides = db.Collection(options.Value.MediaOverridesCollection);
        _profileOverrides = db.Collection(options.Value.ProfileOverridesCollection);
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
            // Server-assigned so version ordering stays authoritative even under
            // concurrent writers (multiple Cloud Run instances), independent of clock skew.
            ["editedAt"] = FieldValue.ServerTimestamp
        };

        // One atomic batch: overwrite the parent with the latest snapshot AND append an
        // immutable version document to the history subcollection, so the latest snapshot
        // and the audit log can never diverge.
        var parent = _overrides.Document(personId);
        var batch = _db.StartBatch();
        batch.Set(parent, snapshot);
        batch.Create(parent.Collection(VersionsSubcollection).Document(), snapshot);
        await OperationDeadline.RunAsync(OperationTimeout, cancellationToken,
            ct => batch.CommitAsync(ct),
            "Firestore biography write");
    }

    public async Task<LocalizedText?> GetLatestBiographyAsync(string personId, CancellationToken cancellationToken)
    {
        var snapshot = await OperationDeadline.RunAsync(OperationTimeout, cancellationToken,
            ct => _overrides.Document(personId).GetSnapshotAsync(ct),
            "Firestore biography read");
        return snapshot.Exists ? LatestFrom(snapshot) : null;
    }

    public async Task<IReadOnlyDictionary<string, LocalizedText>> GetLatestBiographiesAsync(CancellationToken cancellationToken)
    {
        // Reads only the parent documents (each holding just the latest snapshot) — the
        // history subcollections are not part of this collection snapshot, so no prior
        // versions are transferred.
        var result = new Dictionary<string, LocalizedText>(StringComparer.Ordinal);
        var snapshot = await OperationDeadline.RunAsync(OperationTimeout, cancellationToken,
            ct => _overrides.GetSnapshotAsync(ct),
            "Firestore overrides read");
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

    /// <inheritdoc/>
    public async Task AppendMediaAsync(string personId, PersonMediaOverride media, string editorEmail, CancellationToken cancellationToken)
    {
        var snapshot = new Dictionary<string, object?>
        {
            ["portrait"] = media.Portrait is null ? null : PhotoMap(media.Portrait),
            ["gallery"] = media.Gallery.Select(PhotoMap).ToList(),
            ["hiddenSeeds"] = media.HiddenSeeds.ToList(),
            ["editorEmail"] = editorEmail,
            ["editedAt"] = FieldValue.ServerTimestamp
        };

        var parent = _mediaOverrides.Document(personId);
        var batch = _db.StartBatch();
        batch.Set(parent, snapshot);
        batch.Create(parent.Collection(VersionsSubcollection).Document(), snapshot);
        await OperationDeadline.RunAsync(OperationTimeout, cancellationToken,
            ct => batch.CommitAsync(ct), "Firestore media write");
    }

    /// <inheritdoc/>
    public async Task<PersonMediaOverride?> GetLatestMediaAsync(string personId, CancellationToken cancellationToken)
    {
        var snapshot = await OperationDeadline.RunAsync(OperationTimeout, cancellationToken,
            ct => _mediaOverrides.Document(personId).GetSnapshotAsync(ct), "Firestore media read");
        return snapshot.Exists ? MediaFrom(snapshot) : null;
    }

    /// <inheritdoc/>
    public async Task<IReadOnlyDictionary<string, PersonMediaOverride>> GetLatestMediaMapAsync(CancellationToken cancellationToken)
    {
        var result = new Dictionary<string, PersonMediaOverride>(StringComparer.Ordinal);
        var snapshot = await OperationDeadline.RunAsync(OperationTimeout, cancellationToken,
            ct => _mediaOverrides.GetSnapshotAsync(ct), "Firestore media overrides read");
        foreach (var doc in snapshot.Documents)
        {
            var media = MediaFrom(doc);
            if (media is not null)
            {
                result[doc.Id] = media;
            }
        }

        return result;
    }

    private static Dictionary<string, object> PhotoMap(Photo p) => new()
    {
        ["id"] = p.Id, ["full"] = p.Full, ["thumb"] = p.Thumb
    };

    internal static Dictionary<string, object?> ResidenceMap(Residence r) => new()
    {
        ["placeRu"] = r.Place.Ru,
        ["placeBe"] = r.Place.Be,
        ["placeEn"] = r.Place.En,
        ["fromYear"] = r.FromYear.HasValue ? (long?)r.FromYear.Value : null,
        ["toYear"] = r.ToYear.HasValue ? (long?)r.ToYear.Value : null,
        ["lat"] = r.Lat,
        ["lng"] = r.Lng,
        ["mapUrl"] = r.MapUrl
    };

    internal static Residence ReadResidence(Dictionary<string, object> m)
    {
        string? Str(string k) => m.TryGetValue(k, out var v) && v is string s && s.Length > 0 ? s : null;
        int? Int(string k) => m.TryGetValue(k, out var v) && v is long l ? (int?)l : null;
        double? Dbl(string k) => m.TryGetValue(k, out var v) && v is double d ? d : null;
        return new Residence
        {
            Place = new LocalizedText { Ru = Str("placeRu"), Be = Str("placeBe"), En = Str("placeEn") },
            FromYear = Int("fromYear"),
            ToYear = Int("toYear"),
            Lat = Dbl("lat"),
            Lng = Dbl("lng"),
            MapUrl = Str("mapUrl")
        };
    }

    private static PersonMediaOverride? MediaFrom(DocumentSnapshot doc)
    {
        if (!doc.ContainsField("portrait") && !doc.ContainsField("gallery") && !doc.ContainsField("hiddenSeeds"))
        {
            return null;
        }

        Photo? portrait = null;
        if (doc.TryGetValue<Dictionary<string, object>>("portrait", out var pm) && pm is not null)
        {
            portrait = ReadPhoto(pm);
        }

        var gallery = new List<Photo>();
        if (doc.TryGetValue<List<object>>("gallery", out var arr) && arr is not null)
        {
            foreach (var item in arr.OfType<Dictionary<string, object>>())
            {
                gallery.Add(ReadPhoto(item));
            }
        }

        var hiddenSeeds = new List<string>();
        if (doc.TryGetValue<List<object>>("hiddenSeeds", out var hidden) && hidden is not null)
        {
            hiddenSeeds.AddRange(hidden.OfType<string>());
        }

        return new PersonMediaOverride(portrait, gallery) { HiddenSeeds = hiddenSeeds };
    }

    private static Photo ReadPhoto(Dictionary<string, object> m) =>
        new((string)m["id"], (string)m["full"], (string)m["thumb"]);

    private static LocalizedText? LatestFrom(DocumentSnapshot doc)
    {
        // Use the override as long as it carries at least one biography field. A missing
        // locale is read as "" (and resolves through the locale fallback), so a partial
        // document still surfaces the locales it does have rather than being dropped
        // wholesale. Only a document with none of the three fields is not an override.
        if (!doc.ContainsField("biographyRu") && !doc.ContainsField("biographyBe") && !doc.ContainsField("biographyEn"))
        {
            return null;
        }

        return new LocalizedText
        {
            Ru = ReadString(doc, "biographyRu"),
            Be = ReadString(doc, "biographyBe"),
            En = ReadString(doc, "biographyEn")
        };
    }

    private static string ReadString(DocumentSnapshot doc, string field) =>
        doc.TryGetValue<string>(field, out var value) ? value : "";

    public async Task AppendProfileAsync(string personId, PersonProfileOverride profile, string editorEmail, CancellationToken cancellationToken)
    {
        var snapshot = new Dictionary<string, object?>
        {
            ["givenNameRu"] = profile.GivenName?.Ru,
            ["givenNameBe"] = profile.GivenName?.Be,
            ["givenNameEn"] = profile.GivenName?.En,
            ["surnameRu"] = profile.Surname?.Ru,
            ["surnameBe"] = profile.Surname?.Be,
            ["surnameEn"] = profile.Surname?.En,
            ["maidenNameRu"] = profile.MaidenName?.Ru,
            ["maidenNameBe"] = profile.MaidenName?.Be,
            ["maidenNameEn"] = profile.MaidenName?.En,
            ["middleNameRu"] = profile.MiddleName?.Ru,
            ["middleNameBe"] = profile.MiddleName?.Be,
            ["middleNameEn"] = profile.MiddleName?.En,
            ["sex"] = profile.Sex?.ToString(),
            ["birthYear"] = profile.BirthYear.HasValue ? (long?)profile.BirthYear.Value : null,
            ["birthMonth"] = profile.BirthMonth.HasValue ? (long?)profile.BirthMonth.Value : null,
            ["birthDay"] = profile.BirthDay.HasValue ? (long?)profile.BirthDay.Value : null,
            ["deathYear"] = profile.DeathYear.HasValue ? (long?)profile.DeathYear.Value : null,
            ["deathMonth"] = profile.DeathMonth.HasValue ? (long?)profile.DeathMonth.Value : null,
            ["deathDay"] = profile.DeathDay.HasValue ? (long?)profile.DeathDay.Value : null,
            ["vocation"] = profile.Vocation?.ToString(),
            ["residences"] = profile.Residences?.Select(ResidenceMap).ToList(),
            ["editorEmail"] = editorEmail,
            ["editedAt"] = FieldValue.ServerTimestamp
        };

        var parent = _profileOverrides.Document(personId);
        var batch = _db.StartBatch();
        batch.Set(parent, snapshot);
        batch.Create(parent.Collection(VersionsSubcollection).Document(), snapshot);
        await OperationDeadline.RunAsync(OperationTimeout, cancellationToken,
            ct => batch.CommitAsync(ct), "Firestore profile write");
    }

    public async Task<PersonProfileOverride?> GetLatestProfileAsync(string personId, CancellationToken cancellationToken)
    {
        var snapshot = await OperationDeadline.RunAsync(OperationTimeout, cancellationToken,
            ct => _profileOverrides.Document(personId).GetSnapshotAsync(ct), "Firestore profile read");
        return snapshot.Exists ? ProfileFrom(snapshot) : null;
    }

    public async Task<IReadOnlyDictionary<string, PersonProfileOverride>> GetLatestProfilesAsync(CancellationToken cancellationToken)
    {
        var result = new Dictionary<string, PersonProfileOverride>(StringComparer.Ordinal);
        var snapshot = await OperationDeadline.RunAsync(OperationTimeout, cancellationToken,
            ct => _profileOverrides.GetSnapshotAsync(ct), "Firestore profile overrides read");
        foreach (var doc in snapshot.Documents)
        {
            var profile = ProfileFrom(doc);
            if (profile is not null)
            {
                result[doc.Id] = profile;
            }
        }

        return result;
    }

    private static PersonProfileOverride? ProfileFrom(DocumentSnapshot doc)
    {
        LocalizedText? Name(string prefix)
        {
            var ru = NullableString(doc, prefix + "Ru");
            var be = NullableString(doc, prefix + "Be");
            var en = NullableString(doc, prefix + "En");
            return (ru is null && be is null && en is null) ? null : new LocalizedText { Ru = ru, Be = be, En = en };
        }

        var given = Name("givenName");
        var surname = Name("surname");
        var maiden = Name("maidenName");
        var middle = Name("middleName");
        var sex = Enum.TryParse<Sex>(NullableString(doc, "sex"), out var s) ? s : (Sex?)null;
        var vocation = Enum.TryParse<Vocation>(NullableString(doc, "vocation"), out var v) ? v : (Vocation?)null;
        var birth = IntField(doc, "birthYear");
        var birthMonth = IntField(doc, "birthMonth");
        var birthDay = IntField(doc, "birthDay");
        var death = IntField(doc, "deathYear");
        var deathMonth = IntField(doc, "deathMonth");
        var deathDay = IntField(doc, "deathDay");

        List<Residence>? residences = null;
        if (doc.TryGetValue<List<object>>("residences", out var resArr) && resArr is not null)
        {
            residences = resArr.OfType<Dictionary<string, object>>().Select(ReadResidence).ToList();
        }

        if (given is null && surname is null && maiden is null && middle is null && sex is null && vocation is null
            && birth is null && birthMonth is null && birthDay is null
            && death is null && deathMonth is null && deathDay is null
            && residences is null)
        {
            return null;
        }

        return new PersonProfileOverride
        {
            GivenName = given, Surname = surname, MaidenName = maiden, MiddleName = middle,
            Sex = sex, Vocation = vocation,
            BirthYear = birth, BirthMonth = birthMonth, BirthDay = birthDay,
            DeathYear = death, DeathMonth = deathMonth, DeathDay = deathDay,
            Residences = residences
        };
    }

    private static string? NullableString(DocumentSnapshot doc, string field) =>
        doc.TryGetValue<string>(field, out var value) && !string.IsNullOrEmpty(value) ? value : null;

    // Firestore stores integers as long. Read as long? (not long): optional fields with no
    // value are written as an explicit Firestore null (see AppendProfileAsync), and
    // TryGetValue<long> throws ArgumentException trying to convert that null into a
    // non-nullable value type instead of returning false.
    private static int? IntField(DocumentSnapshot doc, string field) =>
        doc.TryGetValue<long?>(field, out var value) ? (int?)value : null;
}
