using System.Security.Claims;
using System.Text.Encodings.Web;
using FamilyTree.Infrastructure;
using Microsoft.AspNetCore.Authentication;
using Microsoft.Extensions.Options;

namespace FamilyTree.Api.Auth;

/// <summary>
/// Per-request cookie-session authentication. Reads the opaque token from the session
/// cookie, looks it up in ISessionStore, and builds a ClaimsPrincipal (name, email,
/// canEdit). The canEdit claim is re-derived from the CURRENT editor allow-list on every
/// request (not the value frozen into the session at sign-in), so removing an editor takes
/// effect immediately and adding one is honoured without a re-login. Applies 7-day sliding
/// renewal: past the session half-life it rotates the token, extends the expiry, and
/// re-sets the cookie. No Google token is touched here.
/// </summary>
public sealed class SessionAuthenticationHandler : AuthenticationHandler<AuthenticationSchemeOptions>
{
    public const string SchemeName = "Session";
    public const string CanEditClaimType = "canEdit";

    private readonly ISessionStore _store;
    private readonly SessionAuthOptions _sessionOptions;
    private readonly GoogleAuthOptions _googleOptions;

    public SessionAuthenticationHandler(
        IOptionsMonitor<AuthenticationSchemeOptions> options,
        ILoggerFactory logger,
        UrlEncoder encoder,
        ISessionStore store,
        IOptions<SessionAuthOptions> sessionOptions,
        IOptions<GoogleAuthOptions> googleOptions)
        : base(options, logger, encoder)
    {
        _store = store;
        _sessionOptions = sessionOptions.Value;
        _googleOptions = googleOptions.Value;
    }

    protected override async Task<AuthenticateResult> HandleAuthenticateAsync()
    {
        if (!Request.Cookies.TryGetValue(_sessionOptions.CookieName, out var token) || string.IsNullOrEmpty(token))
        {
            return AuthenticateResult.NoResult();
        }

        var session = await _store.GetAsync(token, Context.RequestAborted);
        if (session is null)
        {
            Logger.LogDebug("Session cookie was present but no active session was found (expired or revoked).");
            return AuthenticateResult.Fail("Session not found or expired.");
        }

        if (_sessionOptions.SlidingRenewal)
        {
            var halfLife = session.CreatedAt + (session.ExpiresAt - session.CreatedAt) / 2;
            if (DateTimeOffset.UtcNow > halfLife)
            {
                var newExpiresAt = DateTimeOffset.UtcNow.AddDays(_sessionOptions.LifetimeDays);
                var rotatedToken = await _store.RotateAsync(token, newExpiresAt, Context.RequestAborted);
                if (rotatedToken is not null)
                {
                    Response.Cookies.Append(_sessionOptions.CookieName, rotatedToken, SessionCookie.Build(_sessionOptions));
                }
            }
        }

        // Authoritative gate: re-evaluate against the live allow-list rather than trusting
        // the canEdit flag stored at sign-in (which can go stale — e.g. a Firestore session
        // that outlived a redeploy that removed the editor).
        var canEdit = _googleOptions.Editors.Contains(session.Email, StringComparer.OrdinalIgnoreCase);

        var claims = new[]
        {
            new Claim(ClaimTypes.Name, session.Name),
            new Claim(ClaimTypes.Email, session.Email),
            new Claim(CanEditClaimType, canEdit ? "true" : "false")
        };

        var identity = new ClaimsIdentity(claims, SchemeName);
        var principal = new ClaimsPrincipal(identity);
        var ticket = new AuthenticationTicket(principal, SchemeName);
        return AuthenticateResult.Success(ticket);
    }
}
