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

    private static PersonProfileDto BirthYear(int year) => new(null, null, null, null, null, year, null, null, null, null, null, null);

    private static PersonProfileDto BirthDate(int year, int? month, int? day) =>
        new(null, null, null, null, null, year, month, day, null, null, null, null);

    private static PersonProfileDto MiddleNameProfile(LocalizedTextDto middleName) =>
        new(null, null, null, middleName, null, null, null, null, null, null, null, null);

    private static PersonProfileDto ResidencesProfile(params ResidenceDto[] residences) =>
        new(null, null, null, null, null, null, null, null, null, null, null, null, residences);

    private async Task<HttpClient> SignedInAsync(string idToken)
    {
        var client = _factory.CreateCookieClient();
        await client.PostAsJsonAsync("/api/auth/session", new LoginRequest(idToken));
        return client;
    }

    [Fact]
    public async Task GetProfile_WhenPersonExists_ShouldReturn200()
    {
        var client = _factory.CreateCookieClient();

        var response = await client.GetAsync("/api/people/p-0001/profile");

        response.StatusCode.Should().Be(HttpStatusCode.OK);
    }

    [Fact]
    public async Task PutProfile_WhenNotSignedIn_ShouldReturn401()
    {
        var client = _factory.CreateCookieClient();

        var response = await client.PutAsJsonAsync("/api/people/p-0001/profile", BirthYear(1751));

        response.StatusCode.Should().Be(HttpStatusCode.Unauthorized);
    }

    [Fact]
    public async Task PutProfile_WhenSignedInButNotAllowlisted_ShouldReturn403()
    {
        var client = await SignedInAsync(FakeGoogleIdTokenValidator.GuestIdToken);

        var response = await client.PutAsJsonAsync("/api/people/p-0001/profile", BirthYear(1751));

        response.StatusCode.Should().Be(HttpStatusCode.Forbidden);
    }

    [Fact]
    public async Task PutProfile_WhenBirthYearPlacesChildBeforeParent_ShouldReturn400()
    {
        var client = await SignedInAsync(FakeGoogleIdTokenValidator.EditorIdToken);

        // p-0003 (child, seed 1780) has parent p-0001 (seed 1750). Moving the child's
        // birth to 1740 — before the parent — must be rejected by the cross-entity check.
        var response = await client.PutAsJsonAsync("/api/people/p-0003/profile", BirthYear(1740));

        response.StatusCode.Should().Be(HttpStatusCode.BadRequest);
    }

    [Fact]
    public async Task PutProfile_WhenSexUnparseable_ShouldReturn400()
    {
        var client = await SignedInAsync(FakeGoogleIdTokenValidator.EditorIdToken);

        // A typo in an enum field must be rejected, not silently dropped with a 200.
        var badSex = new PersonProfileDto(null, null, null, null, "mal", null, null, null, null, null, null, null);
        var response = await client.PutAsJsonAsync("/api/people/p-0001/profile", badSex);

        response.StatusCode.Should().Be(HttpStatusCode.BadRequest);
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

    [Fact]
    public async Task PutProfile_WhenFullBirthDateValid_ShouldReturn200AndReflectInGraph()
    {
        var client = await SignedInAsync(FakeGoogleIdTokenValidator.EditorIdToken);

        var put = await client.PutAsJsonAsync("/api/people/p-0001/profile", BirthDate(1751, 5, 3));
        put.StatusCode.Should().Be(HttpStatusCode.OK);

        var person = await client.GetFromJsonAsync<PersonDto>("/api/people/p-0001");
        person!.Birth.Month.Should().Be(5);
        person.Birth.Day.Should().Be(3);
    }

    [Fact]
    public async Task PutProfile_WhenDayInvalidForMonth_ShouldReturn400()
    {
        var client = await SignedInAsync(FakeGoogleIdTokenValidator.EditorIdToken);

        // April has 30 days; p-0001 seed birth year is known (1750), so the effective date resolves.
        var response = await client.PutAsJsonAsync("/api/people/p-0001/profile", BirthDate(1750, 4, 31));

        response.StatusCode.Should().Be(HttpStatusCode.BadRequest);
    }

    [Fact]
    public async Task PutProfile_WhenDayWithoutMonth_ShouldReturn400()
    {
        var client = await SignedInAsync(FakeGoogleIdTokenValidator.EditorIdToken);

        // p-0002 never has a birth month durably set, so the effective month stays null → day-without-month.
        var response = await client.PutAsJsonAsync("/api/people/p-0002/profile", BirthDate(1750, null, 3));

        response.StatusCode.Should().Be(HttpStatusCode.BadRequest);
    }

    private static PersonProfileDto DeathDate(int year, int? month, int? day) =>
        new(null, null, null, null, null, null, null, null, year, month, day, null);

    [Fact]
    public async Task PutProfile_WhenDeathDayInvalidForMonth_ShouldReturn400()
    {
        var client = await SignedInAsync(FakeGoogleIdTokenValidator.EditorIdToken);

        var response = await client.PutAsJsonAsync("/api/people/p-0002/profile", DeathDate(1820, 4, 31)); // April has 30 days

        response.StatusCode.Should().Be(HttpStatusCode.BadRequest);
    }

    [Fact]
    public async Task PutProfile_WhenFullDeathDateValid_ShouldReturn200AndReflectInGraph()
    {
        var client = await SignedInAsync(FakeGoogleIdTokenValidator.EditorIdToken);

        var put = await client.PutAsJsonAsync("/api/people/p-0002/profile", DeathDate(1820, 6, 12));
        put.StatusCode.Should().Be(HttpStatusCode.OK);

        var person = await client.GetFromJsonAsync<PersonDto>("/api/people/p-0002");
        person!.Death!.Year.Should().Be(1820);
        person.Death.Month.Should().Be(6);
        person.Death.Day.Should().Be(12);
    }

    [Fact]
    public async Task PutProfile_WhenReplacementDropsMonthLeavingDayWithoutSeedMonth_ShouldReturn400AndNotWipeStoredDate()
    {
        var client = await SignedInAsync(FakeGoogleIdTokenValidator.EditorIdToken);

        // Establish a coherent override: year 1780, month 5, day 3.
        (await client.PutAsJsonAsync("/api/people/p-0003/profile", BirthDate(1780, 5, 3))).StatusCode.Should().Be(HttpStatusCode.OK);

        // A profile save is a whole-document replace, so omitting the month drops it back to the
        // seed (p-0003 has no seed month) — the persisted date would render as day-without-month.
        // Validating against the seed baseline (not the prior override) rejects it up front...
        var response = await client.PutAsJsonAsync("/api/people/p-0003/profile", BirthDate(1780, null, 20));
        response.StatusCode.Should().Be(HttpStatusCode.BadRequest);

        // ...and the rejected write never runs, so the coherent prior override is left intact.
        var person = await client.GetFromJsonAsync<PersonDto>("/api/people/p-0003");
        person!.Birth.Month.Should().Be(5);
        person.Birth.Day.Should().Be(3);
    }

    [Fact]
    public async Task GetPerson_WhenSeedHasMiddleName_ShouldReturnIt()
    {
        var client = _factory.CreateCookieClient();

        // p-0003 carries a seed patronymic (Отчество) in the fixture.
        var person = await client.GetFromJsonAsync<PersonDto>("/api/people/p-0003");

        person!.MiddleName!.Ru.Should().Be("Янович");
        person.MiddleName.En.Should().Be("Yanovich");
    }

    [Fact]
    public async Task PutProfile_WhenMiddleNameProvided_ShouldPersistAndMerge()
    {
        var client = await SignedInAsync(FakeGoogleIdTokenValidator.EditorIdToken);

        // p-0001 has no seed middle name; the override adds one.
        var put = await client.PutAsJsonAsync("/api/people/p-0001/profile",
            MiddleNameProfile(new LocalizedTextDto("Богданович", "Багданавіч", "Bohdanovich")));
        put.StatusCode.Should().Be(HttpStatusCode.OK);

        var person = await client.GetFromJsonAsync<PersonDto>("/api/people/p-0001");
        person!.MiddleName!.Ru.Should().Be("Богданович");
        person.MiddleName.En.Should().Be("Bohdanovich");
    }

    [Fact]
    public async Task PutProfile_WhenResidenceCarriesAPlaceId_ShouldPersistAndRoundTripThroughGet()
    {
        var client = await SignedInAsync(FakeGoogleIdTokenValidator.EditorIdToken);
        var residence = new ResidenceDto(
            new LocalizedTextDto("Александровка", null, "Aleksandrovka"),
            1920, 1930, 50.28, 40.02,
            "https://www.google.com/maps/search/?api=1&query=50.28,40.02",
            "ChIJN1t_tDeuEmsRUsoyG83frY4");

        var put = await client.PutAsJsonAsync("/api/people/p-0001/profile", ResidencesProfile(residence));
        put.StatusCode.Should().Be(HttpStatusCode.OK);

        var person = await client.GetFromJsonAsync<PersonDto>("/api/people/p-0001");
        person!.Residences.Should().ContainSingle()
            .Which.PlaceId.Should().Be("ChIJN1t_tDeuEmsRUsoyG83frY4");
    }

    [Fact]
    public async Task PutProfile_WhenResidencePlaceIdHasUrlBreakingCharacters_ShouldReturn400()
    {
        var client = await SignedInAsync(FakeGoogleIdTokenValidator.EditorIdToken);
        var residence = new ResidenceDto(
            new LocalizedTextDto("Минск", null, "Minsk"), 1900, 1910, 53.9, 27.56, null, "not/a valid?id");

        var response = await client.PutAsJsonAsync("/api/people/p-0001/profile", ResidencesProfile(residence));
        response.StatusCode.Should().Be(HttpStatusCode.BadRequest);
    }
}
