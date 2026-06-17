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
        if (!_sessions.TryGetValue(Hash(token), out var session))
        {
            return Task.FromResult<Session?>(null);
        }

        if (session.ExpiresAt <= DateTimeOffset.UtcNow)
        {
            return Task.FromResult<Session?>(null);
        }

        return Task.FromResult<Session?>(session);
    }

    public Task RenewAsync(string token, DateTimeOffset newExpiresAt, CancellationToken cancellationToken)
    {
        var key = Hash(token);
        if (_sessions.TryGetValue(key, out var session))
        {
            _sessions[key] = session with { ExpiresAt = newExpiresAt };
        }

        return Task.CompletedTask;
    }

    public Task DeleteAsync(string token, CancellationToken cancellationToken)
    {
        _sessions.TryRemove(Hash(token), out _);
        return Task.CompletedTask;
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
