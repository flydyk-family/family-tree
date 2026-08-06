using System.Net;
using System.Text;
using FamilyTree.Domain;
using FamilyTree.Infrastructure;
using Microsoft.Extensions.Logging;
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

    /// <summary>Captures the client's own log output — level, message and formatted exception —
    /// so a test can assert what it does and does not write.</summary>
    private sealed class CapturingLogger : ILogger<GoogleGeocodingClient>
    {
        public List<(LogLevel Level, string Text)> Records { get; } = [];

        public List<string> Entries => Records.ConvertAll(r => r.Text);

        public IDisposable? BeginScope<TState>(TState state) where TState : notnull => null;

        public bool IsEnabled(LogLevel logLevel) => true;

        public void Log<TState>(LogLevel logLevel, EventId eventId, TState state, Exception? exception,
            Func<TState, Exception?, string> formatter) =>
            Records.Add((logLevel, $"{formatter(state, exception)} {exception}"));
    }

    /// <summary>A quota-exhausted or revoked key must be diagnosable in production, where Debug
    /// is off — otherwise a dead geocoder is indistinguishable from "found nothing". ZERO_RESULTS
    /// is the genuinely routine case and stays at Debug.</summary>
    [Theory]
    [InlineData("OVER_QUERY_LIMIT", LogLevel.Warning)]
    [InlineData("REQUEST_DENIED", LogLevel.Warning)]
    [InlineData("INVALID_REQUEST", LogLevel.Warning)]
    [InlineData("UNKNOWN_ERROR", LogLevel.Warning)]
    [InlineData("ZERO_RESULTS", LogLevel.Debug)]
    public async Task SearchAsync_WhenGoogleReturnsANonOkStatus_ShouldLogAtTheLevelThatStatusDeserves(
        string status, LogLevel expected)
    {
        var logger = new CapturingLogger();
        var handler = new StubHttpMessageHandler(_ =>
            JsonResponse(HttpStatusCode.OK, $$"""{"status":"{{status}}","results":[]}"""));
        var httpClient = new HttpClient(handler) { BaseAddress = new Uri("https://maps.googleapis.com/") };
        var client = new GoogleGeocodingClient(
            httpClient, Options.Create(new GoogleMapsOptions { GeocodingApiKey = "test-key" }), logger);

        var results = await client.SearchAsync("Minsk", CancellationToken.None);

        results.Should().BeEmpty();
        logger.Records.Should().ContainSingle().Which.Level.Should().Be(expected);
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

    private const string MinskWithViewportJson = """
        {
          "status": "OK",
          "results": [
            {
              "place_id": "minsk-1",
              "formatted_address": "Minsk, Belarus",
              "geometry": {
                "location": { "lat": 53.9, "lng": 27.5667 },
                "viewport": {
                  "northeast": { "lat": 54.0206, "lng": 27.7614 },
                  "southwest": { "lat": 53.8203, "lng": 27.3892 }
                }
              }
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

    /// <summary>The picker frames the map from these bounds, so the northeast/southwest
    /// corners must land on the right sides of the domain record.</summary>
    [Fact]
    public async Task SearchAsync_WhenResultCarriesAViewport_ShouldMapItsCornersToSouthWestNorthEast()
    {
        var handler = new StubHttpMessageHandler(_ => JsonResponse(HttpStatusCode.OK, MinskWithViewportJson));
        var client = CreateClient(handler);

        var results = await client.SearchAsync("Minsk", CancellationToken.None);

        results[0].Viewport.Should().Be(new GeocodeViewport(53.8203, 27.3892, 54.0206, 27.7614));
    }

    [Fact]
    public async Task SearchAsync_WhenResultHasNoViewport_ShouldLeaveItNull()
    {
        var handler = new StubHttpMessageHandler(_ => JsonResponse(HttpStatusCode.OK, MinskWithLocalityJson));
        var client = CreateClient(handler);

        var results = await client.SearchAsync("Minsk", CancellationToken.None);

        results[0].Viewport.Should().BeNull();
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

    /// <summary>Guards the client's *own* log calls, which the HttpClientFactory-level
    /// redaction pinned by GeocodingHttpLoggingTests does not cover: a later change that
    /// formats the request URI (which carries &amp;key=…) into one of these templates, or
    /// into an exception it logs, would leak the key past CodeQL's notice. Every failure
    /// path that logs is exercised here.</summary>
    [Theory]
    [InlineData("search")]
    [InlineData("reverse")]
    [InlineData("names")]
    public async Task AnyCall_WhenTheRequestThrows_ShouldLogTheFailureWithoutTheApiKey(string operation)
    {
        const string key = "super-secret-geocoding-key-9f3a";
        var logger = new CapturingLogger();
        var handler = new StubHttpMessageHandler(_ => throw new HttpRequestException("DNS resolution failed."));
        var httpClient = new HttpClient(handler) { BaseAddress = new Uri("https://maps.googleapis.com/") };
        var client = new GoogleGeocodingClient(
            httpClient, Options.Create(new GoogleMapsOptions { GeocodingApiKey = key }), logger);

        switch (operation)
        {
            case "search":
                (await client.SearchAsync("Minsk", CancellationToken.None)).Should().BeEmpty();
                break;
            case "reverse":
                (await client.ReverseAsync(53.9, 27.5667, CancellationToken.None)).Should().BeNull();
                break;
            default:
                (await client.LocalizedNamesAsync("minsk-1", CancellationToken.None))
                    .Should().Be(new LocalizedNames("", "", ""));
                break;
        }

        logger.Entries.Should().NotBeEmpty("a failed geocoding call must be logged, not swallowed silently");
        logger.Entries.Should().NotContain(e => e.Contains(key, StringComparison.Ordinal),
            "the API key must never reach the log sink through the client's own message templates or a logged exception");
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
