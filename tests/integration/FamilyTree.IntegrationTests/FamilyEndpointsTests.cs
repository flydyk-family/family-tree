using System.Net;
using System.Net.Http.Json;
using FamilyTree.Application.Dtos;

namespace FamilyTree.IntegrationTests;

public sealed class FamilyEndpointsTests : IClassFixture<FamilyApiFactory>
{
    private readonly FamilyApiFactory _factory;

    public FamilyEndpointsTests(FamilyApiFactory factory)
    {
        _factory = factory;
    }

    [Fact]
    public async Task GetGraph_WhenCalled_ShouldReturnPeopleAndUnions()
    {
        var client = _factory.CreateClient();

        var response = await client.GetAsync("/api/family/graph");
        var graph = await response.Content.ReadFromJsonAsync<FamilyGraphDto>();

        response.StatusCode.Should().Be(HttpStatusCode.OK);
        graph.Should().NotBeNull();
        graph!.People.Should().HaveCount(3);
        graph.Unions.Should().ContainSingle().Which.PartnerIds.Should().Equal("p-0001", "p-0002");
    }

    [Fact]
    public async Task GetGraph_WhenPersonHasPortraitMedia_ShouldIncludeFilenamesInSummary()
    {
        var client = _factory.CreateClient();

        var response = await client.GetAsync("/api/family/graph");
        var graph = await response.Content.ReadFromJsonAsync<FamilyGraphDto>();

        response.StatusCode.Should().Be(HttpStatusCode.OK);
        var jan = graph!.People.Single(person => person.Id == "p-0001");
        jan.Portrait.Should().Be("p-0001.jpg");
        jan.PortraitVideo.Should().Be("p-0001.mp4");
    }
}
