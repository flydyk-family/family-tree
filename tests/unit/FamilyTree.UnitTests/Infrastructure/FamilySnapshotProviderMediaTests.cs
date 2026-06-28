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
        person.Gallery.Should().ContainSingle().Which.Id.Should().Be("h2");
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
}
