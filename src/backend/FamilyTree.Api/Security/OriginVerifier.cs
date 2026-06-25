using System.Security.Cryptography;
using System.Text;
using Microsoft.Extensions.Options;

namespace FamilyTree.Api.Security;

/// <summary>
/// Decides whether a request carries a valid origin-verification secret (the Cloudflare
/// proxy's shared header). Enabled only when at least one non-blank secret is configured,
/// so it is dormant in local dev / CI. Comparison is constant-time; the secret is never
/// logged or exposed.
/// </summary>
public sealed class OriginVerifier
{
    private readonly byte[][] _secrets;

    public OriginVerifier(IOptions<OriginVerifyOptions> options)
    {
        _secrets = options.Value.Secrets
            .Where(secret => !string.IsNullOrWhiteSpace(secret))
            .Select(Encoding.UTF8.GetBytes)
            .ToArray();
    }

    /// <summary>True when at least one non-blank secret is configured (production); false in dev/CI.</summary>
    public bool IsEnabled => _secrets.Length > 0;

    /// <summary>True iff the supplied header value matches any configured secret (constant-time).</summary>
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
            // Evaluate every secret (|= does not short-circuit) so neither the match position
            // nor whether one matched leaks via timing. FixedTimeEquals handles length mismatch.
            trusted |= CryptographicOperations.FixedTimeEquals(candidate, secret);
        }

        return trusted;
    }
}
