using System.Net;
using Microsoft.AspNetCore.Hosting;

namespace FamilyTree.IntegrationTests;

public sealed class HardeningTests : IClassFixture<FamilyApiFactory>
{
    private readonly FamilyApiFactory _factory;

    public HardeningTests(FamilyApiFactory factory)
    {
        _factory = factory;
    }

    [Fact]
    public async Task GetHealth_WhenCalled_ShouldReturnOkWithVersion()
    {
        var client = _factory.CreateClient();

        var response = await client.GetAsync("/health");

        response.StatusCode.Should().Be(HttpStatusCode.OK);
        var body = await response.Content.ReadAsStringAsync();
        body.Should().Contain("\"status\":\"Healthy\"");
        body.Should().Contain("\"version\":");
        body.Should().Contain("\"commit\":");
    }

    [Fact]
    public async Task GetGraph_WhenCalled_ShouldIncludeSecurityHeaders()
    {
        var client = _factory.CreateClient();

        var response = await client.GetAsync("/api/family/graph");

        response.Headers.GetValues("X-Content-Type-Options").Should().Equal("nosniff");
        response.Headers.GetValues("X-Frame-Options").Should().Equal("DENY");
        response.Headers.GetValues("Referrer-Policy").Should().Equal("strict-origin-when-cross-origin");
        response.Headers.GetValues("Permissions-Policy").Should().Equal("geolocation=(), camera=(), microphone=()");
        response.Headers.GetValues("Strict-Transport-Security").Should().Equal("max-age=63072000; includeSubDomains");
    }

    [Fact]
    public async Task ApiEndpoint_WhenPermitLimitExceeded_ShouldReturn429()
    {
        using var factory = _factory.WithWebHostBuilder(builder =>
        {
            builder.UseSetting("RateLimiting:PermitLimit", "2");
        });
        var client = factory.CreateClient();

        var first = await client.GetAsync("/api/family/graph");
        var second = await client.GetAsync("/api/family/graph");
        var third = await client.GetAsync("/api/family/graph");

        first.StatusCode.Should().Be(HttpStatusCode.OK);
        second.StatusCode.Should().Be(HttpStatusCode.OK);
        third.StatusCode.Should().Be(HttpStatusCode.TooManyRequests);
    }

    [Fact]
    public async Task Health_WhenPermitLimitExceeded_ShouldReturn429()
    {
        using var factory = _factory.WithWebHostBuilder(builder =>
        {
            builder.UseSetting("RateLimiting:PermitLimit", "1");
        });
        var client = factory.CreateClient();

        var first = await client.GetAsync("/health");
        var second = await client.GetAsync("/health");

        first.StatusCode.Should().Be(HttpStatusCode.OK);
        second.StatusCode.Should().Be(HttpStatusCode.TooManyRequests);
    }

    [Fact]
    public async Task Request_WhenBodyExceedsConfiguredLimit_ShouldReturn413()
    {
        using var factory = _factory.WithWebHostBuilder(builder =>
        {
            builder.UseSetting("RequestLimits:MaxRequestBodyBytes", "256");
        });
        var client = factory.CreateClient();

        // The body-size guard short-circuits on Content-Length before routing, so the route
        // and method don't matter — an oversized POST is rejected with 413 either way.
        var oversized = new StringContent(new string('a', 4096));
        var response = await client.PostAsync("/api/family/graph", oversized);

        response.StatusCode.Should().Be(HttpStatusCode.RequestEntityTooLarge);
        // The security-headers middleware runs BEFORE the body-size guard, so the 413
        // short-circuit still carries the standard security headers (every-response contract).
        response.Headers.GetValues("X-Content-Type-Options").Should().Equal("nosniff");
    }

    [Fact]
    public async Task OversizedBody_WhenFlooded_ShouldBeRateLimitedNotUnlimited413()
    {
        using var factory = _factory.WithWebHostBuilder(builder =>
        {
            builder.UseSetting("RateLimiting:PermitLimit", "1");
            builder.UseSetting("RequestLimits:MaxRequestBodyBytes", "256");
        });
        var client = factory.CreateClient();

        // POST to a rate-limited endpoint (the body guard short-circuits before the controller,
        // so no Google call is made). The first oversized request consumes the single permit
        // and returns 413; the second is throttled (429) instead of yielding another 413.
        var first = await client.PostAsync("/api/auth/session", new StringContent(new string('a', 4096)));
        var second = await client.PostAsync("/api/auth/session", new StringContent(new string('a', 4096)));

        first.StatusCode.Should().Be(HttpStatusCode.RequestEntityTooLarge);
        second.StatusCode.Should().Be(HttpStatusCode.TooManyRequests);
    }
}
