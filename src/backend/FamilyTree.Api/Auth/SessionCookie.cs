using Microsoft.AspNetCore.Http;

namespace FamilyTree.Api.Auth;

/// <summary>
/// Builds the session cookie's attributes in one place so the controller (which sets
/// it at sign-in) and the auth handler (which re-sets it on sliding renewal) never
/// drift. HttpOnly + Secure + SameSite=Lax + host-only (no Domain).
/// </summary>
public static class SessionCookie
{
    public static CookieOptions Build(SessionOptions options)
    {
        return new CookieOptions
        {
            HttpOnly = true,
            Secure = true,
            SameSite = SameSiteMode.Lax,
            Path = "/",
            MaxAge = TimeSpan.FromDays(options.LifetimeDays)
        };
    }
}
