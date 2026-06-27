namespace FamilyTree.Api.Security;

/// <summary>
/// Rejects requests that lack a valid <c>X-Origin-Verify</c> header with 403, exempting
/// <c>/health</c>; dormant (pass-through) until an origin secret is configured.
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

        // A duplicate header joins to "a,b" here and matches no secret → rejected; the legitimate proxy
        // always sends exactly one value (Headers.set), so a multi-valued header is never genuine.
        var header = context.Request.Headers[HeaderName].ToString();
        if (_verifier.IsTrusted(header))
        {
            await _next(context);
            return;
        }

        // Non-identifying outcome only — no header value, secret, or user-controlled path (CWE-117).
        _logger.LogWarning("Rejected a request that lacked a valid origin-verification header.");
        context.Response.StatusCode = StatusCodes.Status403Forbidden;
        await context.Response.WriteAsJsonAsync(new { title = "Forbidden." });
    }

    private static bool IsHealthCheck(PathString path) =>
        path.Equals("/health", StringComparison.OrdinalIgnoreCase);
}
