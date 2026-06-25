using System.Security.Cryptography;
using System.Text;
using Microsoft.Extensions.Options;

namespace FamilyTree.Api.Security;

/// <summary>Constant-time check of the Cloudflare proxy's shared origin secret; dormant unless a non-blank secret is configured.</summary>
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
            // |= (no short-circuit) evaluates every secret so timing leaks neither match position nor success.
            trusted |= CryptographicOperations.FixedTimeEquals(candidate, secret);
        }

        return trusted;
    }
}
