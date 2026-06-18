using Microsoft.AspNetCore.Http;

namespace FamilyTree.Api.Auth;

/// <summary>
/// Builds the session cookie's attributes in one place so the controller (which sets
/// it at sign-in) and the auth handler (which re-sets it on sliding renewal) never
/// drift. HttpOnly + Secure + SameSite=Lax + host-only (no Domain).
/// </summary>
public static class SessionCookie
{
    public static CookieOptions Build(SessionAuthOptions options)
    {
        var cookie = BaseAttributes();
        cookie.MaxAge = TimeSpan.FromDays(options.LifetimeDays);
        return cookie;
    }

    /// <summary>
    /// Attributes for clearing the cookie on logout. Must match the sign-in attributes
    /// (Path/Secure/SameSite) so the browser reliably removes the right cookie; the
    /// expiry is set by <c>Response.Cookies.Delete</c>, so no MaxAge here.
    /// </summary>
    public static CookieOptions BuildForDeletion()
    {
        return BaseAttributes();
    }

    private static CookieOptions BaseAttributes()
    {
        return new CookieOptions
        {
            HttpOnly = true,
            Secure = true,
            SameSite = SameSiteMode.Lax,
            Path = "/"
        };
    }
}
