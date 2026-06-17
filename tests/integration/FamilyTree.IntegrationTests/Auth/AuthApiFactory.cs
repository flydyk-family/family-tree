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
    protected override void ConfigureWebHost(IWebHostBuilder builder)
    {
        var fixturePath = Path.Combine(AppContext.BaseDirectory, "Fixtures", "family.test.json");
        builder.UseSetting("FamilyData:FilePath", fixturePath);
        builder.UseSetting("Authentication:Google:ClientId", "test-client.apps.googleusercontent.com");
        builder.UseSetting("Authentication:Google:Editors:0", FakeGoogleIdTokenValidator.EditorEmail);
        builder.UseEnvironment("Development");

        builder.ConfigureTestServices(services =>
        {
            services.RemoveAll<IGoogleIdTokenValidator>();
            services.AddScoped<IGoogleIdTokenValidator, FakeGoogleIdTokenValidator>();
        });
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
