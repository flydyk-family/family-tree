using System.Security.Claims;
using System.Text.Encodings.Web;
using FamilyTree.Infrastructure;
using Microsoft.AspNetCore.Authentication;
using Microsoft.Extensions.Options;

namespace FamilyTree.Api.Auth;

/// <summary>
/// Per-request cookie-session authentication. Reads the opaque token from the session
/// cookie, looks it up in ISessionStore, and builds a ClaimsPrincipal (name, email,
/// canEdit). Applies 7-day sliding renewal: past the session half-life it extends the
/// expiry and re-sets the cookie. No Google token is touched here.
/// </summary>
public sealed class SessionAuthenticationHandler : AuthenticationHandler<AuthenticationSchemeOptions>
{
    public const string SchemeName = "Session";
    public const string CanEditClaimType = "canEdit";

    private readonly ISessionStore _store;
    private readonly SessionOptions _sessionOptions;

    public SessionAuthenticationHandler(
        IOptionsMonitor<AuthenticationSchemeOptions> options,
        ILoggerFactory logger,
        UrlEncoder encoder,
        ISessionStore store,
        IOptions<SessionOptions> sessionOptions)
        : base(options, logger, encoder)
    {
        _store = store;
        _sessionOptions = sessionOptions.Value;
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
            return AuthenticateResult.Fail("Session not found or expired.");
        }

        if (_sessionOptions.SlidingRenewal)
        {
            var halfLife = session.CreatedAt + (session.ExpiresAt - session.CreatedAt) / 2;
            if (DateTimeOffset.UtcNow > halfLife)
            {
                var newExpiresAt = DateTimeOffset.UtcNow.AddDays(_sessionOptions.LifetimeDays);
                await _store.RenewAsync(token, newExpiresAt, Context.RequestAborted);
                Response.Cookies.Append(_sessionOptions.CookieName, token, SessionCookie.Build(_sessionOptions));
            }
        }

        var claims = new[]
        {
            new Claim(ClaimTypes.Name, session.Name),
            new Claim(ClaimTypes.Email, session.Email),
            new Claim(CanEditClaimType, session.CanEdit ? "true" : "false")
        };

        var identity = new ClaimsIdentity(claims, SchemeName);
        var principal = new ClaimsPrincipal(identity);
        var ticket = new AuthenticationTicket(principal, SchemeName);
        return AuthenticateResult.Success(ticket);
    }
}
