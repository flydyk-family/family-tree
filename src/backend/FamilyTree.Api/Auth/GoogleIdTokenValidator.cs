using Google.Apis.Auth;
using Microsoft.Extensions.Options;
using System.Diagnostics.CodeAnalysis;

namespace FamilyTree.Api.Auth;

/// <summary>
/// Verifies a Google ID token once at sign-in: audience must be our client ID and
/// the email must be verified. Returns null for any invalid token. This is the only
/// place a Google token is touched — there is no per-request Google validation.
/// </summary>
// Thin adapter over Google.Apis.Auth's static GoogleJsonWebSignature.ValidateAsync —
// requires a live Google call and an unmockable static API, so it is verified via the
// IGoogleIdTokenValidator seam + integration fake rather than unit tests.
[ExcludeFromCodeCoverage]
public sealed class GoogleIdTokenValidator : IGoogleIdTokenValidator
{
    private readonly GoogleAuthOptions _options;

    public GoogleIdTokenValidator(IOptions<GoogleAuthOptions> options)
    {
        _options = options.Value;
    }

    public async Task<GoogleIdentity?> ValidateAsync(string idToken, CancellationToken cancellationToken)
    {
        if (string.IsNullOrWhiteSpace(idToken))
        {
            return null;
        }

        try
        {
            var settings = new GoogleJsonWebSignature.ValidationSettings
            {
                Audience = new[] { _options.ClientId }
            };

            var payload = await GoogleJsonWebSignature.ValidateAsync(idToken, settings);
            if (payload is null || !payload.EmailVerified)
            {
                return null;
            }

            return new GoogleIdentity(payload.Email, payload.Name);
        }
        catch (InvalidJwtException)
        {
            return null;
        }
    }
}
