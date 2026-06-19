using FamilyTree.Domain;
using FamilyTree.Infrastructure;
using Microsoft.Extensions.Logging.Abstractions;
using Microsoft.Extensions.Options;

namespace FamilyTree.UnitTests.Infrastructure;

public sealed class FamilySnapshotProviderTests
{
    // A loader whose returned graph and call count the test controls.
    private sealed class StubLoader : IFamilyDataLoader
    {
        public FamilyGraph Graph { get; set; } = new([], []);
        public int LoadCount { get; private set; }

        public FamilyGraph Load()
        {
            LoadCount++;
            return Graph;
        }
    }

    private static Person Person(string id, string bioRu) =>
        new()
        {
            Id = id,
            GivenName = new LocalizedText { Ru = id, En = id },
            Surname = new LocalizedText { Ru = id, En = id },
            Birth = new LifeEvent { Year = 1900 },
            Biography = new LocalizedText { Ru = bioRu, Be = bioRu, En = bioRu }
        };

    private static (FamilySnapshotProvider provider, StubLoader loader, InMemoryPersonOverrideStore overrides, TestTimeProvider clock)
        Build(int ttlMinutes = 10)
    {
        var loader = new StubLoader { Graph = new FamilyGraph([Person("p1", "seed")], []) };
        var overrides = new InMemoryPersonOverrideStore();
        var clock = new TestTimeProvider();
        var options = Options.Create(new FamilyDataOptions { SnapshotTtlMinutes = ttlMinutes });
        var provider = new FamilySnapshotProvider(loader, overrides, options, clock, NullLogger<FamilySnapshotProvider>.Instance);
        return (provider, loader, overrides, clock);
    }

    [Fact]
    public async Task GetAsync_WhenOverrideExists_ShouldReturnMergedBiography()
    {
        var (provider, _, overrides, _) = Build();
        await overrides.AppendBiographyAsync("p1", new LocalizedText { Ru = "edited", Be = "edited", En = "edited" }, "e@x", default);

        var graph = await provider.GetAsync(default);

        graph.People.Single().Biography?.Ru.Should().Be("edited");
    }

    [Fact]
    public async Task GetAsync_WhenNoOverride_ShouldReturnSeedBiography()
    {
        var (provider, _, _, _) = Build();

        var graph = await provider.GetAsync(default);

        graph.People.Single().Biography?.Ru.Should().Be("seed");
    }

    [Fact]
    public async Task GetAsync_WhenWithinTtl_ShouldReuseCacheWithoutReloading()
    {
        var (provider, loader, _, clock) = Build(ttlMinutes: 10);

        await provider.GetAsync(default);
        clock.Advance(TimeSpan.FromMinutes(9));
        await provider.GetAsync(default);

        loader.LoadCount.Should().Be(1);
    }

    [Fact]
    public async Task GetAsync_WhenTtlElapsed_ShouldReloadFromFile()
    {
        var (provider, loader, _, clock) = Build(ttlMinutes: 10);

        await provider.GetAsync(default);
        clock.Advance(TimeSpan.FromMinutes(11));
        loader.Graph = new FamilyGraph([Person("p1", "manually-swapped")], []);
        var graph = await provider.GetAsync(default);

        loader.LoadCount.Should().Be(2);
        graph.People.Single().Biography?.Ru.Should().Be("manually-swapped");
    }

    [Fact]
    public async Task RefreshAsync_WhenCalled_ShouldRebuildImmediately()
    {
        var (provider, loader, overrides, _) = Build(ttlMinutes: 10);
        await provider.GetAsync(default);

        await overrides.AppendBiographyAsync("p1", new LocalizedText { Ru = "fresh", Be = "fresh", En = "fresh" }, "e@x", default);
        await provider.RefreshAsync(default);
        var graph = await provider.GetAsync(default);

        loader.LoadCount.Should().Be(2);
        graph.People.Single().Biography?.Ru.Should().Be("fresh");
    }
}
