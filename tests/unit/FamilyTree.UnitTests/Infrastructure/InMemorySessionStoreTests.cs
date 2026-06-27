using FamilyTree.Infrastructure;

namespace FamilyTree.UnitTests.Infrastructure;

public sealed class InMemorySessionStoreTests
{
    private static Session NewSession(DateTimeOffset? expiresAt = null)
    {
        var now = DateTimeOffset.UtcNow;
        return new Session
        {
            Email = "editor@example.com",
            Name = "Editor One",
            CanEdit = true,
            CreatedAt = now,
            ExpiresAt = expiresAt ?? now.AddDays(7)
        };
    }

    [Fact]
    public async Task CreateAsync_WhenCalled_ShouldReturnTokenThatRoundTripsViaGet()
    {
        var store = new InMemorySessionStore();
        var session = NewSession();

        var token = await store.CreateAsync(session, CancellationToken.None);
        var fetched = await store.GetAsync(token, CancellationToken.None);

        token.Should().NotBeNullOrWhiteSpace();
        fetched.Should().NotBeNull();
        fetched!.Email.Should().Be("editor@example.com");
        fetched.Name.Should().Be("Editor One");
        fetched.CanEdit.Should().BeTrue();
    }

    [Fact]
    public async Task GetAsync_WhenTokenUnknown_ShouldReturnNull()
    {
        var store = new InMemorySessionStore();

        var fetched = await store.GetAsync("not-a-real-token", CancellationToken.None);

        fetched.Should().BeNull();
    }

    [Fact]
    public async Task GetAsync_WhenSessionExpired_ShouldReturnNull()
    {
        var store = new InMemorySessionStore();
        var token = await store.CreateAsync(
            NewSession(expiresAt: DateTimeOffset.UtcNow.AddSeconds(-1)),
            CancellationToken.None);

        var fetched = await store.GetAsync(token, CancellationToken.None);

        fetched.Should().BeNull();
    }

    [Fact]
    public async Task RotateAsync_WhenSessionExists_ShouldIssueNewTokenAndInvalidateOld()
    {
        var store = new InMemorySessionStore();
        var session = new Session
        {
            Email = "e@x", Name = "E", CanEdit = true,
            CreatedAt = DateTimeOffset.UtcNow, ExpiresAt = DateTimeOffset.UtcNow.AddDays(7)
        };
        var oldToken = await store.CreateAsync(session, default);

        var newExpiry = DateTimeOffset.UtcNow.AddDays(7);
        var newToken = await store.RotateAsync(oldToken, newExpiry, default);

        newToken.Should().NotBeNull().And.NotBe(oldToken);
        (await store.GetAsync(oldToken, default)).Should().BeNull();
        var rotated = await store.GetAsync(newToken!, default);
        rotated.Should().NotBeNull();
        rotated!.Email.Should().Be("e@x");
        rotated.ExpiresAt.Should().BeCloseTo(newExpiry, TimeSpan.FromSeconds(1));
    }

    [Fact]
    public async Task RotateAsync_WhenTokenUnknown_ShouldReturnNull()
    {
        var store = new InMemorySessionStore();

        var result = await store.RotateAsync("does-not-exist", DateTimeOffset.UtcNow.AddDays(7), default);

        result.Should().BeNull();
    }

    [Fact]
    public async Task DeleteAsync_WhenCalled_ShouldRemoveSession()
    {
        var store = new InMemorySessionStore();
        var token = await store.CreateAsync(NewSession(), CancellationToken.None);

        await store.DeleteAsync(token, CancellationToken.None);
        var fetched = await store.GetAsync(token, CancellationToken.None);

        fetched.Should().BeNull();
    }

    [Fact]
    public async Task CreateAsync_WhenCalledTwice_ShouldReturnDistinctTokens()
    {
        var store = new InMemorySessionStore();

        var first = await store.CreateAsync(NewSession(), CancellationToken.None);
        var second = await store.CreateAsync(NewSession(), CancellationToken.None);

        first.Should().NotBe(second);
    }

    [Fact]
    public async Task EvictExpired_WhenSessionsExpired_ShouldRemoveThemAndReturnCount()
    {
        var store = new InMemorySessionStore();
        await store.CreateAsync(NewSession(expiresAt: DateTimeOffset.UtcNow.AddSeconds(-1)), CancellationToken.None);
        await store.CreateAsync(NewSession(expiresAt: DateTimeOffset.UtcNow.AddSeconds(-30)), CancellationToken.None);
        var liveToken = await store.CreateAsync(NewSession(), CancellationToken.None);

        var removed = store.EvictExpired();

        removed.Should().Be(2);
        (await store.GetAsync(liveToken, CancellationToken.None)).Should().NotBeNull();
    }

    [Fact]
    public async Task EvictExpired_WhenAllSessionsActive_ShouldRemoveNothing()
    {
        var store = new InMemorySessionStore();
        await store.CreateAsync(NewSession(), CancellationToken.None);
        await store.CreateAsync(NewSession(), CancellationToken.None);

        var removed = store.EvictExpired();

        removed.Should().Be(0);
    }

    [Fact]
    public async Task GetAsync_WhenSessionExpired_ShouldEvictItFromTheStore()
    {
        var store = new InMemorySessionStore();
        var token = await store.CreateAsync(
            NewSession(expiresAt: DateTimeOffset.UtcNow.AddSeconds(-1)),
            CancellationToken.None);

        // Reading an expired session returns null AND drops it, so a later sweep finds nothing.
        (await store.GetAsync(token, CancellationToken.None)).Should().BeNull();
        store.EvictExpired().Should().Be(0);
    }
}
