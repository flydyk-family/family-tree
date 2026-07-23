using FamilyTree.Api.Auth;
using FamilyTree.IntegrationTests.Auth;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.AspNetCore.TestHost;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;

namespace FamilyTree.IntegrationTests;

public sealed class AuthApiFactory : WebApplicationFactory<Program>
{
    /// <summary>
    /// Per-factory temp directory the API's local media store writes to. Set explicitly so photo
    /// uploads in tests never land in the repo-root media/ folder (the dev default in Development).
    /// </summary>
    public string MediaDirectory { get; } =
        Path.Combine(Path.GetTempPath(), "ft-test-media-" + Guid.NewGuid().ToString("N"));

    protected override void ConfigureWebHost(IWebHostBuilder builder)
    {
        var fixturePath = Path.Combine(AppContext.BaseDirectory, "Fixtures", "family.test.json");
        builder.UseSetting("FamilyData:Source", fixturePath);
        builder.UseSetting("Authentication:Google:ClientId", "test-client.apps.googleusercontent.com");
        builder.UseSetting("Authentication:Google:Editors:0", FakeGoogleIdTokenValidator.EditorEmail);
        builder.UseSetting("R2:LocalMediaDirectory", MediaDirectory);
        // Force geocoding "unconfigured" regardless of a real key in the developer's local
        // user-secrets (Development env auto-loads them) — GeocodeEndpointsTests' "when key
        // unconfigured" cases must stay hermetic, same rationale as the Authentication:Google:*
        // overrides above.
        builder.UseSetting("GoogleMaps:GeocodingApiKey", "");
        // Same hazard, higher stakes: a developer's local user-secrets may carry a real
        // Firestore:ProjectId or R2:* credential set (e.g. for testing uploads against real
        // infra by hand). Without this, AddInfrastructure would wire FirestoreDb/R2MediaStore
        // into every integration test run on that machine — real writes to production data
        // stores, not just a stray read. Blank them so this factory always resolves to the
        // in-memory session/override stores and the local-file media store.
        builder.UseSetting("Firestore:ProjectId", "");
        builder.UseSetting("R2:AccountId", "");
        builder.UseSetting("R2:Bucket", "");
        builder.UseSetting("R2:AccessKeyId", "");
        builder.UseSetting("R2:SecretAccessKey", "");
        builder.UseEnvironment("Development");

        builder.ConfigureTestServices(services =>
        {
            services.RemoveAll<IGoogleIdTokenValidator>();
            services.AddScoped<IGoogleIdTokenValidator, FakeGoogleIdTokenValidator>();
        });
    }

    protected override void Dispose(bool disposing)
    {
        base.Dispose(disposing);
        if (disposing && Directory.Exists(MediaDirectory))
        {
            try
            {
                Directory.Delete(MediaDirectory, recursive: true);
            }
            catch (IOException)
            {
                // Best-effort cleanup of a temp dir; leftover temp files are harmless.
            }
        }
    }

    /// <summary>
    /// Creates a client with an https base address so the cookie container stores and
    /// replays the Secure session cookie. Over the default http://localhost base
    /// address the TestServer's cookie container withholds Secure cookies, so the
    /// session would never be replayed on follow-up requests (every /me would 401).
    /// </summary>
    public HttpClient CreateCookieClient() =>
        CreateClient(new WebApplicationFactoryClientOptions { BaseAddress = new Uri("https://localhost") });
}
