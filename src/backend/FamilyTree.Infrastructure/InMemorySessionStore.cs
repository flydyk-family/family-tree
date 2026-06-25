using System.Collections.Concurrent;
using System.Security.Cryptography;

namespace FamilyTree.Infrastructure;

/// <summary>
/// In-memory, revocable session store for local dev and tests. The opaque token is
/// 32 cryptographically-random bytes (Base64Url); the dictionary is keyed by the
/// SHA-256 hex of the token, so a store leak never exposes a usable token.
/// </summary>
public sealed class InMemorySessionStore : ISessionStore
{
    private readonly ConcurrentDictionary<string, Session> _sessions = new(StringComparer.Ordinal);

    public Task<string> CreateAsync(Session session, CancellationToken cancellationToken)
    {
        var token = Base64UrlEncode(RandomNumberGenerator.GetBytes(32));
        _sessions[Hash(token)] = session;
        return Task.FromResult(token);
    }

    public Task<Session?> GetAsync(string token, CancellationToken cancellationToken)
    {
        var key = Hash(token);
        if (!_sessions.TryGetValue(key, out var session))
        {
            return Task.FromResult<Session?>(null);
        }

        if (session.ExpiresAt <= DateTimeOffset.UtcNow)
        {
            // Lazy eviction: drop the expired entry on read so it can't linger after the
            // owner stops presenting its cookie. The periodic sweep (EvictExpired) covers
            // sessions that are never read again.
            _sessions.TryRemove(key, out _);
            return Task.FromResult<Session?>(null);
        }

        return Task.FromResult<Session?>(session);
    }

    public Task<string?> RotateAsync(string oldToken, DateTimeOffset newExpiresAt, CancellationToken cancellationToken)
    {
        if (!_sessions.TryRemove(Hash(oldToken), out var session))
        {
            return Task.FromResult<string?>(null);
        }

        var newToken = Base64UrlEncode(RandomNumberGenerator.GetBytes(32));
        _sessions[Hash(newToken)] = session with { ExpiresAt = newExpiresAt };
        return Task.FromResult<string?>(newToken);
    }

    public Task DeleteAsync(string token, CancellationToken cancellationToken)
    {
        _sessions.TryRemove(Hash(token), out _);
        return Task.CompletedTask;
    }

    /// <summary>
    /// Removes every expired session and returns how many were dropped. Called periodically
    /// by <see cref="ExpiredSessionSweeper"/> so abandoned sessions (never read again, hence
    /// never lazily evicted) cannot accumulate without bound.
    /// </summary>
    public int EvictExpired()
    {
        var now = DateTimeOffset.UtcNow;
        var removed = 0;
        foreach (var entry in _sessions)
        {
            if (entry.Value.ExpiresAt <= now && _sessions.TryRemove(entry.Key, out _))
            {
                removed++;
            }
        }

        return removed;
    }

    private static string Hash(string token)
    {
        var bytes = SHA256.HashData(System.Text.Encoding.UTF8.GetBytes(token));
        return Convert.ToHexString(bytes);
    }

    private static string Base64UrlEncode(byte[] bytes)
    {
        return Convert.ToBase64String(bytes)
            .TrimEnd('=')
            .Replace('+', '-')
            .Replace('/', '_');
    }
}
