using System.Reflection;
using System.Threading.RateLimiting;
using FamilyTree.Api.Auth;
using FamilyTree.Api.Configuration;
using FamilyTree.Application;
using FamilyTree.Domain;
using FamilyTree.Infrastructure;
using FluentValidation;
using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.Diagnostics;
using Microsoft.AspNetCore.Diagnostics.HealthChecks;

var builder = WebApplication.CreateBuilder(args);

// Single strongly-typed view of our own configuration (mirrors appsettings.json,
// minus framework sections). Bound once here; root-only settings are read straight
// off `appSettings`, and DI-consumed sections are mapped to their own Options below.
var appSettings = builder.Configuration.Get<AppSettings>() ?? new AppSettings();

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
builder.Services.AddInfrastructure(new FamilyDataOptions { FilePath = appSettings.FamilyData.FilePath });

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

builder.Services.AddHealthChecks();

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

app.UseRateLimiter();

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
});
app.MapControllers().RequireRateLimiting(ApiRateLimitPolicy);

app.Run();

public partial class Program { }
