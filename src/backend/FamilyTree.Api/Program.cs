using System.Reflection;
using System.Threading.RateLimiting;
using FamilyTree.Api.Auth;
using FamilyTree.Api.Configuration;
using FamilyTree.Api.Health;
using FamilyTree.Api.Security;
using FamilyTree.Application;
using FamilyTree.Domain;
using FamilyTree.Infrastructure;
using FluentValidation;
using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.Diagnostics;
using Microsoft.AspNetCore.Diagnostics.HealthChecks;
using Microsoft.AspNetCore.HttpOverrides;

var builder = WebApplication.CreateBuilder(args);

// Single strongly-typed view of our own configuration (mirrors appsettings.json,
// minus framework sections). Bound once here; root-only settings are read straight
// off `appSettings`, and DI-consumed sections are mapped to their own Options below.
var appSettings = builder.Configuration.Get<AppSettings>() ?? new AppSettings();

// Cap the request body at the server (streaming) level so oversized/chunked bodies are
// rejected before they are buffered. A request-level middleware below also enforces this
// (and is what TestServer exercises, since it bypasses Kestrel).
builder.WebHost.ConfigureKestrel(kestrel =>
{
    kestrel.Limits.MaxRequestBodySize = appSettings.RequestLimits.MaxRequestBodyBytes;
});

// The `appSettings` local above is what startup actually consumes. This separate
// registration exists only to fail-fast at host start (ValidateOnStart) once the
// settings grow DataAnnotations — nothing injects `IOptions<AppSettings>` today.
builder.Services.AddOptions<AppSettings>()
    .Bind(builder.Configuration)
    .ValidateDataAnnotations()
    .ValidateOnStart();

builder.Services.AddControllers();
builder.Services.AddOpenApi();

// MediatR licence key comes from AppSettings (MediatR:LicenseKey) — set it via
// user-secrets locally or the MediatR__LicenseKey env var in deployment; it is
// never committed. Infrastructure receives the mapped FamilyData options.
builder.Services.AddApplication(appSettings.MediatR.LicenseKey);
builder.Services.AddInfrastructure(
    new FamilyDataOptions
    {
        Source = appSettings.FamilyData.Source,
        SnapshotTtlMinutes = appSettings.FamilyData.SnapshotTtlMinutes
    },
    new FirestoreOptions
    {
        ProjectId = appSettings.Firestore.ProjectId,
        SessionsCollection = appSettings.Firestore.SessionsCollection,
        OverridesCollection = appSettings.Firestore.OverridesCollection
    });

// Map the Authentication config sections to the Options that DI-resolved auth
// services consume (mirrors how FamilyData maps to FamilyDataOptions).
builder.Services.Configure<GoogleAuthOptions>(options =>
{
    options.ClientId = appSettings.Authentication.Google.ClientId;
    options.Editors = appSettings.Authentication.Google.Editors;
});
builder.Services.Configure<SessionAuthOptions>(options =>
{
    options.CookieName = appSettings.Authentication.Session.CookieName;
    options.LifetimeDays = appSettings.Authentication.Session.LifetimeDays;
    options.SlidingRenewal = appSettings.Authentication.Session.SlidingRenewal;
});

builder.Services.Configure<OriginVerifyOptions>(options =>
{
    options.Secrets = appSettings.Security.OriginVerify.Secrets;
});
builder.Services.AddSingleton<OriginVerifier>();

// Google validation + session orchestration. The in-memory ISessionStore and
// IPersonOverrideStore are registered by AddInfrastructure (singletons).
builder.Services.AddScoped<IGoogleIdTokenValidator, GoogleIdTokenValidator>();
builder.Services.AddScoped<ISessionManager, SessionManager>();

builder.Services.AddAuthentication(SessionAuthenticationHandler.SchemeName)
    .AddScheme<AuthenticationSchemeOptions, SessionAuthenticationHandler>(
        SessionAuthenticationHandler.SchemeName, null);

builder.Services.AddAuthorization(options =>
{
    options.AddPolicy("CanEdit", policy =>
        policy.RequireAuthenticatedUser()
            .RequireClaim(SessionAuthenticationHandler.CanEditClaimType, "true"));
});

builder.Services.AddHealthChecks()
    .AddCheck<FamilyDataHealthCheck>("family-data");

const string ApiRateLimitPolicy = "api";
builder.Services.AddRateLimiter(options =>
{
    options.RejectionStatusCode = StatusCodes.Status429TooManyRequests;
    options.AddPolicy(ApiRateLimitPolicy, httpContext =>
        RateLimitPartition.GetFixedWindowLimiter(
            partitionKey: httpContext.Connection.RemoteIpAddress?.ToString() ?? "unknown",
            factory: _ => new FixedWindowRateLimiterOptions
            {
                PermitLimit = appSettings.RateLimiting.PermitLimit,
                Window = TimeSpan.FromSeconds(appSettings.RateLimiting.WindowSeconds),
                QueueLimit = 0
            }));
});

const string DevCorsPolicy = "frontend-dev";
builder.Services.AddCors(options =>
{
    options.AddPolicy(DevCorsPolicy, policy =>
        policy.WithOrigins("http://localhost:5173")
            .AllowAnyHeader()
            .AllowAnyMethod());
});

var app = builder.Build();

// Warm the read cache once at startup. This re-reads family.json (fail-fast on a
// missing/invalid seed, mirroring the old eager FamilyStore load) and seeds the cache
// so the first request does not pay the build cost.
await app.Services.GetRequiredService<IFamilySnapshotProvider>().RefreshAsync(CancellationToken.None);

// Fast diagnostic signal: without a Google client ID, every sign-in attempt fails
// (no real token has "" as its audience). Surface it once at startup instead of as
// opaque 401s. Blank is the committed default; the real value comes from secrets/env.
if (string.IsNullOrWhiteSpace(appSettings.Authentication.Google.ClientId))
{
    app.Logger.LogWarning(
        "Authentication:Google:ClientId is not configured — all Google sign-in attempts will fail until it is set.");
}

// Behind the Cloudflare → Cloud Run proxy chain, honor X-Forwarded-For/Proto so the
// rate limiter partitions by the real client IP (not the proxy) and Request.Scheme is
// https. KnownProxies/KnownIPNetworks are cleared because Cloud Run's front-end IPs are
// not a fixed set. Trade-off: a direct (Cloudflare-bypassing) caller could spoof its
// rate-limit IP — bounded, since the IP feeds only the limiter (never authz). Documented
// in docs/reference; the root fix (lock Cloud Run ingress) is a tracked follow-up.
var forwardedHeadersOptions = new ForwardedHeadersOptions
{
    ForwardedHeaders = ForwardedHeaders.XForwardedFor | ForwardedHeaders.XForwardedProto,
    ForwardLimit = 2   // Cloudflare + Cloud Run hops; validate against the deployed chain.
};
forwardedHeadersOptions.KnownIPNetworks.Clear();
forwardedHeadersOptions.KnownProxies.Clear();
app.UseForwardedHeaders(forwardedHeadersOptions);

app.UseExceptionHandler(handler =>
{
    handler.Run(async context =>
    {
        var feature = context.Features.Get<IExceptionHandlerFeature>();
        if (feature?.Error is ValidationException validationException)
        {
            context.Response.StatusCode = StatusCodes.Status400BadRequest;
            await context.Response.WriteAsJsonAsync(new
            {
                title = "Validation failed",
                errors = validationException.Errors
                    .Select(error => new { error.PropertyName, error.ErrorMessage })
            });
        }
        else
        {
            var logger = context.RequestServices.GetRequiredService<ILogger<Program>>();
            logger.LogError(feature?.Error, "Unhandled exception while processing {Method} {Path}.",
                context.Request.Method, context.Request.Path);
            context.Response.StatusCode = StatusCodes.Status500InternalServerError;
            await context.Response.WriteAsJsonAsync(new { title = "An unexpected error occurred." });
        }
    });
});

app.Use(async (context, next) =>
{
    var headers = context.Response.Headers;
    headers["X-Content-Type-Options"] = "nosniff";
    headers["X-Frame-Options"] = "DENY";
    headers["Referrer-Policy"] = "strict-origin-when-cross-origin";
    headers["Permissions-Policy"] = "geolocation=(), camera=(), microphone=()";
    headers["Strict-Transport-Security"] = "max-age=63072000; includeSubDomains";
    await next();
});

// Reject off-Cloudflare requests before the rate limiter; dormant unless a secret is configured (/health exempt).
app.UseMiddleware<OriginVerificationMiddleware>();

app.UseRateLimiter();

// Reject oversized bodies before the endpoint reads/binds them. Placed AFTER the rate
// limiter so a flood of oversized-Content-Length requests to a rate-limited endpoint is
// still throttled — short-circuiting before the limiter would let a single IP draw an
// unlimited stream of 413s. Kestrel enforces the same cap at the connection level
// (chunked/streaming); this Content-Length check is the portable guard (TestServer
// bypasses Kestrel) and returns a clean JSON 413.
var maxRequestBodyBytes = appSettings.RequestLimits.MaxRequestBodyBytes;
app.Use(async (context, next) =>
{
    if (context.Request.ContentLength is long length && length > maxRequestBodyBytes)
    {
        context.Response.StatusCode = StatusCodes.Status413PayloadTooLarge;
        await context.Response.WriteAsJsonAsync(new { title = "Request body too large." });
        return;
    }

    await next();
});

if (app.Environment.IsDevelopment())
{
    app.MapOpenApi();
    app.UseCors(DevCorsPolicy);
}

app.UseStaticFiles();

app.UseAuthentication();
app.UseAuthorization();

app.MapHealthChecks("/health", new HealthCheckOptions
{
    ResponseWriter = async (context, report) =>
    {
        var version = typeof(Program).Assembly
            .GetCustomAttribute<AssemblyInformationalVersionAttribute>()
            ?.InformationalVersion ?? "unknown";
        var commit = Environment.GetEnvironmentVariable("APP_COMMIT") ?? "local";
        context.Response.ContentType = "application/json";
        await context.Response.WriteAsJsonAsync(new
        {
            status = report.Status.ToString(),
            version,
            commit
        });
    }
}).RequireRateLimiting(ApiRateLimitPolicy);   // throttle the probe; version/commit stay (the deploy health check reads them)
app.MapControllers().RequireRateLimiting(ApiRateLimitPolicy);

app.Run();

public partial class Program { }
