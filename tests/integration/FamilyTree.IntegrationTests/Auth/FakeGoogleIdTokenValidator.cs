using FamilyTree.Api.Auth;

namespace FamilyTree.IntegrationTests.Auth;

/// <summary>
/// Test double for IGoogleIdTokenValidator: maps known fake idToken strings to
/// identities, and returns null for anything else (an "invalid" token). No network.
/// </summary>
public sealed class FakeGoogleIdTokenValidator : IGoogleIdTokenValidator
{
    public const string EditorIdToken = "fake-editor-token";
    public const string GuestIdToken = "fake-guest-token";
    public const string EditorEmail = "editor@example.com";
    public const string GuestEmail = "guest@example.com";

    public Task<GoogleIdentity?> ValidateAsync(string idToken, CancellationToken cancellationToken)
    {
        GoogleIdentity? identity = idToken switch
        {
            EditorIdToken => new GoogleIdentity(EditorEmail, "Editor One"),
            GuestIdToken => new GoogleIdentity(GuestEmail, "Guest One"),
            _ => null
        };

        return Task.FromResult(identity);
    }
}
