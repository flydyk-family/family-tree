using FamilyTree.Domain;
using FamilyTree.Infrastructure;
using Microsoft.Extensions.Logging.Abstractions;
using Microsoft.Extensions.Options;

namespace FamilyTree.UnitTests.Infrastructure;

public sealed class FamilySnapshotRegistryTests
{
    private static readonly FamilyRegistry Registry = new(
    [
        new FamilyRegistryEntry("perovsky", "family.json", new LocalizedText(), null),
        new FamilyRegistryEntry("kowalski", "kowalski.json", new LocalizedText(), null)
    ], "perovsky");

    private static FamilySnapshotRegistry Build(StubLoaderFactory factory) =>
        new(Registry, factory, new InMemoryPersonOverrideStore(),
            Options.Create(new FamilyDataOptions()), TimeProvider.System, NullLoggerFactory.Instance);

    [Fact]
    public void For_WhenCalledTwiceForOneFamily_ShouldReturnTheSameProvider()
    {
        var registry = Build(new StubLoaderFactory());

        registry.For("perovsky").Should().BeSameAs(registry.For("perovsky"));
    }

    [Fact]
    public async Task For_WhenTwoFamiliesAreRequested_ShouldLoadEachFromItsOwnSource()
    {
        var registry = Build(new StubLoaderFactory());

        var a = await registry.For("perovsky").GetAsync(CancellationToken.None);
        var b = await registry.For("kowalski").GetAsync(CancellationToken.None);

        a.People.Single().Summary!.En.Should().Be("family.json");
        b.People.Single().Summary!.En.Should().Be("kowalski.json");
    }

    [Fact]
    public void For_WhenFamilyIsNotRegistered_ShouldThrowUnknownFamily()
    {
        var act = () => Build(new StubLoaderFactory()).For("nowak");

        act.Should().Throw<UnknownFamilyException>().Which.FamilyId.Should().Be("nowak");
    }

    [Fact]
    public async Task For_WhenOneFamilySourceFails_ShouldStillServeTheOther()
    {
        var registry = Build(new StubLoaderFactory { FailingSource = "kowalski.json" });

        var failing = async () => await registry.For("kowalski").GetAsync(CancellationToken.None);
        await failing.Should().ThrowAsync<InvalidOperationException>();

        (await registry.For("perovsky").GetAsync(CancellationToken.None)).People.Should().ContainSingle();
    }

    [Fact]
    public async Task For_WhenAFamilyIsBuilt_ShouldReadOnlyItsOwnOverrides()
    {
        var store = new InMemoryPersonOverrideStore();
        await new FamilyScopedOverrideStore(store, Registry, "kowalski")
            .AppendBiographyAsync("p-1", new LocalizedText { En = "k-bio" }, "e", CancellationToken.None);
        var registry = new FamilySnapshotRegistry(Registry, new StubLoaderFactory(), store,
            Options.Create(new FamilyDataOptions()), TimeProvider.System, NullLoggerFactory.Instance);

        (await registry.For("kowalski").GetAsync(CancellationToken.None)).People.Single().Biography!.En.Should().Be("k-bio");
        (await registry.For("perovsky").GetAsync(CancellationToken.None)).People.Single().Biography.Should().BeNull();
    }

    [Fact]
    public async Task DegradedFamilies_WhenOneFamilyKeepsFailingToRefresh_ShouldListOnlyThatFamily()
    {
        var registry = Build(new StubLoaderFactory { FailAfterFirstLoad = "kowalski.json" });
        await registry.For("perovsky").GetAsync(CancellationToken.None);
        var kowalski = registry.For("kowalski");
        await kowalski.GetAsync(CancellationToken.None);

        for (var attempt = 0; attempt < 3; attempt++)
        {
            await kowalski.RefreshAsync(CancellationToken.None);
        }

        registry.DegradedFamilies.Should().Equal("kowalski");
        registry.HealthFor("kowalski").IsDataSourceDegraded.Should().BeTrue();
        registry.HealthFor("perovsky").IsDataSourceDegraded.Should().BeFalse();
    }

    private sealed class StubLoaderFactory : IFamilyDataLoaderFactory
    {
        public string? FailingSource { get; init; }
        public string? FailAfterFirstLoad { get; init; }

        public IFamilyDataLoader Create(string source) =>
            new StubLoader(source, source == FailingSource, source == FailAfterFirstLoad);
    }

    private sealed class StubLoader : IFamilyDataLoader
    {
        private readonly string _source;
        private readonly bool _fails;
        private readonly bool _failsAfterFirstLoad;
        private bool _loaded;

        public StubLoader(string source, bool fails, bool failsAfterFirstLoad = false)
        {
            _source = source;
            _fails = fails;
            _failsAfterFirstLoad = failsAfterFirstLoad;
        }

        public Task<FamilyGraph> LoadAsync(CancellationToken cancellationToken)
        {
            if (_fails || (_failsAfterFirstLoad && _loaded))
            {
                return Task.FromException<FamilyGraph>(new InvalidOperationException("source down"));
            }

            _loaded = true;
            return Task.FromResult(new FamilyGraph(
                [new Person
                {
                    Id = "p-1",
                    GivenName = new LocalizedText { En = "A" },
                    Surname = new LocalizedText { En = "B" },
                    Birth = new LifeEvent { Year = 1900 },
                    Summary = new LocalizedText { En = _source }
                }], []));
        }
    }
}
