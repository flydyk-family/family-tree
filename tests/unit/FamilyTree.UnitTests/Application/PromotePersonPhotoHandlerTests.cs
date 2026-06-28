using FamilyTree.Application.Abstractions;
using FamilyTree.Application.Dtos;
using FamilyTree.Application.Mapping;
using FamilyTree.Application.People;
using FamilyTree.Domain;
using Mapster;
using MapsterMapper;
using Microsoft.Extensions.Logging.Abstractions;
using Moq;

namespace FamilyTree.UnitTests.Application;

public sealed class PromotePersonPhotoHandlerTests
{
    private static IMapper BuildMapper()
    {
        var config = new TypeAdapterConfig();
        MappingConfig.Register(config);
        return new Mapper(config);
    }

    private static Person NewPerson(string id) => new()
    {
        Id = id,
        GivenName = new LocalizedText { En = "Maria" },
        Surname = new LocalizedText { En = "Smirnova" },
        Sex = Sex.Female,
        Vocation = Vocation.Other,
        Birth = new LifeEvent { Year = 1950 }
    };

    private static readonly Photo OldPortrait = new("oldport", "uploads/p-0003/oldport.webp", "uploads/p-0003/oldport.thumb.webp");
    private static readonly Photo GalleryA = new("gala", "uploads/p-0003/gala.webp", "uploads/p-0003/gala.thumb.webp");
    private static readonly Photo GalleryB = new("galb", "uploads/p-0003/galb.webp", "uploads/p-0003/galb.thumb.webp");

    [Fact]
    public async Task Handle_WhenPersonMissing_ShouldReturnNull()
    {
        var service = new Mock<IFamilyQueryService>();
        service.Setup(s => s.GetPersonAsync("p-0003", It.IsAny<CancellationToken>()))
            .ReturnsAsync((Person?)null);
        var handler = new PromotePersonPhotoHandler(
            service.Object, Mock.Of<IPersonOverrideStore>(), Mock.Of<IFamilySnapshotProvider>(),
            BuildMapper(), NullLogger<PromotePersonPhotoHandler>.Instance);

        var result = await handler.Handle(
            new PromotePersonPhotoCommand("p-0003", "gala", "editor@example.com"),
            default);

        result.Should().BeNull();
    }

    [Fact]
    public async Task Handle_WhenNoCurrentMediaOverride_ShouldReturnUnchangedPerson()
    {
        var service = new Mock<IFamilyQueryService>();
        service.Setup(s => s.GetPersonAsync("p-0003", It.IsAny<CancellationToken>()))
            .ReturnsAsync(NewPerson("p-0003"));
        var overrides = new Mock<IPersonOverrideStore>();
        overrides.Setup(o => o.GetLatestMediaAsync("p-0003", It.IsAny<CancellationToken>()))
            .ReturnsAsync((PersonMediaOverride?)null);
        var handler = new PromotePersonPhotoHandler(
            service.Object, overrides.Object, Mock.Of<IFamilySnapshotProvider>(),
            BuildMapper(), NullLogger<PromotePersonPhotoHandler>.Instance);

        var result = await handler.Handle(
            new PromotePersonPhotoCommand("p-0003", "gala", "editor@example.com"),
            default);

        result.Should().NotBeNull();
        overrides.Verify(o => o.AppendMediaAsync(
            It.IsAny<string>(), It.IsAny<PersonMediaOverride>(), It.IsAny<string>(), It.IsAny<CancellationToken>()),
            Times.Never);
    }

    [Fact]
    public async Task Handle_WhenPhotoIdNotInGallery_ShouldReturnUnchangedPerson()
    {
        var current = new PersonMediaOverride(OldPortrait, [GalleryA]);

        var service = new Mock<IFamilyQueryService>();
        service.Setup(s => s.GetPersonAsync("p-0003", It.IsAny<CancellationToken>()))
            .ReturnsAsync(NewPerson("p-0003"));
        var overrides = new Mock<IPersonOverrideStore>();
        overrides.Setup(o => o.GetLatestMediaAsync("p-0003", It.IsAny<CancellationToken>()))
            .ReturnsAsync(current);
        var handler = new PromotePersonPhotoHandler(
            service.Object, overrides.Object, Mock.Of<IFamilySnapshotProvider>(),
            BuildMapper(), NullLogger<PromotePersonPhotoHandler>.Instance);

        var result = await handler.Handle(
            new PromotePersonPhotoCommand("p-0003", "nonexistent", "editor@example.com"),
            default);

        result.Should().NotBeNull();
        overrides.Verify(o => o.AppendMediaAsync(
            It.IsAny<string>(), It.IsAny<PersonMediaOverride>(), It.IsAny<string>(), It.IsAny<CancellationToken>()),
            Times.Never);
    }

    [Fact]
    public async Task Handle_WhenValidPromotion_ShouldPromoteGalleryPhotoAndMoveOldPortraitToGalleryFront()
    {
        var current = new PersonMediaOverride(OldPortrait, [GalleryA, GalleryB]);
        // Merged person has the gallery visible (as served by the snapshot).
        var mergedPerson = NewPerson("p-0003") with { Gallery = [GalleryA, GalleryB] };

        var service = new Mock<IFamilyQueryService>();
        service.SetupSequence(s => s.GetPersonAsync("p-0003", It.IsAny<CancellationToken>()))
            .ReturnsAsync(mergedPerson)
            .ReturnsAsync(NewPerson("p-0003"));
        var overrides = new Mock<IPersonOverrideStore>();
        overrides.Setup(o => o.GetLatestMediaAsync("p-0003", It.IsAny<CancellationToken>()))
            .ReturnsAsync(current);
        var snapshot = new Mock<IFamilySnapshotProvider>();

        var handler = new PromotePersonPhotoHandler(
            service.Object, overrides.Object, snapshot.Object,
            BuildMapper(), NullLogger<PromotePersonPhotoHandler>.Instance);

        var result = await handler.Handle(
            new PromotePersonPhotoCommand("p-0003", "gala", "editor@example.com"),
            default);

        result.Should().NotBeNull();
        overrides.Verify(o => o.AppendMediaAsync(
            "p-0003",
            It.Is<PersonMediaOverride>(mo =>
                mo.Portrait != null &&
                mo.Portrait.Id == "gala" &&          // promoted photo is the new portrait
                mo.Gallery.Count == 2 &&              // old portrait + galb
                mo.Gallery[0].Id == "oldport" &&      // old portrait moved to gallery front
                mo.Gallery[1].Id == "galb"),          // remaining gallery item preserved
            "editor@example.com",
            It.IsAny<CancellationToken>()), Times.Once);
        snapshot.Verify(s => s.RefreshAsync(It.IsAny<CancellationToken>()), Times.Once);
    }

    [Fact]
    public async Task Handle_WhenNoExistingPortrait_ShouldPromoteWithoutAddingToGallery()
    {
        var current = new PersonMediaOverride(null, [GalleryA, GalleryB]);

        var service = new Mock<IFamilyQueryService>();
        service.SetupSequence(s => s.GetPersonAsync("p-0003", It.IsAny<CancellationToken>()))
            .ReturnsAsync(NewPerson("p-0003") with { Gallery = [GalleryA, GalleryB] })
            .ReturnsAsync(NewPerson("p-0003"));
        var overrides = new Mock<IPersonOverrideStore>();
        overrides.Setup(o => o.GetLatestMediaAsync("p-0003", It.IsAny<CancellationToken>()))
            .ReturnsAsync(current);
        var snapshot = new Mock<IFamilySnapshotProvider>();

        var handler = new PromotePersonPhotoHandler(
            service.Object, overrides.Object, snapshot.Object,
            BuildMapper(), NullLogger<PromotePersonPhotoHandler>.Instance);

        await handler.Handle(
            new PromotePersonPhotoCommand("p-0003", "galb", "editor@example.com"),
            default);

        overrides.Verify(o => o.AppendMediaAsync(
            "p-0003",
            It.Is<PersonMediaOverride>(mo =>
                mo.Portrait != null &&
                mo.Portrait.Id == "galb" &&
                mo.Gallery.Count == 1 &&         // only gala remains; no old portrait to insert
                mo.Gallery[0].Id == "gala"),
            "editor@example.com",
            It.IsAny<CancellationToken>()), Times.Once);
    }

    [Fact]
    public async Task Handle_WhenPromotingUploadedPhotoOverSeed_ShouldSetPortraitAndLeaveSeedToMerge()
    {
        var a = new Photo("a", "uploads/p-0001/a.webp", "uploads/p-0001/a.thumb.webp");
        var service = new Mock<IFamilyQueryService>();
        // Merged person: seed is the portrait, A is in the gallery (override portrait is null).
        service.Setup(s => s.GetPersonAsync("p-0001", It.IsAny<CancellationToken>()))
            .ReturnsAsync(NewPerson("p-0001") with { Portrait = "p-0001.jpg", Gallery = [a] });
        var overrides = new Mock<IPersonOverrideStore>();
        overrides.Setup(o => o.GetLatestMediaAsync("p-0001", It.IsAny<CancellationToken>()))
            .ReturnsAsync(new PersonMediaOverride(null, [a]));
        var snapshot = new Mock<IFamilySnapshotProvider>();

        var handler = new PromotePersonPhotoHandler(service.Object, overrides.Object, snapshot.Object,
            BuildMapper(), NullLogger<PromotePersonPhotoHandler>.Instance);
        await handler.Handle(new PromotePersonPhotoCommand("p-0001", "a", "e@x.com"), default);

        overrides.Verify(o => o.AppendMediaAsync("p-0001",
            It.Is<PersonMediaOverride>(mo => mo.Portrait!.Id == "a" && mo.Gallery.Count == 0),
            "e@x.com", It.IsAny<CancellationToken>()), Times.Once);
    }

    [Fact]
    public async Task Handle_WhenPromotingTheVirtualSeed_ShouldClearPortraitAndMoveUploadedToGallery()
    {
        var a = new Photo("a", "uploads/p-0001/a.webp", "uploads/p-0001/a.thumb.webp");
        var seedTile = new Photo("seed-abc", "p-0001.jpg", "p-0001.jpg");
        var service = new Mock<IFamilyQueryService>();
        // Merged person: A is the portrait, the gallery holds the virtual seed (full has no '/').
        service.Setup(s => s.GetPersonAsync("p-0001", It.IsAny<CancellationToken>()))
            .ReturnsAsync(NewPerson("p-0001") with { Portrait = "uploads/p-0001/a.webp", Gallery = [seedTile] });
        var overrides = new Mock<IPersonOverrideStore>();
        overrides.Setup(o => o.GetLatestMediaAsync("p-0001", It.IsAny<CancellationToken>()))
            .ReturnsAsync(new PersonMediaOverride(a, [])); // override portrait A, no gallery
        var snapshot = new Mock<IFamilySnapshotProvider>();

        var handler = new PromotePersonPhotoHandler(service.Object, overrides.Object, snapshot.Object,
            BuildMapper(), NullLogger<PromotePersonPhotoHandler>.Instance);
        await handler.Handle(new PromotePersonPhotoCommand("p-0001", "seed-abc", "e@x.com"), default);

        // Override portrait cleared (merge falls back to the seed); A moved into the gallery.
        overrides.Verify(o => o.AppendMediaAsync("p-0001",
            It.Is<PersonMediaOverride>(mo => mo.Portrait == null && mo.Gallery.Count == 1 && mo.Gallery[0].Id == "a"),
            "e@x.com", It.IsAny<CancellationToken>()), Times.Once);
    }
}
