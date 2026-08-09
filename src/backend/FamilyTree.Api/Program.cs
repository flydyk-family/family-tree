using System.Reflection;
using System.Threading.RateLimiting;
using FamilyTree.Api.Auth;
using FamilyTree.Api.Configuration;
using FamilyTree.Api.Controllers;
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
using Microsoft.AspNetCore.Mvc.Controllers;
using Microsoft.AspNetCore.RateLimiting;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;

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

// In local dev (no R2 configured, no explicit override) point the media store at the repo-root
// media/ folder that the Vite dev server serves at /media, so editor-uploaded photos render
// end-to-end under plain `dotnet run` too — not only via scripts/dev.mjs (which sets
// R2__LocalMediaDirectory). Resolved from the content root (the API project dir), so it is
// independent of the process working directory. Production uploads go to R2.
var localMediaDirectory = appSettings.R2.LocalMediaDirectory;
string? appliedDevMediaDirectory = null;
if (builder.Environment.IsDevelopment() && string.IsNullOrWhiteSpace(localMediaDirectory))
{
    appliedDevMediaDirectory = DevMediaDirectory.ResolveRepoRootMedia(builder.Environment.ContentRootPath);
    if (appliedDevMediaDirectory is not null)
    {
        localMediaDirectory = appliedDevMediaDirectory;
    }
}

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
        OverridesCollection = appSettings.Firestore.OverridesCollection,
        MediaOverridesCollection = appSettings.Firestore.MediaOverridesCollection
    },
    new R2Options
    {
        AccountId = appSettings.R2.AccountId,
        Bucket = appSettings.R2.Bucket,
        AccessKeyId = appSettings.R2.AccessKeyId,
        SecretAccessKey = appSettings.R2.SecretAccessKey,
        LocalMediaDirectory = localMediaDirectory
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

// GoogleMapsOptions is immutable (init-only, mirroring R2Options); register the
// already-built instance directly rather than mutating one through Configure<T>.
builder.Services.AddSingleton<IOptions<GoogleMapsOptions>>(Options.Create(new GoogleMapsOptions
{
    GeocodingApiKey = appSettings.GoogleMaps.GeocodingApiKey
}));

// Server-side geocoding proxy: the browser never sees this key (CanEdit-gated controller
// below). Establishes the typed-HttpClient pattern per CLAUDE.md — no named HttpClients.
builder.Services.AddHttpClient<IGeocodingClient, GoogleGeocodingClient>(client =>
{
    client.BaseAddress = new Uri("https://maps.googleapis.com/");
    client.Timeout = TimeSpan.FromSeconds(5);
});
// HttpClientFactory's own logging handlers (distinct from GoogleGeocodingClient's own
// ILogger calls, which never touch the key) log the full request URI — including the
// &key=... query string FetchAsync appends — at Information level by default. The
// category name is derived from the typed client's TClient ("IGeocodingClient"), per
// https://learn.microsoft.com/aspnet/core/fundamentals/http-requests. Google's Geocoding
// REST API has no header-based auth, so the key must stay on the query string; raise this
// client's HTTP logging above Information instead, so the routine per-request message
// never reaches the log sink while genuine failures (Warning/Error) still surface.
builder.Logging.AddFilter("System.Net.Http.HttpClient.IGeocodingClient", LogLevel.Warning);

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
const string GeocodeRateLimitPolicy = "geocode";
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

    // Geocoding is the one place a request costs money (a billed Google call), so it gets its
    // own tighter bucket instead of the general read allowance.
    //
    // Partitioned by client IP, not by signed-in identity: UseRateLimiter runs *before*
    // UseAuthentication (deliberately — an unauthenticated flood should be rejected before we
    // spend work validating cookies), so HttpContext.User is still anonymous here and an
    // identity-based key would silently collapse to a single shared partition for everyone.
    options.AddPolicy(GeocodeRateLimitPolicy, httpContext =>
        RateLimitPartition.GetFixedWindowLimiter(
            partitionKey: httpContext.Connection.RemoteIpAddress?.ToString() ?? "unknown",
            factory: _ => new FixedWindowRateLimiterOptions
            {
                PermitLimit = appSettings.RateLimiting.Geocode.PermitLimit,
                Window = TimeSpan.FromSeconds(appSettings.RateLimiting.Geocode.WindowSeconds),
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

// Make the dev media location observable: editor-uploaded photos land here, where the Vite dev
// server serves /media. A path is not PII.
if (appliedDevMediaDirectory is not null)
{
    app.Logger.LogInformation(
        "Local media uploads stored at {MediaDirectory} (served by the Vite dev server at /media).",
        appliedDevMediaDirectory);
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
// Photo upload (POST /api/people/{id}/photos) gets a larger per-route cap; every other
// route stays bound to the tight default. The upload endpoint also gets [RequestSizeLimit]
// to raise the Kestrel transport limit for that route (added in a later task).
var maxRequestBodyBytes = appSettings.RequestLimits.MaxRequestBodyBytes;
var maxPhotoUploadBytes = appSettings.RequestLimits.MaxPhotoUploadBytes;
app.Use(async (context, next) =>
{
    var request = context.Request;
    // Photo uploads (POST /api/people/{id}/photos) carry image bytes and get a larger cap;
    // every other route stays bound to the tight default.
    var isPhotoUpload = HttpMethods.IsPost(request.Method)
        && request.Path.StartsWithSegments("/api/people", out var rest)
        && rest.HasValue
        && rest.Value.EndsWith("/photos", StringComparison.Ordinal);
    var limit = isPhotoUpload ? maxPhotoUploadBytes : maxRequestBodyBytes;
    if (request.ContentLength is long length && length > limit)
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
var controllerEndpoints = app.MapControllers();
controllerEndpoints.RequireRateLimiting(ApiRateLimitPolicy);
// Swap the geocoding routes onto their own tighter budget. This has to be added *after* the
// blanket RequireRateLimiting above: the rate-limiting middleware reads the last
// EnableRateLimitingAttribute in an endpoint's metadata, so a [EnableRateLimiting] attribute
// on the controller alone would be overwritten by the convention above and silently do
// nothing (GeocodeRateLimitTests fails exactly that way if this is removed).
controllerEndpoints.Add(endpoint =>
{
    var isGeocode = endpoint.Metadata
        .OfType<ControllerActionDescriptor>()
        .Any(descriptor => descriptor.ControllerTypeInfo.AsType() == typeof(GeocodeController));
    if (isGeocode)
    {
        endpoint.Metadata.Add(new EnableRateLimitingAttribute(GeocodeRateLimitPolicy));
    }
});

app.Run();

public partial class Program { }
