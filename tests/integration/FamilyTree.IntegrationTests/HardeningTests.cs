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
        response.Headers.Should().ContainKey("Referrer-Policy");
    }
}
