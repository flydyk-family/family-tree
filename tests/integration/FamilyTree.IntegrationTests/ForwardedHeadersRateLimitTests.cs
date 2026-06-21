using System.Net;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;

namespace FamilyTree.IntegrationTests;

public sealed class ForwardedHeadersRateLimitTests
{
    // Pin the limiter to 1 request/window so partitioning is directly observable.
    private static WebApplicationFactory<Program> Factory() =>
        new FamilyApiFactory().WithWebHostBuilder(builder =>
        {
            builder.UseSetting("RateLimiting:PermitLimit", "1");
            builder.UseSetting("RateLimiting:WindowSeconds", "300");
        });

    private static HttpRequestMessage GraphRequest(string forwardedFor)
    {
        var request = new HttpRequestMessage(HttpMethod.Get, "/api/family/graph");
        request.Headers.Add("X-Forwarded-For", forwardedFor);
        return request;
    }

    [Fact]
    public async Task RateLimit_WhenForwardedForDiffers_ShouldPartitionByClientIp()
    {
        using var factory = Factory();
        var client = factory.CreateClient();

        // First request from client A is allowed.
        var first = await client.SendAsync(GraphRequest("203.0.113.10"));
        first.StatusCode.Should().Be(HttpStatusCode.OK);

        // Second request from the SAME forwarded IP hits the per-IP limit.
        var second = await client.SendAsync(GraphRequest("203.0.113.10"));
        second.StatusCode.Should().Be(HttpStatusCode.TooManyRequests);

        // A DIFFERENT forwarded IP is a different partition → allowed.
        // Without UseForwardedHeaders both share the connection's ("unknown") partition,
        // so this would be 429 — which is exactly the RED before the middleware exists.
        var other = await client.SendAsync(GraphRequest("203.0.113.20"));
        other.StatusCode.Should().Be(HttpStatusCode.OK);
    }

    [Fact]
    public async Task RateLimit_WithoutForwardedFor_ShouldStillServeFirstRequest()
    {
        // No X-Forwarded-For → the middleware is a no-op; the endpoint still works.
        using var factory = Factory();
        var client = factory.CreateClient();

        var response = await client.GetAsync("/api/family/graph");

        response.StatusCode.Should().Be(HttpStatusCode.OK);
    }
}
