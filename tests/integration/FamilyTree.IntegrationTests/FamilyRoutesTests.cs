using System.Net;
using System.Net.Http.Json;
using FamilyTree.Application.Dtos;
using FamilyTree.Application.Families;

namespace FamilyTree.IntegrationTests;

public sealed class FamilyRoutesTests : IClassFixture<TwoFamilyApiFactory>
{
    private readonly HttpClient _client;

    public FamilyRoutesTests(TwoFamilyApiFactory factory)
    {
        _client = factory.CreateClient();
    }

    [Fact]
    public async Task GetFamilies_WhenTwoAreRegistered_ShouldListBothWithTheDefaultMarked()
    {
        var families = await _client.GetFromJsonAsync<List<FamilySummaryDto>>("/api/families");

        families!.Select(f => f.Id).Should().Equal("perovsky", "kowalski");
        families!.Single(f => f.IsDefault).Id.Should().Be("perovsky");
    }

    [Fact]
    public async Task GetGraph_WhenCalledForTheSecondFamily_ShouldServeItsOwnPeople()
    {
        var graph = await _client.GetFromJsonAsync<FamilyGraphDto>("/api/families/kowalski/graph");

        graph!.People.Should().HaveCount(2);
        graph.People.Single(p => p.Id == "p-0001").Surname.En.Should().Be("Kowalczyk");
    }

    [Fact]
    public async Task GetGraph_WhenCalledThroughTheAlias_ShouldMatchTheDefaultFamilyRoute()
    {
        var alias = await _client.GetFromJsonAsync<FamilyGraphDto>("/api/family/graph");
        var scoped = await _client.GetFromJsonAsync<FamilyGraphDto>("/api/families/perovsky/graph");

        scoped!.People.Select(p => p.Id).Should().Equal(alias!.People.Select(p => p.Id));
    }

    [Fact]
    public async Task GetPerson_WhenIdsOverlapAcrossFamilies_ShouldResolveWithinTheNamedFamily()
    {
        var kowalski = await _client.GetFromJsonAsync<PersonDto>("/api/families/kowalski/people/p-0001");
        var perovsky = await _client.GetFromJsonAsync<PersonDto>("/api/people/p-0001");

        kowalski!.Surname.En.Should().Be("Kowalczyk");
        perovsky!.Surname.En.Should().Be("Kowalski");   // family.test.json:6
    }

    [Fact]
    public async Task GetGraph_WhenFamilyIsNotRegistered_ShouldReturnProblemDetailsNotFound()
    {
        var response = await _client.GetAsync("/api/families/nowak/graph");

        response.StatusCode.Should().Be(HttpStatusCode.NotFound);
        response.Content.Headers.ContentType!.MediaType.Should().Be("application/problem+json");
    }

    [Fact]
    public async Task GetGraph_WhenFamilyIdIsMixedCase_ShouldResolveTheFamily() =>
        (await _client.GetAsync("/api/families/Kowalski/graph")).StatusCode.Should().Be(HttpStatusCode.OK);

    [Fact]
    public async Task UploadPhoto_WhenAnonymousOnAnUnknownFamily_ShouldReturnUnauthorized()
    {
        // Pins the Task 6b ruling: the family middleware runs after authorization, so an anonymous
        // caller gets 401 on an [Authorize] route before the family is checked.
        using var content = new ByteArrayContent([1]);
        content.Headers.ContentType = new("application/octet-stream");

        var response = await _client.PostAsync("/api/families/nowak/people/p-0001/photos", content);

        response.StatusCode.Should().Be(HttpStatusCode.Unauthorized);
    }

    [Fact]
    public async Task GetPerson_WhenCalledOnAFamilyRoute_ShouldReadThatFamilyInsideTheRequest()
    {
        // Proves the middleware runs after routing has matched the {familyId} route: the family is
        // set before the scoped provider is resolved, so no FamilyContext guard exception is thrown.
        var response = await _client.GetAsync("/api/families/kowalski/people/p-0002");

        response.StatusCode.Should().Be(HttpStatusCode.OK);
        (await response.Content.ReadFromJsonAsync<PersonDto>())!.Surname.En.Should().Be("Kowalczyk");
    }

    [Fact]
    public async Task UploadPhoto_WhenPostedOnTheFamilyRoute_ShouldGetThePhotoSizeCap()
    {
        // Larger than the 256 KB default body cap, far below the photo cap; unauthenticated, so a
        // correct cap lets it through to auth (401) instead of rejecting it for size (413).
        using var content = new ByteArrayContent(new byte[300 * 1024]);
        content.Headers.ContentType = new("application/octet-stream");

        var response = await _client.PostAsync("/api/families/kowalski/people/p-0001/photos", content);

        response.StatusCode.Should().Be(HttpStatusCode.Unauthorized);
    }
}
