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
    private readonly CollectionReference _sessions;

    public FirestoreSessionStore(FirestoreDb db, IOptions<FirestoreOptions> options)
    {
        _sessions = db.Collection(options.Value.SessionsCollection);
    }

    public async Task<string> CreateAsync(Session session, CancellationToken cancellationToken)
    {
        var token = Base64UrlEncode(RandomNumberGenerator.GetBytes(32));
        await _sessions.Document(Hash(token)).SetAsync(ToDocument(session), cancellationToken: cancellationToken);
        return token;
    }

    public async Task<Session?> GetAsync(string token, CancellationToken cancellationToken)
    {
        var snapshot = await _sessions.Document(Hash(token)).GetSnapshotAsync(cancellationToken);
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
        var snapshot = await oldDoc.GetSnapshotAsync(cancellationToken);
        if (!snapshot.Exists)
        {
            return null;
        }

        var session = FromDocument(snapshot) with { ExpiresAt = newExpiresAt };
        var newToken = Base64UrlEncode(RandomNumberGenerator.GetBytes(32));
        await _sessions.Document(Hash(newToken)).SetAsync(ToDocument(session), cancellationToken: cancellationToken);
        await oldDoc.DeleteAsync(cancellationToken: cancellationToken);
        return newToken;
    }

    public Task DeleteAsync(string token, CancellationToken cancellationToken)
    {
        return _sessions.Document(Hash(token)).DeleteAsync(cancellationToken: cancellationToken);
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
