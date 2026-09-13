using FamilyTree.Api.Auth;
using FamilyTree.IntegrationTests.Auth;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.AspNetCore.TestHost;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;

namespace FamilyTree.IntegrationTests;

/// <summary>
/// A test host serving two families from the fixture registry (like <see cref="TwoFamilyApiFactory"/>)
/// with editor auth wired in (like <see cref="AuthApiFactory"/>), so write tests can be run against a
/// family-scoped route.
/// </summary>
public sealed class TwoFamilyAuthApiFactory : WebApplicationFactory<Program>
{
    /// <summary>
    /// Per-factory temp directory the API's local media store writes to. Set explicitly so photo
    /// uploads in tests never land in the repo-root media/ folder (the dev default in Development).
    /// </summary>
    public string MediaDirectory { get; } =
        Path.Combine(Path.GetTempPath(), "ft-test-media-" + Guid.NewGuid().ToString("N"));

    protected override void ConfigureWebHost(IWebHostBuilder builder)
    {
        var fixtures = Path.Combine(AppContext.BaseDirectory, "Fixtures");
        builder.UseSetting("FamilyData:Source", Path.Combine(fixtures, "family.test.json"));
        builder.UseSetting("FamilyData:Registry", Path.Combine(fixtures, "families.test.json"));
        builder.UseSetting("Authentication:Google:ClientId", "test-client.apps.googleusercontent.com");
        builder.UseSetting("Authentication:Google:Editors:0", FakeGoogleIdTokenValidator.EditorEmail);
        builder.UseSetting("R2:LocalMediaDirectory", MediaDirectory);
        // Force geocoding "unconfigured" and blank Firestore/R2 credentials regardless of a real
        // key/config in the developer's local user-secrets — see AuthApiFactory for the rationale.
        builder.UseSetting("GoogleMaps:GeocodingApiKey", "");
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
    /// replays the Secure session cookie (see AuthApiFactory.CreateCookieClient).
    /// </summary>
    public HttpClient CreateCookieClient() =>
        CreateClient(new WebApplicationFactoryClientOptions { BaseAddress = new Uri("https://localhost") });
}
