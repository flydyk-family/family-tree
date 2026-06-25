using System.Net;
using System.Net.Http.Json;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;

namespace FamilyTree.IntegrationTests;

public sealed class OriginVerificationTests : IClassFixture<FamilyApiFactory>
{
    private const string Secret = "test-origin-secret-abc123";
    private readonly FamilyApiFactory _factory;

    public OriginVerificationTests(FamilyApiFactory factory)
    {
        _factory = factory;
    }

    private WebApplicationFactory<Program> Gated() =>
        _factory.WithWebHostBuilder(builder =>
            builder.UseSetting("Security:OriginVerify:Secrets:0", Secret));

    [Fact]
    public async Task ApiRequest_WhenGateConfiguredAndHeaderMissing_ShouldReturn403()
    {
        using var factory = Gated();
        var client = factory.CreateClient();

        var response = await client.GetAsync("/api/family/graph");

        response.StatusCode.Should().Be(HttpStatusCode.Forbidden);
        // The gate runs after the security-headers middleware, so the 403 still carries them.
        response.Headers.GetValues("X-Content-Type-Options").Should().Equal("nosniff");
        // Pin the documented 403 body contract.
        var body = await response.Content.ReadFromJsonAsync<Dictionary<string, string>>();
        body!["title"].Should().Be("Forbidden.");
    }

    [Fact]
    public async Task ApiRequest_WhenGateConfiguredAndHeaderWrong_ShouldReturn403()
    {
        using var factory = Gated();
        var client = factory.CreateClient();
        client.DefaultRequestHeaders.Add("X-Origin-Verify", "wrong-secret");

        var response = await client.GetAsync("/api/family/graph");

        response.StatusCode.Should().Be(HttpStatusCode.Forbidden);
        var body = await response.Content.ReadFromJsonAsync<Dictionary<string, string>>();
        body!["title"].Should().Be("Forbidden.");
    }

    [Fact]
    public async Task ApiRequest_WhenGateConfiguredAndHeaderValid_ShouldReturn200()
    {
        using var factory = Gated();
        var client = factory.CreateClient();
        client.DefaultRequestHeaders.Add("X-Origin-Verify", Secret);

        var response = await client.GetAsync("/api/family/graph");

        response.StatusCode.Should().Be(HttpStatusCode.OK);
    }

    [Fact]
    public async Task Health_WhenGateConfiguredAndHeaderMissing_ShouldStayReachable()
    {
        using var factory = Gated();
        var client = factory.CreateClient();

        var response = await client.GetAsync("/health");

        response.StatusCode.Should().Be(HttpStatusCode.OK);
    }

    [Fact]
    public async Task ApiRequest_WhenGateUnconfigured_ShouldNotRequireHeader()
    {
        var client = _factory.CreateClient();   // default fixture: no secret ⇒ gate dormant

        var response = await client.GetAsync("/api/family/graph");

        response.StatusCode.Should().Be(HttpStatusCode.OK);
    }
}
