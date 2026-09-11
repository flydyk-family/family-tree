using System.Net;
using System.Net.Http.Json;
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
    }
}
