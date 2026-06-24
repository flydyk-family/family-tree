using System.Diagnostics.CodeAnalysis;
using System.Security.Cryptography;
using System.Text;
using Google.Cloud.Firestore;
using Microsoft.Extensions.Options;

namespace FamilyTree.Infrastructure;

/// <summary>
/// Firestore-backed revocable session store for deployment. Documents live in the
/// configured collection keyed by SHA-256(token) — a store leak exposes no usable
/// token. Revocation = delete the document. [ExcludeFromCodeCoverage]: a thin SDK
/// wrapper with no testable branching, verified only against the Firestore emulator
/// (optional, not required by CI) — same rationale as GoogleIdTokenValidator.
/// </summary>
[ExcludeFromCodeCoverage]
public sealed class FirestoreSessionStore : ISessionStore
{
    // App-imposed deadline so a hung Firestore call on the sign-in / per-request auth path
    // fails fast rather than tying up the request indefinitely. Generous: a single-document
    // read/write is normally milliseconds.
    private static readonly TimeSpan OperationTimeout = TimeSpan.FromSeconds(15);

    private readonly FirestoreDb _db;
    private readonly CollectionReference _sessions;

    public FirestoreSessionStore(FirestoreDb db, IOptions<FirestoreOptions> options)
    {
        _db = db;
        _sessions = db.Collection(options.Value.SessionsCollection);
    }

    public async Task<string> CreateAsync(Session session, CancellationToken cancellationToken)
    {
        var token = Base64UrlEncode(RandomNumberGenerator.GetBytes(32));
        await OperationDeadline.RunAsync(OperationTimeout, cancellationToken,
            ct => _sessions.Document(Hash(token)).SetAsync(ToDocument(session), cancellationToken: ct),
            "Firestore session create");
        return token;
    }

    public async Task<Session?> GetAsync(string token, CancellationToken cancellationToken)
    {
        var snapshot = await OperationDeadline.RunAsync(OperationTimeout, cancellationToken,
            ct => _sessions.Document(Hash(token)).GetSnapshotAsync(ct),
            "Firestore session read");
        if (!snapshot.Exists)
        {
            return null;
        }

        var session = FromDocument(snapshot);
        return session.ExpiresAt <= DateTimeOffset.UtcNow ? null : session;
    }

    public async Task<string?> RotateAsync(string oldToken, DateTimeOffset newExpiresAt, CancellationToken cancellationToken)
    {
        var oldDoc = _sessions.Document(Hash(oldToken));
        var snapshot = await OperationDeadline.RunAsync(OperationTimeout, cancellationToken,
            ct => oldDoc.GetSnapshotAsync(ct),
            "Firestore session read");
        if (!snapshot.Exists)
        {
            return null;
        }

        var session = FromDocument(snapshot) with { ExpiresAt = newExpiresAt };
        var newToken = Base64UrlEncode(RandomNumberGenerator.GetBytes(32));

        // One atomic batch: write the rotated session AND delete the old one together, so the
        // process can never die between the two writes leaving both tokens valid at once.
        var batch = _db.StartBatch();
        batch.Set(_sessions.Document(Hash(newToken)), ToDocument(session));
        batch.Delete(oldDoc);
        await OperationDeadline.RunAsync(OperationTimeout, cancellationToken,
            ct => batch.CommitAsync(ct),
            "Firestore session rotate");
        return newToken;
    }

    public Task DeleteAsync(string token, CancellationToken cancellationToken)
    {
        return OperationDeadline.RunAsync(OperationTimeout, cancellationToken,
            ct => _sessions.Document(Hash(token)).DeleteAsync(cancellationToken: ct),
            "Firestore session delete");
    }

    private static Dictionary<string, object> ToDocument(Session session) => new()
    {
        ["email"] = session.Email,
        ["name"] = session.Name,
        ["canEdit"] = session.CanEdit,
        ["createdAt"] = session.CreatedAt.UtcDateTime,
        ["expiresAt"] = session.ExpiresAt.UtcDateTime
    };

    private static Session FromDocument(DocumentSnapshot doc) => new()
    {
        Email = doc.GetValue<string>("email"),
        Name = doc.GetValue<string>("name"),
        CanEdit = doc.GetValue<bool>("canEdit"),
        CreatedAt = doc.GetValue<DateTime>("createdAt"),
        ExpiresAt = doc.GetValue<DateTime>("expiresAt")
    };

    private static string Hash(string token)
    {
        var bytes = SHA256.HashData(Encoding.UTF8.GetBytes(token));
        return Convert.ToHexString(bytes);
    }

    private static string Base64UrlEncode(byte[] bytes) =>
        Convert.ToBase64String(bytes).TrimEnd('=').Replace('+', '-').Replace('/', '_');
}
