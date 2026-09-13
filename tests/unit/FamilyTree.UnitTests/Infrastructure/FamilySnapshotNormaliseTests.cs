using FamilyTree.Domain;
using FamilyTree.Infrastructure;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Logging.Abstractions;
using Microsoft.Extensions.Options;
using Moq;

namespace FamilyTree.UnitTests.Infrastructure;

public sealed class FamilySnapshotNormaliseTests
{
    private static readonly FamilyRegistry Registry = new(
    [
        new FamilyRegistryEntry("perovsky", "family.json", new LocalizedText(), null),
        new FamilyRegistryEntry("kowalski", "kowalski.json", new LocalizedText(), null)
    ], "perovsky");

    private static async Task<Person> BuildOne(Person seedPerson, string familyId)
    {
        var loader = new Mock<IFamilyDataLoader>();
        loader.Setup(l => l.LoadAsync(It.IsAny<CancellationToken>())).ReturnsAsync(new FamilyGraph([seedPerson], []));
        var provider = new FamilySnapshotProvider(
            loader.Object, new InMemoryPersonOverrideStore(), Options.Create(new FamilyDataOptions()),
            TimeProvider.System, Registry, familyId, NullLogger<FamilySnapshotProvider>.Instance);

        return (await provider.GetAsync(CancellationToken.None)).People.Single();
    }

    private static Person Seed(string? portrait = null, IReadOnlyList<FamilyLink>? links = null) => new()
    {
        Id = "p-1",
        GivenName = new LocalizedText { En = "A" },
        Surname = new LocalizedText { En = "B" },
        Birth = new LifeEvent { Year = 1900 },
        Portrait = portrait,
        PortraitVideo = portrait is null ? null : "p-1.mp4",
        Gallery = portrait is null ? [] : [new Photo("g1", "g1.jpg", "g1.thumb.jpg")],
        FamilyLinks = links ?? []
    };

    [Fact]
    public async Task GetAsync_WhenFamilyIsNotTheDefault_ShouldExpandEveryBareSeedReference()
    {
        var person = await BuildOne(Seed("p-1.jpg"), "kowalski");

        person.Portrait.Should().Be("portraits/kowalski/p-1.jpg");
        person.PortraitVideo.Should().Be("portraits/kowalski/p-1.mp4");
        person.Gallery.Single().Full.Should().Be("portraits/kowalski/g1.jpg");
        person.Gallery.Single().Thumb.Should().Be("portraits/kowalski/g1.thumb.jpg");
    }

    [Fact]
    public async Task GetAsync_WhenFamilyIsTheDefault_ShouldLeaveSeedReferencesBare() =>
        (await BuildOne(Seed("p-1.jpg"), "perovsky")).Portrait.Should().Be("p-1.jpg");

    [Fact]
    public async Task GetAsync_WhenALinkNamesAnUnregisteredFamily_ShouldDropOnlyThatLink()
    {
        var person = await BuildOne(Seed(links:
        [
            new FamilyLink("kowalski", "p-42", FamilyLinkRelation.Origin),
            new FamilyLink("nowak", null, FamilyLinkRelation.Joined)
        ]), "perovsky");

        person.FamilyLinks.Should().ContainSingle().Which.Family.Should().Be("kowalski");
    }

    [Fact]
    public async Task GetAsync_WhenALinkHasNoCounterpart_ShouldKeepIt() =>
        (await BuildOne(Seed(links: [new FamilyLink("kowalski", null, FamilyLinkRelation.Joined)]), "perovsky"))
            .FamilyLinks.Should().ContainSingle().Which.PersonId.Should().BeNull();

    private static readonly string NullCollectionsJson = """
    { "people": [
        { "id": "p-1", "givenName": { "en": "A" }, "surname": { "en": "B" },
          "birth": { "year": 1900 }, "gallery": null, "familyLinks": null },
        { "id": "p-2", "givenName": { "en": "C" }, "surname": { "en": "D" },
          "birth": { "year": 1901 },
          "gallery": [ { "id": "g1", "full": "g1.jpg", "thumb": null } ] }
      ], "unions": [] }
    """;

    private static async Task<IReadOnlyList<Person>> BuildAll(FamilyGraph seed, string familyId)
    {
        var loader = new Mock<IFamilyDataLoader>();
        loader.Setup(l => l.LoadAsync(It.IsAny<CancellationToken>())).ReturnsAsync(seed);
        var provider = new FamilySnapshotProvider(
            loader.Object, new InMemoryPersonOverrideStore(), Options.Create(new FamilyDataOptions()),
            TimeProvider.System, Registry, familyId, NullLogger<FamilySnapshotProvider>.Instance);

        return (await provider.GetAsync(CancellationToken.None)).People;
    }

    [Fact]
    public async Task GetAsync_WhenDefaultSeedHasNullCollections_ShouldBuildUnchanged()
    {
        var seed = JsonFamilyDataLoader.Deserialize(NullCollectionsJson);

        var people = await BuildAll(seed, "perovsky");

        var first = people.Single(p => p.Id == "p-1");
        first.Gallery.Should().BeEmpty();
        first.FamilyLinks.Should().BeEmpty();

        var second = people.Single(p => p.Id == "p-2");
        second.Gallery.Single().Full.Should().Be("g1.jpg");
        second.Gallery.Single().Thumb.Should().BeNull();
    }

    [Fact]
    public async Task GetAsync_WhenNonDefaultSeedHasNullCollections_ShouldBuildUnchanged()
    {
        var seed = JsonFamilyDataLoader.Deserialize(NullCollectionsJson);

        var people = await BuildAll(seed, "kowalski");

        people.Should().HaveCount(2);
    }
    [Theory]
    [InlineData("p-")]
    [InlineData("k-0001")]
    [InlineData("p-12a")]
    public async Task GetAsync_WhenSeedIdIsNotPDigits_ShouldLogAWarning(string id)
    {
        var logger = new CapturingLogger();
        var loader = new Mock<IFamilyDataLoader>();
        loader.Setup(l => l.LoadAsync(It.IsAny<CancellationToken>()))
            .ReturnsAsync(new FamilyGraph([Seed() with { Id = id }], []));
        var provider = new FamilySnapshotProvider(
            loader.Object, new InMemoryPersonOverrideStore(), Options.Create(new FamilyDataOptions()),
            TimeProvider.System, Registry, "perovsky", logger);

        await provider.GetAsync(CancellationToken.None);

        logger.Levels.Should().Contain(LogLevel.Warning);
    }

    [Fact]
    public async Task GetAsync_WhenSeedIdIsPDigits_ShouldNotLogAWarning()
    {
        var logger = new CapturingLogger();
        var loader = new Mock<IFamilyDataLoader>();
        loader.Setup(l => l.LoadAsync(It.IsAny<CancellationToken>()))
            .ReturnsAsync(new FamilyGraph([Seed()], []));
        var provider = new FamilySnapshotProvider(
            loader.Object, new InMemoryPersonOverrideStore(), Options.Create(new FamilyDataOptions()),
            TimeProvider.System, Registry, "perovsky", logger);

        await provider.GetAsync(CancellationToken.None);

        logger.Levels.Should().NotContain(LogLevel.Warning);
    }

    private sealed class CapturingLogger : ILogger<FamilySnapshotProvider>
    {
        public List<LogLevel> Levels { get; } = [];

        public IDisposable? BeginScope<TState>(TState state) where TState : notnull => null;

        public bool IsEnabled(LogLevel logLevel) => true;

        public void Log<TState>(LogLevel logLevel, EventId eventId, TState state, Exception? exception,
            Func<TState, Exception?, string> formatter) => Levels.Add(logLevel);
    }
}
