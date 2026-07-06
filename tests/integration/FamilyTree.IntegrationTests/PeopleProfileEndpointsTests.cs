using System.Net;
using System.Net.Http.Json;
using FamilyTree.Api.Auth;
using FamilyTree.Application.Dtos;
using FamilyTree.IntegrationTests.Auth;

namespace FamilyTree.IntegrationTests;

public sealed class PeopleProfileEndpointsTests : IClassFixture<AuthApiFactory>
{
    private readonly AuthApiFactory _factory;

    public PeopleProfileEndpointsTests(AuthApiFactory factory)
    {
        _factory = factory;
    }

    private static PersonProfileDto BirthYear(int year) => new(null, null, null, null, year, null, null);

    [Fact]
    public async Task GetProfile_WhenPersonExists_ShouldReturn200()
    {
        var client = _factory.CreateCookieClient();

        var response = await client.GetAsync("/api/people/p-0001/profile");

        response.StatusCode.Should().Be(HttpStatusCode.OK);
    }

    [Fact]
    public async Task PutProfile_WhenNotSignedIn_ShouldReturn401Or403()
    {
        var client = _factory.CreateCookieClient();

        var response = await client.PutAsJsonAsync("/api/people/p-0001/profile", BirthYear(1751));

        response.StatusCode.Should().Be(HttpStatusCode.Unauthorized);
    }

    [Fact]
    public async Task PutProfile_WhenEditorEditsBirthYear_ShouldPersistAndReflectInGraph()
    {
        var client = _factory.CreateCookieClient();
        await client.PostAsJsonAsync(
            "/api/auth/session",
            new LoginRequest(FakeGoogleIdTokenValidator.EditorIdToken));

        // p-0001 (seed birth year 1750) has no recorded parents or children in the test
        // fixture, so a small delta (1751) cannot cross the cross-entity birth-order check.
        var put = await client.PutAsJsonAsync("/api/people/p-0001/profile", BirthYear(1751));
        put.StatusCode.Should().Be(HttpStatusCode.OK);

        // The corrected value is visible in the merged graph the tree reads (the split-brain check).
        var graph = await client.GetFromJsonAsync<FamilyGraphDto>("/api/family/graph");
        graph!.People.Single(p => p.Id == "p-0001").BirthYear.Should().Be(1751);
    }
}
