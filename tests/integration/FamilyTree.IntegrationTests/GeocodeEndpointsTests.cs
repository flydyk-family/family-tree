using System.Net;
using System.Net.Http.Json;
using FamilyTree.Api.Auth;
using FamilyTree.Application.Geocoding;
using FamilyTree.IntegrationTests.Auth;

namespace FamilyTree.IntegrationTests;

/// <summary>Geocoding is editor-only: an unauthenticated endpoint would turn Cloud Run into a
/// free public geocoding proxy billed to the owner's account. These tests are the guard.</summary>
public sealed class GeocodeEndpointsTests : IClassFixture<AuthApiFactory>
{
    private readonly AuthApiFactory _factory;

    public GeocodeEndpointsTests(AuthApiFactory factory)
    {
        _factory = factory;
    }

    private async Task<HttpClient> SignedInAsync(string idToken)
    {
        var client = _factory.CreateCookieClient();
        await client.PostAsJsonAsync("/api/auth/session", new LoginRequest(idToken));
        return client;
    }

    // --- search ---

    [Fact]
    public async Task Search_WhenAnonymous_ShouldReturn401()
    {
        var client = _factory.CreateCookieClient();

        var response = await client.GetAsync("/api/geocode/search?q=Minsk");

        response.StatusCode.Should().Be(HttpStatusCode.Unauthorized);
    }

    [Fact]
    public async Task Search_WhenGuestNonEditor_ShouldReturn403()
    {
        var client = await SignedInAsync(FakeGoogleIdTokenValidator.GuestIdToken);

        var response = await client.GetAsync("/api/geocode/search?q=Minsk");

        response.StatusCode.Should().Be(HttpStatusCode.Forbidden);
    }

    [Fact]
    public async Task Search_WhenEditorAndKeyUnconfigured_ShouldReturn200WithEmptyList()
    {
        var client = await SignedInAsync(FakeGoogleIdTokenValidator.EditorIdToken);

        var response = await client.GetAsync("/api/geocode/search?q=Minsk");

        response.StatusCode.Should().Be(HttpStatusCode.OK);
        var results = await response.Content.ReadFromJsonAsync<IReadOnlyList<GeocodePlaceDto>>();
        results.Should().BeEmpty();
    }

    [Fact]
    public async Task Search_WhenEditorAndQueryEmpty_ShouldReturn400()
    {
        var client = await SignedInAsync(FakeGoogleIdTokenValidator.EditorIdToken);

        var response = await client.GetAsync("/api/geocode/search?q=");

        response.StatusCode.Should().Be(HttpStatusCode.BadRequest);
    }

    // --- reverse ---

    [Fact]
    public async Task Reverse_WhenAnonymous_ShouldReturn401()
    {
        var client = _factory.CreateCookieClient();

        var response = await client.GetAsync("/api/geocode/reverse?lat=53.9&lng=27.5667");

        response.StatusCode.Should().Be(HttpStatusCode.Unauthorized);
    }

    [Fact]
    public async Task Reverse_WhenGuestNonEditor_ShouldReturn403()
    {
        var client = await SignedInAsync(FakeGoogleIdTokenValidator.GuestIdToken);

        var response = await client.GetAsync("/api/geocode/reverse?lat=53.9&lng=27.5667");

        response.StatusCode.Should().Be(HttpStatusCode.Forbidden);
    }

    [Fact]
    public async Task Reverse_WhenEditorAndKeyUnconfigured_ShouldReturn200WithNullPlaceId()
    {
        var client = await SignedInAsync(FakeGoogleIdTokenValidator.EditorIdToken);

        var response = await client.GetAsync("/api/geocode/reverse?lat=53.9&lng=27.5667");

        response.StatusCode.Should().Be(HttpStatusCode.OK);
        var result = await response.Content.ReadFromJsonAsync<ReverseGeocodeResultDto>();
        result!.PlaceId.Should().BeNull();
    }

    [Fact]
    public async Task Reverse_WhenEditorAndLatOutOfRange_ShouldReturn400()
    {
        var client = await SignedInAsync(FakeGoogleIdTokenValidator.EditorIdToken);

        var response = await client.GetAsync("/api/geocode/reverse?lat=999&lng=27.5667");

        response.StatusCode.Should().Be(HttpStatusCode.BadRequest);
    }

    /// <summary>A plain <c>double</c> parameter binds a missing value to 0, which passes the
    /// range check — so without [BindRequired] an omitted coordinate would spend a billed
    /// Google lookup on null island (0,0) instead of failing fast.</summary>
    [Theory]
    [InlineData("/api/geocode/reverse")]
    [InlineData("/api/geocode/reverse?lat=53.9")]
    [InlineData("/api/geocode/reverse?lng=27.5667")]
    public async Task Reverse_WhenEditorAndACoordinateIsOmitted_ShouldReturn400(string url)
    {
        var client = await SignedInAsync(FakeGoogleIdTokenValidator.EditorIdToken);

        var response = await client.GetAsync(url);

        response.StatusCode.Should().Be(HttpStatusCode.BadRequest);
    }

    // --- names ---

    [Fact]
    public async Task Names_WhenAnonymous_ShouldReturn401()
    {
        var client = _factory.CreateCookieClient();

        var response = await client.GetAsync("/api/geocode/names?placeId=place-1");

        response.StatusCode.Should().Be(HttpStatusCode.Unauthorized);
    }

    [Fact]
    public async Task Names_WhenGuestNonEditor_ShouldReturn403()
    {
        var client = await SignedInAsync(FakeGoogleIdTokenValidator.GuestIdToken);

        var response = await client.GetAsync("/api/geocode/names?placeId=place-1");

        response.StatusCode.Should().Be(HttpStatusCode.Forbidden);
    }

    [Fact]
    public async Task Names_WhenEditorAndKeyUnconfigured_ShouldReturn404()
    {
        var client = await SignedInAsync(FakeGoogleIdTokenValidator.EditorIdToken);

        var response = await client.GetAsync("/api/geocode/names?placeId=place-1");

        response.StatusCode.Should().Be(HttpStatusCode.NotFound);
    }

    [Fact]
    public async Task Names_WhenEditorAndPlaceIdEmpty_ShouldReturn400()
    {
        var client = await SignedInAsync(FakeGoogleIdTokenValidator.EditorIdToken);

        var response = await client.GetAsync("/api/geocode/names?placeId=");

        response.StatusCode.Should().Be(HttpStatusCode.BadRequest);
    }
}
