using FamilyTree.Domain;
using FamilyTree.Infrastructure;
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
            TimeProvider.System, NullLogger<FamilySnapshotProvider>.Instance, Registry, familyId);

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
}
