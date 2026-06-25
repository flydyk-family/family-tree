namespace FamilyTree.Api.Security;

/// <summary>
/// Rejects requests that did not arrive through the Cloudflare proxy: when an origin secret
/// is configured, every request except <c>/health</c> must carry a valid X-Origin-Verify
/// header, else 403. Dormant (pass-through) when no secret is configured (local dev / CI).
/// Runs before the rate limiter, so all rate-limiter-reaching traffic has come through
/// Cloudflare — which makes trusting X-Forwarded-For for the rate-limit partition sound.
/// </summary>
public sealed class OriginVerificationMiddleware
{
    public const string HeaderName = "X-Origin-Verify";

    private readonly RequestDelegate _next;
    private readonly OriginVerifier _verifier;
    private readonly ILogger<OriginVerificationMiddleware> _logger;

    public OriginVerificationMiddleware(
        RequestDelegate next,
        OriginVerifier verifier,
        ILogger<OriginVerificationMiddleware> logger)
    {
        _next = next;
        _verifier = verifier;
        _logger = logger;
    }

    public async Task InvokeAsync(HttpContext context)
    {
        if (!_verifier.IsEnabled || IsHealthCheck(context.Request.Path))
        {
            await _next(context);
            return;
        }

        var header = context.Request.Headers[HeaderName].ToString();
        if (_verifier.IsTrusted(header))
        {
            await _next(context);
            return;
        }

        // Log only the non-identifying outcome — no header value, no secret, and not the
        // user-controlled request path (logging raw request input risks log injection, CWE-117).
        _logger.LogWarning("Rejected a request that lacked a valid origin-verification header.");
        context.Response.StatusCode = StatusCodes.Status403Forbidden;
        await context.Response.WriteAsJsonAsync(new { title = "Forbidden." });
    }

    private static bool IsHealthCheck(PathString path) =>
        path.Equals("/health", StringComparison.OrdinalIgnoreCase);
}
