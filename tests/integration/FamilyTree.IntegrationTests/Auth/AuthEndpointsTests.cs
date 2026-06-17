using System.Net;
using System.Net.Http.Json;
using FamilyTree.Api.Auth;
using FamilyTree.IntegrationTests.Auth;

namespace FamilyTree.IntegrationTests;

public sealed class AuthEndpointsTests : IClassFixture<AuthApiFactory>
{
    private readonly AuthApiFactory _factory;

    public AuthEndpointsTests(AuthApiFactory factory)
    {
        _factory = factory;
    }

    [Fact]
    public async Task SignIn_WhenEditorToken_ShouldReturn200WithCookieAndCanEditTrue()
    {
        var client = _factory.CreateCookieClient();

        var response = await client.PostAsJsonAsync(
            "/api/auth/session",
            new LoginRequest(FakeGoogleIdTokenValidator.EditorIdToken));
        var body = await response.Content.ReadFromJsonAsync<MeResponse>();

        response.StatusCode.Should().Be(HttpStatusCode.OK);
        response.Headers.TryGetValues("Set-Cookie", out var cookies).Should().BeTrue();
        cookies!.Should().Contain(value => value.StartsWith("ft_session="));
        body!.Email.Should().Be(FakeGoogleIdTokenValidator.EditorEmail);
        body.CanEdit.Should().BeTrue();
    }

    [Fact]
    public async Task SignIn_WhenInvalidToken_ShouldReturn401()
    {
        var client = _factory.CreateCookieClient();

        var response = await client.PostAsJsonAsync(
            "/api/auth/session",
            new LoginRequest("totally-invalid"));

        response.StatusCode.Should().Be(HttpStatusCode.Unauthorized);
    }

    [Fact]
    public async Task Me_WhenNoCookie_ShouldReturn401()
    {
        var client = _factory.CreateCookieClient();

        var response = await client.GetAsync("/api/auth/me");

        response.StatusCode.Should().Be(HttpStatusCode.Unauthorized);
    }

    [Fact]
    public async Task Me_WhenSignedIn_ShouldReturn200WithIdentity()
    {
        var client = _factory.CreateCookieClient();
        await client.PostAsJsonAsync(
            "/api/auth/session",
            new LoginRequest(FakeGoogleIdTokenValidator.EditorIdToken));

        var response = await client.GetAsync("/api/auth/me");
        var body = await response.Content.ReadFromJsonAsync<MeResponse>();

        response.StatusCode.Should().Be(HttpStatusCode.OK);
        body!.Email.Should().Be(FakeGoogleIdTokenValidator.EditorEmail);
        body.CanEdit.Should().BeTrue();
    }

    [Fact]
    public async Task Logout_WhenSignedIn_ShouldReturn204AndSubsequentMeIs401()
    {
        var client = _factory.CreateCookieClient();
        await client.PostAsJsonAsync(
            "/api/auth/session",
            new LoginRequest(FakeGoogleIdTokenValidator.EditorIdToken));

        var logout = await client.PostAsync("/api/auth/logout", null);
        var me = await client.GetAsync("/api/auth/me");

        logout.StatusCode.Should().Be(HttpStatusCode.NoContent);
        me.StatusCode.Should().Be(HttpStatusCode.Unauthorized);
    }
}
