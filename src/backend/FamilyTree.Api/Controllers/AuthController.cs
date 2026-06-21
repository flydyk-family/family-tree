using System.Security.Claims;
using FamilyTree.Api.Auth;
using Microsoft.AspNetCore.Authorization;
using Microsoft.Extensions.Options;

namespace FamilyTree.Api.Controllers;

[ApiController]
[Route("api/auth")]
public sealed class AuthController : ControllerBase
{
    private readonly ISessionManager _sessionManager;
    private readonly SessionAuthOptions _sessionOptions;

    public AuthController(ISessionManager sessionManager, IOptions<SessionAuthOptions> sessionOptions)
    {
        _sessionManager = sessionManager;
        _sessionOptions = sessionOptions.Value;
    }

    [HttpPost("session")]
    [AllowAnonymous]
    public async Task<ActionResult<MeResponse>> SignIn([FromBody] LoginRequest request, CancellationToken cancellationToken)
    {
        var result = await _sessionManager.SignInAsync(request.IdToken, cancellationToken);
        if (result is null)
        {
            return Unauthorized();
        }

        Response.Cookies.Append(_sessionOptions.CookieName, result.Token, SessionCookie.Build(_sessionOptions));
        return Ok(new MeResponse(true, result.Identity.Email, result.Identity.Name, result.Identity.CanEdit));
    }

    [HttpPost("logout")]
    [AllowAnonymous]
    public async Task<IActionResult> Logout(CancellationToken cancellationToken)
    {
        if (Request.Cookies.TryGetValue(_sessionOptions.CookieName, out var token) && !string.IsNullOrEmpty(token))
        {
            await _sessionManager.SignOutAsync(token, cancellationToken);
        }

        Response.Cookies.Delete(_sessionOptions.CookieName, SessionCookie.BuildForDeletion());
        return NoContent();
    }

    // Anonymous-friendly: returns 200 with SignedIn=false rather than 401 so a
    // not-signed-in page load isn't a console/network error. The Session scheme is
    // the default, so a valid cookie still populates User here (sliding renewal runs
    // in the handler regardless). Edit actions stay gated by the CanEdit policy.
    [HttpGet("me")]
    [AllowAnonymous]
    public ActionResult<MeResponse> Me()
    {
        if (User.Identity?.IsAuthenticated != true)
        {
            return Ok(new MeResponse(false, "", "", false));
        }

        var email = User.FindFirstValue(ClaimTypes.Email) ?? "";
        var name = User.FindFirstValue(ClaimTypes.Name) ?? "";
        var canEdit = User.FindFirstValue(SessionAuthenticationHandler.CanEditClaimType) == "true";
        return Ok(new MeResponse(true, email, name, canEdit));
    }
}
