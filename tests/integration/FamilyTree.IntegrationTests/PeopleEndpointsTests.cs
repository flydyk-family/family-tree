using System.Net;
using System.Net.Http.Json;
using FamilyTree.Application.Dtos;

namespace FamilyTree.IntegrationTests;

public sealed class PeopleEndpointsTests : IClassFixture<FamilyApiFactory>
{
    private readonly FamilyApiFactory _factory;

    public PeopleEndpointsTests(FamilyApiFactory factory)
    {
        _factory = factory;
    }

    [Fact]
    public async Task GetAll_WhenCalled_ShouldReturnAllPeople()
    {
        var client = _factory.CreateClient();

        var people = await client.GetFromJsonAsync<List<PersonSummaryDto>>("/api/people");

        people.Should().NotBeNull();
        people!.Should().HaveCount(2);
        people.Should().ContainSingle(person => person.IsDefaultRoot);
    }

    [Fact]
    public async Task GetById_WhenIdExists_ShouldReturnPerson()
    {
        var client = _factory.CreateClient();

        var response = await client.GetAsync("/api/people/p-0001");
        var person = await response.Content.ReadFromJsonAsync<PersonDto>();

        response.StatusCode.Should().Be(HttpStatusCode.OK);
        person.Should().NotBeNull();
        person!.Surname.Ru.Should().Be("Ковальский");
        person.Surname.Be.Should().Be("Кавальскі");
        person.Surname.En.Should().Be("Kowalski");
        person.GivenName.Ru.Should().Be("Ян");
        person.Sex.Should().Be("male");
    }

    [Fact]
    public async Task GetById_WhenPersonHasPortraitMedia_ShouldIncludeFilenames()
    {
        var client = _factory.CreateClient();

        var response = await client.GetAsync("/api/people/p-0001");
        var person = await response.Content.ReadFromJsonAsync<PersonDto>();

        response.StatusCode.Should().Be(HttpStatusCode.OK);
        person!.Portrait.Should().Be("p-0001.jpg");
        person.PortraitVideo.Should().Be("p-0001.mp4");
    }

    [Fact]
    public async Task GetById_WhenIdMissing_ShouldReturn404()
    {
        var client = _factory.CreateClient();

        var response = await client.GetAsync("/api/people/p-9999");

        response.StatusCode.Should().Be(HttpStatusCode.NotFound);
    }

    [Fact]
    public async Task GetById_WhenIdMalformed_ShouldReturn400()
    {
        var client = _factory.CreateClient();

        var response = await client.GetAsync("/api/people/not-an-id");

        response.StatusCode.Should().Be(HttpStatusCode.BadRequest);
    }
}
