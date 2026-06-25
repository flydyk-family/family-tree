using System.Security.Cryptography;
using System.Text;
using Microsoft.Extensions.Options;

namespace FamilyTree.Api.Security;

/// <summary>
/// Verifies a request's origin-verification secret against the configured set in constant time;
/// dormant (disabled) until at least one non-blank secret is configured.
/// </summary>
public sealed class OriginVerifier
{
    private readonly byte[][] _secrets;

    public OriginVerifier(IOptions<OriginVerifyOptions> options)
    {
        _secrets = options.Value.Secrets
            .Where(secret => !string.IsNullOrWhiteSpace(secret))
            .Select(secret => Encoding.UTF8.GetBytes(secret.Trim()))
            .ToArray();
    }

    /// <summary>Whether at least one non-blank secret is configured (the gate is enforced); false in local dev / CI.</summary>
    public bool IsEnabled => _secrets.Length > 0;

    /// <summary>Whether <paramref name="headerValue"/> matches any configured secret, compared in constant time.</summary>
    /// <param name="headerValue">The <c>X-Origin-Verify</c> header value from the request, or null/empty if absent.</param>
    /// <returns><c>true</c> if it matches a configured secret; otherwise <c>false</c>.</returns>
    public bool IsTrusted(string? headerValue)
    {
        if (string.IsNullOrEmpty(headerValue))
        {
            return false;
        }

        var candidate = Encoding.UTF8.GetBytes(headerValue);
        var trusted = false;
        foreach (var secret in _secrets)
        {
            // |= (no short-circuit) evaluates every secret so timing leaks neither match position nor success.
            trusted |= CryptographicOperations.FixedTimeEquals(candidate, secret);
        }

        return trusted;
    }
}
