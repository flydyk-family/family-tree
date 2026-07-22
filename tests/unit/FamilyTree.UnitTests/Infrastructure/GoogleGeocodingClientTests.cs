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
