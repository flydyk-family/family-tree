using System.Net;
using System.Net.Http.Json;
using FamilyTree.Api.Auth;
using FamilyTree.Domain;
using FamilyTree.Infrastructure;
using FamilyTree.IntegrationTests.Auth;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.AspNetCore.TestHost;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging;

namespace FamilyTree.IntegrationTests;

/// <summary>Checks HttpClientFactory's own built-in logging handlers for the geocoding client
/// (distinct from GoogleGeocodingClient's own ILogger calls, which never touch the key).
/// **Empirically, on this project's .NET 10, the query string is already redacted as "?*" in
/// the default "Start/End processing"/"Sending/Received" messages — the key was never actually
/// reaching the log stream via this path.** Confirmed by the second test below, which shows the
/// key absent even with Program.cs's AddFilter removed. The filter is kept anyway as cheap
/// defense-in-depth (it also just quiets routine per-request log noise for this client) — these
/// tests pin what it actually does: suppress the routine Information-level chatter, not "stop a
/// leak" (there is none to stop on this runtime).</summary>
public sealed class GeocodingHttpLoggingTests : IClassFixture<AuthApiFactory>
{
    private const string FakeKey = "fake-test-key-for-log-check";
    private readonly AuthApiFactory _baseFactory;

    public GeocodingHttpLoggingTests(AuthApiFactory baseFactory)
    {
        _baseFactory = baseFactory;
    }

    private sealed class StubHandler : HttpMessageHandler
    {
        protected override Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken cancellationToken) =>
            Task.FromResult(new HttpResponseMessage(HttpStatusCode.OK)
            {
                Content = new StringContent("""{"status":"OK","results":[]}""", System.Text.Encoding.UTF8, "application/json")
            });
    }

    private sealed class CapturingLoggerProvider : ILoggerProvider
    {
        private readonly Lock _gate = new();
        public List<(string Category, LogLevel Level, string Message)> Records { get; } = [];

        public ILogger CreateLogger(string categoryName) => new CapturingLogger(this, categoryName);

        public void Dispose() { }

        private sealed class CapturingLogger : ILogger
        {
            private readonly CapturingLoggerProvider _provider;
            private readonly string _category;

            public CapturingLogger(CapturingLoggerProvider provider, string category)
            {
                _provider = provider;
                _category = category;
            }

            public IDisposable? BeginScope<TState>(TState state) where TState : notnull => null;

            public bool IsEnabled(LogLevel logLevel) => true;

            public void Log<TState>(LogLevel logLevel, EventId eventId, TState state, Exception? exception,
                Func<TState, Exception?, string> formatter)
            {
                lock (_provider._gate)
                {
                    _provider.Records.Add((_category, logLevel, formatter(state, exception)));
                }
            }
        }
    }

    /// <summary>Builds a factory that (a) has a non-empty geocoding key so FetchAsync actually
    /// runs, (b) stubs the outbound HTTP call so no real network request is made, and
    /// (c) captures every log record so the test can inspect what HttpClientFactory's built-in
    /// handlers actually wrote. `includeFilter` toggles Program.cs's own AddFilter call, so the
    /// same test body can prove the filter is load-bearing by running with it disabled too.</summary>
    private (WebApplicationFactory<Program> Factory, CapturingLoggerProvider Logs) BuildFactory(bool includeFilter)
    {
        var logs = new CapturingLoggerProvider();
        var factory = _baseFactory.WithWebHostBuilder(builder =>
        {
            builder.UseSetting("GoogleMaps:GeocodingApiKey", FakeKey);
            builder.ConfigureLogging(logging =>
            {
                logging.AddProvider(logs);
                if (!includeFilter)
                {
                    // Cancel out Program.cs's AddFilter for this one category, so this run
                    // reproduces the pre-fix behavior — proving the assertion below would
                    // actually fail without the fix, not just pass vacuously.
                    logging.AddFilter("System.Net.Http.HttpClient.IGeocodingClient", LogLevel.Trace);
                }
            });
            builder.ConfigureTestServices(services =>
            {
                services.AddHttpClient<IGeocodingClient, GoogleGeocodingClient>()
                    .ConfigurePrimaryHttpMessageHandler(() => new StubHandler());
            });
        });
        return (factory, logs);
    }

    private static async Task<HttpClient> SignedInAsync(WebApplicationFactory<Program> factory)
    {
        var client = factory.CreateClient(new WebApplicationFactoryClientOptions { BaseAddress = new Uri("https://localhost") });
        await client.PostAsJsonAsync("/api/auth/session", new LoginRequest(FakeGoogleIdTokenValidator.EditorIdToken));
        return client;
    }

    [Fact]
    public async Task Search_WithTheFilter_ShouldSuppressAllHttpClientFactoryLoggingForThisClient()
    {
        var (factory, logs) = BuildFactory(includeFilter: true);
        var client = await SignedInAsync(factory);

        var response = await client.GetAsync("/api/geocode/search?q=Minsk");
        response.StatusCode.Should().Be(HttpStatusCode.OK);

        logs.Records.Should().NotContain(r =>
            r.Category.StartsWith("System.Net.Http.HttpClient.IGeocodingClient", StringComparison.Ordinal),
            "AddFilter(..., LogLevel.Warning) in Program.cs should suppress every routine " +
            "Information/Trace-level entry HttpClientFactory would otherwise emit for a clean 200 response");
        logs.Records.Should().NotContain(r => r.Message.Contains(FakeKey, StringComparison.Ordinal),
            "the API key must never appear in any log message, at any level, from any category");
    }

    [Fact]
    public async Task Search_WithoutTheFilter_ShouldEmitRoutineInformationLoggingButNeverTheKey()
    {
        // Load-bearing check for the test above: with the filter disabled, the same request
        // DOES produce Information-level records for this client — proving the filter in
        // Program.cs is what suppresses them, not an artifact of this test's own setup.
        // The key is still absent even here: .NET 10's default HttpClientFactory logging
        // redacts the query string as "?*" in these messages, so there was never a live key
        // leak on this runtime for AddFilter to have fixed — confirmed empirically, not assumed.
        var (factory, logs) = BuildFactory(includeFilter: false);
        var client = await SignedInAsync(factory);

        await client.GetAsync("/api/geocode/search?q=Minsk");

        logs.Records.Should().Contain(r =>
            r.Category.StartsWith("System.Net.Http.HttpClient.IGeocodingClient", StringComparison.Ordinal)
            && r.Level == LogLevel.Information);
        logs.Records.Should().NotContain(r => r.Message.Contains(FakeKey, StringComparison.Ordinal),
            "confirms .NET 10's default query-string redaction (\"?*\") — the key was never in these messages");
    }
}
