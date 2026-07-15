using FamilyTree.Domain;
using FamilyTree.Infrastructure;
using FamilyTree.UnitTests;
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
        public Exception? FailWith { get; set; }

        public Task<FamilyGraph> LoadAsync(CancellationToken cancellationToken)
        {
            LoadCount++;
            if (FailWith is not null)
            {
                throw FailWith;
            }

            return Task.FromResult(Graph);
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
        Build(int ttlMinutes = 10) =>
        Build(new FamilyGraph([Person("p1", "seed")], []), ttlMinutes);

    private static (FamilySnapshotProvider provider, StubLoader loader, InMemoryPersonOverrideStore overrides, TestTimeProvider clock)
        Build(FamilyGraph seed, int ttlMinutes = 10)
    {
        var loader = new StubLoader { Graph = seed };
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

    [Fact]
    public async Task GetAsync_WhenRefreshFailsWithExistingSnapshot_ShouldServeLastGoodSnapshot()
    {
        var (provider, loader, _, clock) = Build(ttlMinutes: 10);
        var first = await provider.GetAsync(default);

        clock.Advance(TimeSpan.FromMinutes(11));
        loader.FailWith = new InvalidOperationException("gcs down");
        var second = await provider.GetAsync(default);

        second.Should().BeSameAs(first);
        loader.LoadCount.Should().Be(2); // it tried once more, then fell back
    }

    [Fact]
    public async Task GetAsync_WhenFailedRefreshBacksOff_ShouldNotReloadWithinTtl()
    {
        var (provider, loader, _, clock) = Build(ttlMinutes: 10);
        await provider.GetAsync(default);
        clock.Advance(TimeSpan.FromMinutes(11));
        loader.FailWith = new InvalidOperationException("gcs down");
        await provider.GetAsync(default); // fails → backs off, LoadCount == 2

        await provider.GetAsync(default); // within the backed-off TTL

        loader.LoadCount.Should().Be(2); // no extra attempt — no per-request hammering
    }

    [Fact]
    public async Task GetAsync_WhenInitialLoadFails_ShouldThrow()
    {
        var (provider, loader, _, _) = Build(ttlMinutes: 10);
        loader.FailWith = new InvalidOperationException("gcs down");

        var act = async () => await provider.GetAsync(default);

        await act.Should().ThrowAsync<InvalidOperationException>();
    }

    [Fact]
    public async Task GetAsync_WhenNeverFailed_ShouldReportZeroFailuresAndNotDegraded()
    {
        var (provider, _, _, _) = Build();
        await provider.GetAsync(default);

        provider.ConsecutiveRefreshFailures.Should().Be(0);
        provider.IsDataSourceDegraded.Should().BeFalse();
    }

    [Fact]
    public async Task GetAsync_WhenRefreshFailsRepeatedly_ShouldCountFailuresAndBecomeDegraded()
    {
        var (provider, loader, _, clock) = Build(ttlMinutes: 10);
        await provider.GetAsync(default);
        loader.FailWith = new InvalidOperationException("gcs down");

        for (var attempt = 0; attempt < 3; attempt++)
        {
            clock.Advance(TimeSpan.FromMinutes(11));
            await provider.GetAsync(default);
        }

        provider.ConsecutiveRefreshFailures.Should().Be(3);
        provider.IsDataSourceDegraded.Should().BeTrue();
    }

    [Fact]
    public async Task GetAsync_WhenRefreshSucceedsAfterFailures_ShouldResetFailureCount()
    {
        var (provider, loader, _, clock) = Build(ttlMinutes: 10);
        await provider.GetAsync(default);
        loader.FailWith = new InvalidOperationException("gcs down");
        clock.Advance(TimeSpan.FromMinutes(11));
        await provider.GetAsync(default);
        clock.Advance(TimeSpan.FromMinutes(11));
        await provider.GetAsync(default);
        provider.ConsecutiveRefreshFailures.Should().Be(2);

        loader.FailWith = null;
        clock.Advance(TimeSpan.FromMinutes(11));
        await provider.GetAsync(default);

        provider.ConsecutiveRefreshFailures.Should().Be(0);
        provider.IsDataSourceDegraded.Should().BeFalse();
    }

    [Fact]
    public async Task GetAsync_WhenProfileOverridesBirthYear_ShouldReflectItInMergedGraph()
    {
        var seedPerson = TestPeople.Person("p-1", birthYear: 1898);
        var (provider, _, overrides, _) = Build(new FamilyGraph([seedPerson], []));
        await overrides.AppendProfileAsync("p-1", new PersonProfileOverride { BirthYear = 1897 }, "e@x", CancellationToken.None);

        var graph = await provider.GetAsync(CancellationToken.None);

        graph.People.Single(p => p.Id == "p-1").Birth.Year.Should().Be(1897);
    }

    [Fact]
    public async Task GetAsync_WhenProfileOverridesBirthMonthAndDay_ShouldReflectItInMergedGraph()
    {
        var seedPerson = TestPeople.Person("p-1", birthYear: 1898);
        var (provider, _, overrides, _) = Build(new FamilyGraph([seedPerson], []));
        await overrides.AppendProfileAsync("p-1", new PersonProfileOverride { BirthMonth = 5, BirthDay = 3 }, "e@x", CancellationToken.None);

        var graph = await provider.GetAsync(CancellationToken.None);

        var person = graph.People.Single(p => p.Id == "p-1");
        person.Birth.Month.Should().Be(5);
        person.Birth.Day.Should().Be(3);
        person.Birth.Year.Should().Be(1898); // year still inherited from seed
    }

    [Fact]
    public async Task GetAsync_WhenProfileOverridesDeathOnPersonWithNoSeedDeath_ShouldBuildDeathEvent()
    {
        var seedPerson = TestPeople.Person("p-1", birthYear: 1898);
        var (provider, _, overrides, _) = Build(new FamilyGraph([seedPerson], []));
        await overrides.AppendProfileAsync("p-1",
            new PersonProfileOverride { DeathYear = 1980, DeathMonth = 6, DeathDay = 12 },
            "e@x", CancellationToken.None);

        var graph = await provider.GetAsync(CancellationToken.None);

        var person = graph.People.Single(p => p.Id == "p-1");
        person.Death.Should().NotBeNull();
        person.Death!.Year.Should().Be(1980);
        person.Death.Month.Should().Be(6);
        person.Death.Day.Should().Be(12);
    }

    [Fact]
    public async Task GetAsync_WhenProfileOverridesDeathMonthDayOnExistingSeedDeath_ShouldMergeOverSeed()
    {
        var seedPerson = TestPeople.Person("p-1", birthYear: 1898) with { Death = new LifeEvent { Year = 1980 } };
        var (provider, _, overrides, _) = Build(new FamilyGraph([seedPerson], []));
        await overrides.AppendProfileAsync("p-1",
            new PersonProfileOverride { DeathMonth = 6, DeathDay = 12 },
            "e@x", CancellationToken.None);

        var graph = await provider.GetAsync(CancellationToken.None);

        var person = graph.People.Single(p => p.Id == "p-1");
        person.Death.Should().NotBeNull();
        person.Death!.Year.Should().Be(1980);   // inherited from seed
        person.Death.Month.Should().Be(6);
        person.Death.Day.Should().Be(12);
    }

    [Fact]
    public async Task GetAsync_WhenProfileOverridesOneNameLocale_ShouldKeepOtherSeedLocales()
    {
        var seedPerson = TestPeople.Person("p-1", surname: new LocalizedText { Ru = "Иванов", Be = "Іваноў", En = "Ivanov" });
        var (provider, _, overrides, _) = Build(new FamilyGraph([seedPerson], []));
        await overrides.AppendProfileAsync("p-1",
            new PersonProfileOverride { Surname = new LocalizedText { Ru = "Іваноў", Be = null, En = null } },
            "e@x", CancellationToken.None);

        var merged = (await provider.GetAsync(CancellationToken.None)).People.Single(p => p.Id == "p-1");

        merged.Surname.Ru.Should().Be("Іваноў");   // overridden locale
        merged.Surname.Be.Should().Be("Іваноў");   // untouched locale falls back to seed
        merged.Surname.En.Should().Be("Ivanov");   // untouched locale falls back to seed
    }

    [Fact]
    public async Task GetAsync_WhenProfileSetsMaidenNameOnSeedWithoutOne_ShouldUseOverride()
    {
        var seedPerson = TestPeople.Person("p-1");
        var (provider, _, overrides, _) = Build(new FamilyGraph([seedPerson], []));
        await overrides.AppendProfileAsync("p-1",
            new PersonProfileOverride { MaidenName = new LocalizedText { Ru = "Петрова", Be = null, En = "Petrova" } },
            "e@x", CancellationToken.None);

        var merged = (await provider.GetAsync(CancellationToken.None)).People.Single(p => p.Id == "p-1");

        merged.MaidenName.Should().NotBeNull();
        merged.MaidenName!.Ru.Should().Be("Петрова");
        merged.MaidenName.En.Should().Be("Petrova");
    }
}
