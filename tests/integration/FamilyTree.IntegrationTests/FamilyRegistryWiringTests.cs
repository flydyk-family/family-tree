using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using FamilyTree.Application.Dtos;

namespace FamilyTree.IntegrationTests;

public sealed class FamilyRegistryWiringTests : IClassFixture<FamilyApiFactory>
{
    private readonly FamilyApiFactory _factory;

    public FamilyRegistryWiringTests(FamilyApiFactory factory)
    {
        _factory = factory;
    }

    [Fact]
    public async Task GetGraph_WhenNoRegistryIsConfigured_ShouldServeTheSeedAsBefore()
    {
        var graph = await _factory.CreateClient().GetFromJsonAsync<FamilyGraphDto>("/api/family/graph");

        graph!.People.Should().NotBeEmpty();
    }

    [Fact]
    public async Task GetHealth_WhenNoRegistryIsConfigured_ShouldBeHealthy()
    {
        var response = await _factory.CreateClient().GetAsync("/health");
        response.StatusCode.Should().Be(HttpStatusCode.OK);

        // The deploy health check reads this body, so its shape must stay stable.
        using var body = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        var root = body.RootElement;

        root.TryGetProperty("status", out var status).Should().BeTrue();
        status.GetString().Should().Be("Healthy");
        root.TryGetProperty("version", out _).Should().BeTrue();
        root.TryGetProperty("commit", out _).Should().BeTrue();
        root.TryGetProperty("degradedFamilies", out var degradedFamilies).Should().BeTrue();
        degradedFamilies.ValueKind.Should().Be(JsonValueKind.Array);
        degradedFamilies.GetArrayLength().Should().Be(0);
    }
}
