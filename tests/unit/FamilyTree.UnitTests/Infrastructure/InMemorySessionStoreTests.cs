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
    public async Task RenewAsync_WhenCalled_ShouldExtendExpiry()
    {
        var store = new InMemorySessionStore();
        var token = await store.CreateAsync(
            NewSession(expiresAt: DateTimeOffset.UtcNow.AddSeconds(-1)),
            CancellationToken.None);

        await store.RenewAsync(token, DateTimeOffset.UtcNow.AddDays(7), CancellationToken.None);
        var fetched = await store.GetAsync(token, CancellationToken.None);

        fetched.Should().NotBeNull();
        fetched!.ExpiresAt.Should().BeAfter(DateTimeOffset.UtcNow);
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
}
