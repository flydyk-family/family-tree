using System.Net;
using System.Net.Http.Json;
using FamilyTree.Api.Auth;
using FamilyTree.IntegrationTests.Auth;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.Extensions.DependencyInjection;

namespace FamilyTree.IntegrationTests;

/// <summary>The geocoding routes are the only ones that spend money per request, so they carry
/// a tighter budget than the general `api` limiter every controller already gets. These tests
/// pin that the extra bucket exists, actually rejects, and is scoped to geocoding — a
/// misconfigured policy that throttled the whole API, or none at all, would both pass the
/// endpoint tests in <see cref="GeocodeEndpointsTests"/>.</summary>
public sealed class GeocodeRateLimitTests : IClassFixture<AuthApiFactory>
{
    private const int Permit = 3;
    private readonly AuthApiFactory _baseFactory;

    public GeocodeRateLimitTests(AuthApiFactory baseFactory)
    {
        _baseFactory = baseFactory;
    }

    /// <summary>A tiny geocode budget with the general limiter left wide open, so a 429 can
    /// only have come from the geocode policy.</summary>
    private WebApplicationFactory<Program> ThrottledFactory() =>
        _baseFactory.WithWebHostBuilder(builder =>
        {
            builder.UseSetting("RateLimiting:Geocode:PermitLimit", Permit.ToString());
            builder.UseSetting("RateLimiting:Geocode:WindowSeconds", "60");
            builder.UseSetting("RateLimiting:PermitLimit", "10000");
            builder.UseSetting("RateLimiting:WindowSeconds", "60");
        });

    private static async Task<HttpClient> SignedInAsync(WebApplicationFactory<Program> factory)
    {
        var client = factory.CreateClient(new WebApplicationFactoryClientOptions
        {
            BaseAddress = new Uri("https://localhost"),
            HandleCookies = true
        });
        await client.PostAsJsonAsync("/api/auth/session", new LoginRequest(FakeGoogleIdTokenValidator.EditorIdToken));
        return client;
    }

    [Fact]
    public async Task Search_WhenAnEditorExceedsTheGeocodeBudget_ShouldReturn429()
    {
        var factory = ThrottledFactory();
        var client = await SignedInAsync(factory);

        var statuses = new List<HttpStatusCode>();
        for (var i = 0; i < Permit + 2; i++)
        {
            statuses.Add((await client.GetAsync("/api/geocode/search?q=Minsk")).StatusCode);
        }

        statuses.Take(Permit).Should().AllSatisfy(s => s.Should().Be(HttpStatusCode.OK));
        statuses.Skip(Permit).Should().AllSatisfy(s => s.Should().Be(HttpStatusCode.TooManyRequests));
    }

    [Fact]
    public async Task Graph_WhenTheGeocodeBudgetIsExhausted_ShouldStillSucceed()
    {
        var factory = ThrottledFactory();
        var client = await SignedInAsync(factory);

        for (var i = 0; i < Permit + 2; i++)
        {
            await client.GetAsync("/api/geocode/search?q=Minsk");
        }

        // Ordinary reads must be untouched — the tighter bucket is for billed calls only.
        var response = await client.GetAsync("/api/family/graph");

        response.StatusCode.Should().Be(HttpStatusCode.OK);
    }
}
