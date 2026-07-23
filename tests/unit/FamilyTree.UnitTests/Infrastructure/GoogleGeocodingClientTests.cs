using System.Net;
using System.Text;
using FamilyTree.Infrastructure;
using Microsoft.Extensions.Logging.Abstractions;
using Microsoft.Extensions.Options;

namespace FamilyTree.UnitTests.Infrastructure;

public sealed class GoogleGeocodingClientTests
{
    private static GoogleGeocodingClient CreateClient(StubHttpMessageHandler handler)
    {
        var httpClient = new HttpClient(handler) { BaseAddress = new Uri("https://maps.googleapis.com/") };
        var options = Options.Create(new GoogleMapsOptions { GeocodingApiKey = "test-key" });
        return new GoogleGeocodingClient(httpClient, options, NullLogger<GoogleGeocodingClient>.Instance);
    }

    [Fact]
    public async Task SearchAsync_WhenQueryHasSpaceAndAmpersand_ShouldEscapeIntoAddressParameter()
    {
        var handler = new StubHttpMessageHandler(_ => JsonResponse(HttpStatusCode.OK, """{"status":"OK","results":[]}"""));
        var client = CreateClient(handler);

        await client.SearchAsync("New York & Boston", CancellationToken.None);

        handler.RequestUris.Should().ContainSingle();
        handler.RequestUris[0].Query.Should().Contain("address=New%20York%20%26%20Boston");
    }

    [Fact]
    public async Task SearchAsync_WhenHttpStatusNotOk_ShouldReturnEmptyResultWithoutThrowing()
    {
        var handler = new StubHttpMessageHandler(_ => new HttpResponseMessage(HttpStatusCode.InternalServerError));
        var client = CreateClient(handler);

        var act = async () => await client.SearchAsync("Minsk", CancellationToken.None);

        var results = await act.Should().NotThrowAsync();
        results.Which.Should().BeEmpty();
    }

    [Fact]
    public async Task SearchAsync_WhenGoogleStatusIsZeroResults_ShouldReturnEmptyResult()
    {
        var handler = new StubHttpMessageHandler(_ =>
            JsonResponse(HttpStatusCode.OK, """{"status":"ZERO_RESULTS","results":[]}"""));
        var client = CreateClient(handler);

        var results = await client.SearchAsync("Nowhere", CancellationToken.None);

        results.Should().BeEmpty();
    }

    [Fact]
    public async Task SearchAsync_WhenBodyIsUnparseableJson_ShouldReturnEmptyResult()
    {
        var handler = new StubHttpMessageHandler(_ => JsonResponse(HttpStatusCode.OK, "not json"));
        var client = CreateClient(handler);

        var results = await client.SearchAsync("Minsk", CancellationToken.None);

        results.Should().BeEmpty();
    }

    private const string MinskWithLocalityJson = """
        {
          "status": "OK",
          "results": [
            {
              "place_id": "minsk-1",
              "formatted_address": "Minsk, Belarus",
              "geometry": { "location": { "lat": 53.9, "lng": 27.5667 } },
              "address_components": [
                { "long_name": "Minsk", "types": ["locality", "political"] },
                { "long_name": "Minsk Region", "types": ["administrative_area_level_1", "political"] },
                { "long_name": "Belarus", "types": ["country", "political"] }
              ]
            }
          ]
        }
        """;

    [Fact]
    public async Task SearchAsync_WhenResponseHasResults_ShouldMapEachToGeocodePlace()
    {
        var handler = new StubHttpMessageHandler(_ => JsonResponse(HttpStatusCode.OK, MinskWithLocalityJson));
        var client = CreateClient(handler);

        var results = await client.SearchAsync("Minsk", CancellationToken.None);

        results.Should().ContainSingle();
        results[0].Lat.Should().Be(53.9);
        results[0].Lng.Should().Be(27.5667);
        results[0].Description.Should().Be("Minsk, Belarus");
        results[0].PlaceId.Should().Be("minsk-1");
    }

    [Fact]
    public async Task ReverseAsync_WhenResponseHasResults_ShouldReturnTopResultPlaceId()
    {
        var handler = new StubHttpMessageHandler(_ => JsonResponse(HttpStatusCode.OK, MinskWithLocalityJson));
        var client = CreateClient(handler);

        var placeId = await client.ReverseAsync(53.9, 27.5667, CancellationToken.None);

        placeId.Should().Be("minsk-1");
    }

    [Fact]
    public async Task ReverseAsync_WhenResultsEmpty_ShouldReturnNull()
    {
        var handler = new StubHttpMessageHandler(_ =>
            JsonResponse(HttpStatusCode.OK, """{"status":"ZERO_RESULTS","results":[]}"""));
        var client = CreateClient(handler);

        var placeId = await client.ReverseAsync(0, 0, CancellationToken.None);

        placeId.Should().BeNull();
    }

    [Fact]
    public async Task LocalizedNamesAsync_WhenResultHasLocality_ShouldPreferLocalityOverFormattedAddress()
    {
        var handler = new StubHttpMessageHandler(_ => JsonResponse(HttpStatusCode.OK, MinskWithLocalityJson));
        var client = CreateClient(handler);

        var names = await client.LocalizedNamesAsync("minsk-1", CancellationToken.None);

        names.Should().NotBeNull();
        names!.Ru.Should().Be("Minsk");
        names.Be.Should().Be("Minsk");
        names.En.Should().Be("Minsk");
    }

    [Fact]
    public async Task LocalizedNamesAsync_WhenNoLocality_ShouldFallBackToAdministrativeAreaLevel2()
    {
        const string json = """
            {
              "status": "OK",
              "results": [
                {
                  "place_id": "p1",
                  "formatted_address": "Some County, Country",
                  "geometry": { "location": { "lat": 1, "lng": 2 } },
                  "address_components": [
                    { "long_name": "Some County", "types": ["administrative_area_level_2", "political"] },
                    { "long_name": "Country", "types": ["country", "political"] }
                  ]
                }
              ]
            }
            """;
        var handler = new StubHttpMessageHandler(_ => JsonResponse(HttpStatusCode.OK, json));
        var client = CreateClient(handler);

        var names = await client.LocalizedNamesAsync("p1", CancellationToken.None);

        names!.Ru.Should().Be("Some County");
    }

    [Fact]
    public async Task LocalizedNamesAsync_WhenNoLocalityOrAdministrativeArea_ShouldFallBackToFormattedAddress()
    {
        const string json = """
            {
              "status": "OK",
              "results": [
                {
                  "place_id": "p1",
                  "formatted_address": "Middle of Nowhere",
                  "geometry": { "location": { "lat": 1, "lng": 2 } },
                  "address_components": [
                    { "long_name": "Some Country", "types": ["country", "political"] }
                  ]
                }
              ]
            }
            """;
        var handler = new StubHttpMessageHandler(_ => JsonResponse(HttpStatusCode.OK, json));
        var client = CreateClient(handler);

        var names = await client.LocalizedNamesAsync("p1", CancellationToken.None);

        names!.Ru.Should().Be("Middle of Nowhere");
    }

    [Fact]
    public async Task LocalizedNamesAsync_WhenAddressComponentsMissing_ShouldFallBackToFormattedAddress()
    {
        const string json = """
            {
              "status": "OK",
              "results": [
                {
                  "place_id": "p1",
                  "formatted_address": "No Components Here",
                  "geometry": { "location": { "lat": 1, "lng": 2 } }
                }
              ]
            }
            """;
        var handler = new StubHttpMessageHandler(_ => JsonResponse(HttpStatusCode.OK, json));
        var client = CreateClient(handler);

        var names = await client.LocalizedNamesAsync("p1", CancellationToken.None);

        names!.Ru.Should().Be("No Components Here");
    }

    [Fact]
    public async Task LocalizedNamesAsync_WhenAResultIsMissing_ShouldFallBackToEmptyStringForThatLocale()
    {
        var handler = new StubHttpMessageHandler(_ =>
            JsonResponse(HttpStatusCode.OK, """{"status":"ZERO_RESULTS","results":[]}"""));
        var client = CreateClient(handler);

        var names = await client.LocalizedNamesAsync("nowhere", CancellationToken.None);

        names!.Ru.Should().Be("");
        names.Be.Should().Be("");
        names.En.Should().Be("");
    }

    [Fact]
    public async Task SearchAsync_WhenRequestTimesOut_ShouldReturnEmptyWithoutThrowing()
    {
        var handler = new StubHttpMessageHandler(_ => throw new TaskCanceledException("The request timed out."));
        var client = CreateClient(handler);

        var act = async () => await client.SearchAsync("Minsk", CancellationToken.None);

        var results = await act.Should().NotThrowAsync();
        results.Which.Should().BeEmpty();
    }

    [Fact]
    public async Task SearchAsync_WhenHttpRequestFails_ShouldReturnEmptyWithoutThrowing()
    {
        var handler = new StubHttpMessageHandler(_ => throw new HttpRequestException("DNS resolution failed."));
        var client = CreateClient(handler);

        var act = async () => await client.SearchAsync("Minsk", CancellationToken.None);

        var results = await act.Should().NotThrowAsync();
        results.Which.Should().BeEmpty();
    }

    private static HttpResponseMessage JsonResponse(HttpStatusCode status, string body) => new(status)
    {
        Content = new StringContent(body, Encoding.UTF8, "application/json")
    };

    /// <summary>Hand-rolled stub — no HTTP-mocking library dependency, per repo convention for
    /// thin HTTP wrappers. Captures every outbound request URI.</summary>
    private sealed class StubHttpMessageHandler : HttpMessageHandler
    {
        private readonly Func<HttpRequestMessage, HttpResponseMessage> _responder;
        private readonly List<Uri> _requestUris = [];
        private readonly Lock _gate = new();

        public StubHttpMessageHandler(Func<HttpRequestMessage, HttpResponseMessage> responder)
        {
            _responder = responder;
        }

        public IReadOnlyList<Uri> RequestUris
        {
            get
            {
                lock (_gate)
                {
                    return _requestUris.ToList();
                }
            }
        }

        protected override Task<HttpResponseMessage> SendAsync(
            HttpRequestMessage request, CancellationToken cancellationToken)
        {
            lock (_gate)
            {
                _requestUris.Add(request.RequestUri!);
            }
            return Task.FromResult(_responder(request));
        }
    }
}
