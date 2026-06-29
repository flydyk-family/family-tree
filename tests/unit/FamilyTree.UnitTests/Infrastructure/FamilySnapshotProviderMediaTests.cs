using FamilyTree.Domain;
using FamilyTree.Infrastructure;
using Microsoft.Extensions.Logging.Abstractions;
using Microsoft.Extensions.Options;
using Moq;

namespace FamilyTree.UnitTests.Infrastructure;

public sealed class FamilySnapshotProviderMediaTests
{
    private static Person Seed(string id) => new()
    {
        Id = id,
        GivenName = new LocalizedText { En = "A" },
        Surname = new LocalizedText { En = "B" },
        Birth = new LifeEvent(),
        Portrait = "p-0001.jpg"
    };

    [Fact]
    public async Task GetAsync_WhenMediaOverrideExists_ShouldReplacePortraitAndGallery()
    {
        var loader = new Mock<IFamilyDataLoader>();
        loader.Setup(l => l.LoadAsync(It.IsAny<CancellationToken>()))
            .ReturnsAsync(new FamilyGraph([Seed("p-0001")], []));

        var overrides = new Mock<IPersonOverrideStore>();
        overrides.Setup(o => o.GetLatestBiographiesAsync(It.IsAny<CancellationToken>()))
            .ReturnsAsync(new Dictionary<string, LocalizedText>());
        var portrait = new Photo("h1", "uploads/p-0001/h1.webp", "uploads/p-0001/h1.thumb.webp");
        var gallery = new[] { new Photo("h2", "uploads/p-0001/h2.webp", "uploads/p-0001/h2.thumb.webp") };
        overrides.Setup(o => o.GetLatestMediaMapAsync(It.IsAny<CancellationToken>()))
            .ReturnsAsync(new Dictionary<string, PersonMediaOverride> { ["p-0001"] = new(portrait, gallery) });

        var provider = new FamilySnapshotProvider(loader.Object, overrides.Object,
            Options.Create(new FamilyDataOptions { SnapshotTtlMinutes = 10 }),
            TimeProvider.System, NullLogger<FamilySnapshotProvider>.Instance);

        var graph = await provider.GetAsync(default);

        var person = graph.People.Single();
        person.Portrait.Should().Be("uploads/p-0001/h1.webp");
        person.PortraitThumb.Should().Be("uploads/p-0001/h1.thumb.webp");
        person.Gallery.Should().HaveCount(2);
        person.Gallery[0].Id.Should().Be("h2");                   // real gallery photo
        person.Gallery[1].Full.Should().Be("p-0001.jpg");         // virtual seed tile appended
    }

    [Fact]
    public async Task GetAsync_WhenMediaOverrideHasNoPortrait_ShouldKeepSeedPortrait()
    {
        var loader = new Mock<IFamilyDataLoader>();
        loader.Setup(l => l.LoadAsync(It.IsAny<CancellationToken>()))
            .ReturnsAsync(new FamilyGraph([Seed("p-0001")], []));
        var overrides = new Mock<IPersonOverrideStore>();
        overrides.Setup(o => o.GetLatestBiographiesAsync(It.IsAny<CancellationToken>()))
            .ReturnsAsync(new Dictionary<string, LocalizedText>());
        var gallery = new[] { new Photo("h2", "uploads/p-0001/h2.webp", "uploads/p-0001/h2.thumb.webp") };
        overrides.Setup(o => o.GetLatestMediaMapAsync(It.IsAny<CancellationToken>()))
            .ReturnsAsync(new Dictionary<string, PersonMediaOverride> { ["p-0001"] = new(null, gallery) });

        var provider = new FamilySnapshotProvider(loader.Object, overrides.Object,
            Options.Create(new FamilyDataOptions { SnapshotTtlMinutes = 10 }),
            TimeProvider.System, NullLogger<FamilySnapshotProvider>.Instance);

        var person = (await provider.GetAsync(default)).People.Single();
        person.Portrait.Should().Be("p-0001.jpg");
        person.PortraitThumb.Should().BeNull();
        person.Gallery.Should().ContainSingle();
    }

    [Fact]
    public async Task GetAsync_WhenOverridePortraitDisplacesSeed_ShouldSurfaceSeedAsVirtualGalleryTile()
    {
        var loader = new Mock<IFamilyDataLoader>();
        loader.Setup(l => l.LoadAsync(It.IsAny<CancellationToken>()))
            .ReturnsAsync(new FamilyGraph([Seed("p-0001") with { Portrait = "p-0001.jpg" }], []));
        var overrides = new Mock<IPersonOverrideStore>();
        overrides.Setup(o => o.GetLatestBiographiesAsync(It.IsAny<CancellationToken>()))
            .ReturnsAsync(new Dictionary<string, LocalizedText>());
        var portrait = new Photo("h1", "uploads/p-0001/h1.webp", "uploads/p-0001/h1.thumb.webp");
        overrides.Setup(o => o.GetLatestMediaMapAsync(It.IsAny<CancellationToken>()))
            .ReturnsAsync(new Dictionary<string, PersonMediaOverride> { ["p-0001"] = new(portrait, []) });

        var provider = new FamilySnapshotProvider(loader.Object, overrides.Object,
            Options.Create(new FamilyDataOptions { SnapshotTtlMinutes = 10 }),
            TimeProvider.System, NullLogger<FamilySnapshotProvider>.Instance);
        var person = (await provider.GetAsync(default)).People.Single();

        person.Portrait.Should().Be("uploads/p-0001/h1.webp");
        person.Gallery.Should().ContainSingle();
        person.Gallery[0].Full.Should().Be("p-0001.jpg");          // seed surfaced
        person.Gallery[0].Id.Should().NotBeNullOrEmpty();           // stable synthetic id
    }

    [Fact]
    public async Task GetAsync_WhenSeedIsStillTheEffectivePortrait_ShouldNotAppendVirtualSeed()
    {
        var loader = new Mock<IFamilyDataLoader>();
        loader.Setup(l => l.LoadAsync(It.IsAny<CancellationToken>()))
            .ReturnsAsync(new FamilyGraph([Seed("p-0001") with { Portrait = "p-0001.jpg" }], []));
        var overrides = new Mock<IPersonOverrideStore>();
        overrides.Setup(o => o.GetLatestBiographiesAsync(It.IsAny<CancellationToken>()))
            .ReturnsAsync(new Dictionary<string, LocalizedText>());
        var b = new Photo("b", "uploads/p-0001/b.webp", "uploads/p-0001/b.thumb.webp");
        overrides.Setup(o => o.GetLatestMediaMapAsync(It.IsAny<CancellationToken>()))
            .ReturnsAsync(new Dictionary<string, PersonMediaOverride> { ["p-0001"] = new(null, [b]) }); // portrait override null

        var provider = new FamilySnapshotProvider(loader.Object, overrides.Object,
            Options.Create(new FamilyDataOptions { SnapshotTtlMinutes = 10 }),
            TimeProvider.System, NullLogger<FamilySnapshotProvider>.Instance);
        var person = (await provider.GetAsync(default)).People.Single();

        person.Portrait.Should().Be("p-0001.jpg");       // seed is still the portrait
        person.Gallery.Should().ContainSingle().Which.Id.Should().Be("b"); // only the uploaded photo, no virtual seed
    }

    private static FamilySnapshotProvider NewProvider(Mock<IFamilyDataLoader> loader, Mock<IPersonOverrideStore> overrides) =>
        new(loader.Object, overrides.Object,
            Options.Create(new FamilyDataOptions { SnapshotTtlMinutes = 10 }),
            TimeProvider.System, NullLogger<FamilySnapshotProvider>.Instance);

    [Fact]
    public async Task GetAsync_WhenSeedPortraitHidden_ShouldFallBackToNoPortrait()
    {
        var loader = new Mock<IFamilyDataLoader>();
        loader.Setup(l => l.LoadAsync(It.IsAny<CancellationToken>()))
            .ReturnsAsync(new FamilyGraph([Seed("p-0001") with { Portrait = "p-0001.jpg" }], []));
        var overrides = new Mock<IPersonOverrideStore>();
        overrides.Setup(o => o.GetLatestBiographiesAsync(It.IsAny<CancellationToken>()))
            .ReturnsAsync(new Dictionary<string, LocalizedText>());
        overrides.Setup(o => o.GetLatestMediaMapAsync(It.IsAny<CancellationToken>()))
            .ReturnsAsync(new Dictionary<string, PersonMediaOverride>
            {
                ["p-0001"] = new(null, []) { HiddenSeeds = ["p-0001.jpg"] }
            });

        var provider = NewProvider(loader, overrides);
        var person = (await provider.GetAsync(default)).People.Single();

        person.Portrait.Should().BeNull();          // hidden seed → initials
        person.Gallery.Should().BeEmpty();          // no virtual seed tile
    }

    [Fact]
    public async Task GetAsync_WhenSeedVideoHidden_ShouldClearPortraitVideo()
    {
        var loader = new Mock<IFamilyDataLoader>();
        loader.Setup(l => l.LoadAsync(It.IsAny<CancellationToken>()))
            .ReturnsAsync(new FamilyGraph(
                [Seed("p-0001") with { Portrait = "p-0001.jpg", PortraitVideo = "p-0001.mp4" }], []));
        var overrides = new Mock<IPersonOverrideStore>();
        overrides.Setup(o => o.GetLatestBiographiesAsync(It.IsAny<CancellationToken>()))
            .ReturnsAsync(new Dictionary<string, LocalizedText>());
        overrides.Setup(o => o.GetLatestMediaMapAsync(It.IsAny<CancellationToken>()))
            .ReturnsAsync(new Dictionary<string, PersonMediaOverride>
            {
                ["p-0001"] = new(null, []) { HiddenSeeds = ["p-0001.mp4"] }
            });

        var provider = NewProvider(loader, overrides);
        var person = (await provider.GetAsync(default)).People.Single();

        person.PortraitVideo.Should().BeNull();     // hidden seed video dropped
        person.Portrait.Should().Be("p-0001.jpg");  // portrait seed untouched
    }
}
