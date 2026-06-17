using FamilyTree.Infrastructure;
using Microsoft.Extensions.Options;

namespace FamilyTree.Api.Auth;

public sealed class SessionManager : ISessionManager
{
    private readonly IGoogleIdTokenValidator _validator;
    private readonly ISessionStore _store;
    private readonly GoogleAuthOptions _googleOptions;
    private readonly SessionAuthOptions _sessionOptions;

    public SessionManager(
        IGoogleIdTokenValidator validator,
        ISessionStore store,
        IOptions<GoogleAuthOptions> googleOptions,
        IOptions<SessionAuthOptions> sessionOptions)
    {
        _validator = validator;
        _store = store;
        _googleOptions = googleOptions.Value;
        _sessionOptions = sessionOptions.Value;
    }

    public async Task<SignInResult?> SignInAsync(string idToken, CancellationToken cancellationToken)
    {
        var identity = await _validator.ValidateAsync(idToken, cancellationToken);
        if (identity is null)
        {
            return null;
        }

        var canEdit = _googleOptions.Editors.Contains(identity.Email, StringComparer.OrdinalIgnoreCase);
        var now = DateTimeOffset.UtcNow;
        var session = new Session
        {
            Email = identity.Email,
            Name = identity.Name,
            CanEdit = canEdit,
            CreatedAt = now,
            ExpiresAt = now.AddDays(_sessionOptions.LifetimeDays)
        };

        var token = await _store.CreateAsync(session, cancellationToken);
        return new SignInResult(token, new SessionIdentity(identity.Email, identity.Name, canEdit));
    }

    public Task SignOutAsync(string token, CancellationToken cancellationToken)
    {
        return _store.DeleteAsync(token, cancellationToken);
    }
}
