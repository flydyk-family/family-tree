using FamilyTree.Domain;
using FamilyTree.Infrastructure;

namespace FamilyTree.UnitTests.Infrastructure;

public sealed class InMemoryPersonOverrideStoreMediaTests
{
    private static Photo Make(string id) => new(id, $"uploads/p-0001/{id}.webp", $"uploads/p-0001/{id}.thumb.webp");

    [Fact]
    public async Task GetLatestMediaAsync_WhenAppended_ShouldReturnLatestOverride()
    {
        var store = new InMemoryPersonOverrideStore();
        await store.AppendMediaAsync("p-0001", new PersonMediaOverride(Make("a"), [Make("b")]), "e@x.com", default);
        await store.AppendMediaAsync("p-0001", new PersonMediaOverride(Make("a"), [Make("b"), Make("c")]), "e@x.com", default);

        var latest = await store.GetLatestMediaAsync("p-0001", default);

        latest!.Gallery.Should().HaveCount(2);
        latest.Portrait!.Id.Should().Be("a");
    }

    [Fact]
    public async Task GetLatestMediaAsync_WhenNoOverride_ShouldReturnNull()
    {
        var store = new InMemoryPersonOverrideStore();
        (await store.GetLatestMediaAsync("p-0001", default)).Should().BeNull();
    }

    [Fact]
    public async Task GetLatestMediaMapAsync_WhenMultiplePeople_ShouldReturnEachLatest()
    {
        var store = new InMemoryPersonOverrideStore();
        await store.AppendMediaAsync("p-0001", new PersonMediaOverride(Make("a"), []), "e@x.com", default);
        await store.AppendMediaAsync("p-0002", new PersonMediaOverride(null, [Make("b")]), "e@x.com", default);

        var map = await store.GetLatestMediaMapAsync(default);

        map.Should().HaveCount(2);
        map["p-0002"].Portrait.Should().BeNull();
    }
}
