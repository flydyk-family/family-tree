using System.Net;
using System.Net.Http.Json;
using AwesomeAssertions;
using Microsoft.AspNetCore.Mvc.Testing;

namespace FamilyTree.IntegrationTests;

public sealed class FamilyApiTests : IClassFixture<WebApplicationFactory<Program>>
{
    private static readonly Guid KnownMemberId = Guid.Parse("66666666-6666-6666-6666-666666666666");

    private readonly WebApplicationFactory<Program> _factory;

    public FamilyApiTests(WebApplicationFactory<Program> factory)
    {
        _factory = factory;
    }

    [Fact]
    public async Task GetFamilyTree_WhenDataLoaded_ShouldReturn200WithNodesAndEdges()
    {
        var client = _factory.CreateClient();

        var response = await client.GetAsync("/api/family-tree");

        response.StatusCode.Should().Be(HttpStatusCode.OK);
        var tree = await response.Content.ReadFromJsonAsync<FamilyTreeResponse>();
        tree.Should().NotBeNull();
        tree!.Nodes.Should().NotBeEmpty();
        tree.Edges.Should().NotBeEmpty();
        tree.MaxGeneration.Should().BeGreaterThan(tree.MinGeneration);
    }

    [Fact]
    public async Task GetMember_WhenIdExists_ShouldReturn200WithDetail()
    {
        var client = _factory.CreateClient();

        var response = await client.GetAsync($"/api/members/{KnownMemberId}");

        response.StatusCode.Should().Be(HttpStatusCode.OK);
        var member = await response.Content.ReadFromJsonAsync<MemberDetailResponse>();
        member.Should().NotBeNull();
        member!.DisplayName.Should().NotBeNullOrWhiteSpace();
    }

    [Fact]
    public async Task GetMember_WhenIdUnknown_ShouldReturn404()
    {
        var client = _factory.CreateClient();

        var response = await client.GetAsync($"/api/members/{Guid.NewGuid()}");

        response.StatusCode.Should().Be(HttpStatusCode.NotFound);
    }

    [Fact]
    public async Task GetMember_WhenIdNotAGuid_ShouldReturn404()
    {
        var client = _factory.CreateClient();

        var response = await client.GetAsync("/api/members/not-a-guid");

        response.StatusCode.Should().Be(HttpStatusCode.NotFound);
    }

    private sealed record FamilyTreeResponse(
        IReadOnlyList<object> Nodes,
        IReadOnlyList<object> Edges,
        int MinGeneration,
        int MaxGeneration);

    private sealed record MemberDetailResponse(string DisplayName);
}
