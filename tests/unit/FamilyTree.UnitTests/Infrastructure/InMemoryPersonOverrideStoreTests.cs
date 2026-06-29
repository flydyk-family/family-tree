using FamilyTree.Domain;
using FamilyTree.Infrastructure;

namespace FamilyTree.UnitTests.Infrastructure;

public sealed class InMemoryPersonOverrideStoreTests
{
    private static LocalizedText Bio(string en) => new() { En = en };

    [Fact]
    public async Task GetLatestBiographyAsync_WhenNoOverride_ShouldReturnNull()
    {
        var store = new InMemoryPersonOverrideStore();

        var latest = await store.GetLatestBiographyAsync("p-0001", CancellationToken.None);

        latest.Should().BeNull();
    }

    [Fact]
    public async Task AppendBiographyAsync_WhenCalledOnce_ShouldExposeItAsLatest()
    {
        var store = new InMemoryPersonOverrideStore();

        await store.AppendBiographyAsync("p-0001", Bio("first"), "editor@example.com", CancellationToken.None);
        var latest = await store.GetLatestBiographyAsync("p-0001", CancellationToken.None);

        latest.Should().NotBeNull();
        latest!.En.Should().Be("first");
    }

    [Fact]
    public async Task AppendBiographyAsync_WhenCalledTwice_ShouldExposeTheLastAsLatest()
    {
        var store = new InMemoryPersonOverrideStore();

        await store.AppendBiographyAsync("p-0001", Bio("first"), "editor@example.com", CancellationToken.None);
        await store.AppendBiographyAsync("p-0001", Bio("second"), "editor@example.com", CancellationToken.None);
        var latest = await store.GetLatestBiographyAsync("p-0001", CancellationToken.None);

        latest!.En.Should().Be("second");
    }

    [Fact]
    public async Task GetLatestBiographiesAsync_WhenMultiplePeopleOverridden_ShouldReturnLatestForEach()
    {
        var store = new InMemoryPersonOverrideStore();
        await store.AppendBiographyAsync("p-0001", Bio("a1"), "editor@example.com", CancellationToken.None);
        await store.AppendBiographyAsync("p-0001", Bio("a2"), "editor@example.com", CancellationToken.None);
        await store.AppendBiographyAsync("p-0002", Bio("b1"), "editor@example.com", CancellationToken.None);

        var all = await store.GetLatestBiographiesAsync(CancellationToken.None);

        all.Should().HaveCount(2);
        all["p-0001"].En.Should().Be("a2");
        all["p-0002"].En.Should().Be("b1");
    }

    [Fact]
    public async Task AppendMediaAsync_WhenHiddenSeedsSet_ShouldRoundTripHiddenSeeds()
    {
        var store = new InMemoryPersonOverrideStore();
        var media = new PersonMediaOverride(null, []) { HiddenSeeds = ["p-0001.jpg"] };

        await store.AppendMediaAsync("p-0001", media, "e@x.com", default);
        var latest = await store.GetLatestMediaAsync("p-0001", default);

        latest!.HiddenSeeds.Should().ContainSingle().Which.Should().Be("p-0001.jpg");
    }
}
