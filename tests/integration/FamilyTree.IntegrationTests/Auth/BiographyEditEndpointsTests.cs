using System.Net;
using System.Net.Http.Json;
using FamilyTree.Api.Auth;
using FamilyTree.Application.Dtos;
using FamilyTree.IntegrationTests.Auth;

namespace FamilyTree.IntegrationTests;

public sealed class BiographyEditEndpointsTests : IClassFixture<AuthApiFactory>
{
    private readonly AuthApiFactory _factory;

    public BiographyEditEndpointsTests(AuthApiFactory factory)
    {
        _factory = factory;
    }

    private static LocalizedTextDto Bio(string en) => new(null, null, en);

    [Fact]
    public async Task UpdateBiography_WhenNoCookie_ShouldReturn401()
    {
        var client = _factory.CreateCookieClient();

        var response = await client.PutAsJsonAsync("/api/people/p-0001/biography", Bio("anon"));

        response.StatusCode.Should().Be(HttpStatusCode.Unauthorized);
    }

    [Fact]
    public async Task UpdateBiography_WhenNonEditorCookie_ShouldReturn403()
    {
        var client = _factory.CreateCookieClient();
        await client.PostAsJsonAsync(
            "/api/auth/session",
            new LoginRequest(FakeGoogleIdTokenValidator.GuestIdToken));

        var response = await client.PutAsJsonAsync("/api/people/p-0001/biography", Bio("guest edit"));

        response.StatusCode.Should().Be(HttpStatusCode.Forbidden);
    }

    [Fact]
    public async Task UpdateBiography_WhenEditorCookie_ShouldReturn200AndFollowUpGetReflectsEdit()
    {
        var client = _factory.CreateCookieClient();
        await client.PostAsJsonAsync(
            "/api/auth/session",
            new LoginRequest(FakeGoogleIdTokenValidator.EditorIdToken));

        var put = await client.PutAsJsonAsync("/api/people/p-0001/biography", Bio("first edit"));
        put.StatusCode.Should().Be(HttpStatusCode.OK);

        var fetched = await client.GetFromJsonAsync<PersonDto>("/api/people/p-0001");
        fetched!.Biography!.En.Should().Be("first edit");
    }

    [Fact]
    public async Task UpdateBiography_WhenEditedTwice_ShouldReflectLatestEdit()
    {
        var client = _factory.CreateCookieClient();
        await client.PostAsJsonAsync(
            "/api/auth/session",
            new LoginRequest(FakeGoogleIdTokenValidator.EditorIdToken));

        await client.PutAsJsonAsync("/api/people/p-0001/biography", Bio("edit one"));
        await client.PutAsJsonAsync("/api/people/p-0001/biography", Bio("edit two"));

        var fetched = await client.GetFromJsonAsync<PersonDto>("/api/people/p-0001");
        fetched!.Biography!.En.Should().Be("edit two");
    }

    [Fact]
    public async Task UpdateBiography_WhenPersonMissing_ShouldReturn404()
    {
        var client = _factory.CreateCookieClient();
        await client.PostAsJsonAsync(
            "/api/auth/session",
            new LoginRequest(FakeGoogleIdTokenValidator.EditorIdToken));

        var response = await client.PutAsJsonAsync("/api/people/p-8888/biography", Bio("ghost"));

        response.StatusCode.Should().Be(HttpStatusCode.NotFound);
    }
}
