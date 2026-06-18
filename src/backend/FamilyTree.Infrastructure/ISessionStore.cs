namespace FamilyTree.Infrastructure;

public interface ISessionStore
{
    Task<string> CreateAsync(Session session, CancellationToken cancellationToken);
    Task<Session?> GetAsync(string token, CancellationToken cancellationToken);

    /// <summary>
    /// Extends a session's expiry and issues a fresh token, invalidating the old one
    /// (rotation on renewal — a leaked-then-renewed token stops working). Returns the
    /// new token, or null if no session matched the old token.
    /// </summary>
    Task<string?> RotateAsync(string oldToken, DateTimeOffset newExpiresAt, CancellationToken cancellationToken);

    Task DeleteAsync(string token, CancellationToken cancellationToken);
}
