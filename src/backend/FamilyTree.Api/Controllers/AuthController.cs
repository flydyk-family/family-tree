using System.Security.Claims;
using FamilyTree.Api.Auth;
using Microsoft.AspNetCore.Authorization;
using Microsoft.Extensions.Options;
using SessionOptions = FamilyTree.Api.Auth.SessionOptions;

namespace FamilyTree.Api.Controllers;

[ApiController]
[Route("api/auth")]
public sealed class AuthController : ControllerBase
{
    private readonly ISessionManager _sessionManager;
    private readonly SessionOptions _sessionOptions;

    public AuthController(ISessionManager sessionManager, IOptions<SessionOptions> sessionOptions)
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
        return Ok(new MeResponse(result.Identity.Email, result.Identity.Name, result.Identity.CanEdit));
    }

    [HttpPost("logout")]
    [AllowAnonymous]
    public async Task<IActionResult> Logout(CancellationToken cancellationToken)
    {
        if (Request.Cookies.TryGetValue(_sessionOptions.CookieName, out var token) && !string.IsNullOrEmpty(token))
        {
            await _sessionManager.SignOutAsync(token, cancellationToken);
        }

        Response.Cookies.Delete(_sessionOptions.CookieName);
        return NoContent();
    }

    [HttpGet("me")]
    [Authorize(AuthenticationSchemes = SessionAuthenticationHandler.SchemeName)]
    public ActionResult<MeResponse> Me()
    {
        var email = User.FindFirstValue(ClaimTypes.Email) ?? "";
        var name = User.FindFirstValue(ClaimTypes.Name) ?? "";
        var canEdit = User.FindFirstValue(SessionAuthenticationHandler.CanEditClaimType) == "true";
        return Ok(new MeResponse(email, name, canEdit));
    }
}
