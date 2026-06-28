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

public sealed class DeletePersonPhotoHandlerTests
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
        GivenName = new LocalizedText { En = "Ivan" },
        Surname = new LocalizedText { En = "Petrov" },
        Sex = Sex.Male,
        Vocation = Vocation.Other,
        Birth = new LifeEvent { Year = 1870 }
    };

    private static readonly Photo Portrait = new("portid", "uploads/p-0002/portid.webp", "uploads/p-0002/portid.thumb.webp");
    private static readonly Photo GalleryPhoto = new("galid", "uploads/p-0002/galid.webp", "uploads/p-0002/galid.thumb.webp");

    [Fact]
    public async Task Handle_WhenPersonMissing_ShouldReturnNull()
    {
        var service = new Mock<IFamilyQueryService>();
        service.Setup(s => s.GetPersonAsync("p-0002", It.IsAny<CancellationToken>()))
            .ReturnsAsync((Person?)null);
        var handler = new DeletePersonPhotoHandler(
            service.Object, Mock.Of<IPersonOverrideStore>(), Mock.Of<IFamilySnapshotProvider>(),
            Mock.Of<IMediaStore>(), BuildMapper(), NullLogger<DeletePersonPhotoHandler>.Instance);

        var result = await handler.Handle(
            new DeletePersonPhotoCommand("p-0002", "portrait", "editor@example.com"),
            default);

        result.Should().BeNull();
    }

    [Fact]
    public async Task Handle_WhenNoMediaOverride_ShouldReturnUnchangedPersonDto()
    {
        var service = new Mock<IFamilyQueryService>();
        service.Setup(s => s.GetPersonAsync("p-0002", It.IsAny<CancellationToken>()))
            .ReturnsAsync(NewPerson("p-0002"));
        var overrides = new Mock<IPersonOverrideStore>();
        overrides.Setup(o => o.GetLatestMediaAsync("p-0002", It.IsAny<CancellationToken>()))
            .ReturnsAsync((PersonMediaOverride?)null);
        var handler = new DeletePersonPhotoHandler(
            service.Object, overrides.Object, Mock.Of<IFamilySnapshotProvider>(),
            Mock.Of<IMediaStore>(), BuildMapper(), NullLogger<DeletePersonPhotoHandler>.Instance);

        var result = await handler.Handle(
            new DeletePersonPhotoCommand("p-0002", "portrait", "editor@example.com"),
            default);

        result.Should().NotBeNull();
        overrides.Verify(o => o.AppendMediaAsync(
            It.IsAny<string>(), It.IsAny<PersonMediaOverride>(), It.IsAny<string>(), It.IsAny<CancellationToken>()),
            Times.Never);
    }

    [Fact]
    public async Task Handle_WhenTargetIsPortrait_ShouldRemovePortraitAndDeleteKeys()
    {
        var current = new PersonMediaOverride(Portrait, [GalleryPhoto]);

        var service = new Mock<IFamilyQueryService>();
        service.SetupSequence(s => s.GetPersonAsync("p-0002", It.IsAny<CancellationToken>()))
            .ReturnsAsync(NewPerson("p-0002"))
            .ReturnsAsync(NewPerson("p-0002"));
        var overrides = new Mock<IPersonOverrideStore>();
        overrides.Setup(o => o.GetLatestMediaAsync("p-0002", It.IsAny<CancellationToken>()))
            .ReturnsAsync(current);
        var mediaStore = new Mock<IMediaStore>();
        var snapshot = new Mock<IFamilySnapshotProvider>();

        var handler = new DeletePersonPhotoHandler(
            service.Object, overrides.Object, snapshot.Object,
            mediaStore.Object, BuildMapper(), NullLogger<DeletePersonPhotoHandler>.Instance);

        var result = await handler.Handle(
            new DeletePersonPhotoCommand("p-0002", "portrait", "editor@example.com"),
            default);

        result.Should().NotBeNull();
        overrides.Verify(o => o.AppendMediaAsync(
            "p-0002",
            It.Is<PersonMediaOverride>(mo => mo.Portrait == null && mo.Gallery.Count == 1),
            "editor@example.com",
            It.IsAny<CancellationToken>()), Times.Once);
        mediaStore.Verify(m => m.DeleteAsync(Portrait.Full, It.IsAny<CancellationToken>()), Times.Once);
        mediaStore.Verify(m => m.DeleteAsync(Portrait.Thumb, It.IsAny<CancellationToken>()), Times.Once);
        snapshot.Verify(s => s.RefreshAsync(It.IsAny<CancellationToken>()), Times.Once);
    }

    [Fact]
    public async Task Handle_WhenTargetIsGalleryPhotoId_ShouldRemoveItAndDeleteKeys()
    {
        var current = new PersonMediaOverride(Portrait, [GalleryPhoto]);

        var service = new Mock<IFamilyQueryService>();
        service.SetupSequence(s => s.GetPersonAsync("p-0002", It.IsAny<CancellationToken>()))
            .ReturnsAsync(NewPerson("p-0002"))
            .ReturnsAsync(NewPerson("p-0002"));
        var overrides = new Mock<IPersonOverrideStore>();
        overrides.Setup(o => o.GetLatestMediaAsync("p-0002", It.IsAny<CancellationToken>()))
            .ReturnsAsync(current);
        var mediaStore = new Mock<IMediaStore>();
        var snapshot = new Mock<IFamilySnapshotProvider>();

        var handler = new DeletePersonPhotoHandler(
            service.Object, overrides.Object, snapshot.Object,
            mediaStore.Object, BuildMapper(), NullLogger<DeletePersonPhotoHandler>.Instance);

        var result = await handler.Handle(
            new DeletePersonPhotoCommand("p-0002", "galid", "editor@example.com"),
            default);

        result.Should().NotBeNull();
        overrides.Verify(o => o.AppendMediaAsync(
            "p-0002",
            It.Is<PersonMediaOverride>(mo => mo.Portrait != null && mo.Gallery.Count == 0),
            "editor@example.com",
            It.IsAny<CancellationToken>()), Times.Once);
        mediaStore.Verify(m => m.DeleteAsync(GalleryPhoto.Full, It.IsAny<CancellationToken>()), Times.Once);
        mediaStore.Verify(m => m.DeleteAsync(GalleryPhoto.Thumb, It.IsAny<CancellationToken>()), Times.Once);
    }

    [Fact]
    public async Task Handle_WhenDeletedPhotoStillReferencedInGallery_ShouldSkipMediaDelete()
    {
        // Edge case: portrait and a gallery item share the same id — do not delete the bytes.
        var sharedPhoto = new Photo("shared", "uploads/p-0002/shared.webp", "uploads/p-0002/shared.thumb.webp");
        var current = new PersonMediaOverride(sharedPhoto, [sharedPhoto]);

        var service = new Mock<IFamilyQueryService>();
        service.SetupSequence(s => s.GetPersonAsync("p-0002", It.IsAny<CancellationToken>()))
            .ReturnsAsync(NewPerson("p-0002"))
            .ReturnsAsync(NewPerson("p-0002"));
        var overrides = new Mock<IPersonOverrideStore>();
        overrides.Setup(o => o.GetLatestMediaAsync("p-0002", It.IsAny<CancellationToken>()))
            .ReturnsAsync(current);
        var mediaStore = new Mock<IMediaStore>();
        var snapshot = new Mock<IFamilySnapshotProvider>();

        var handler = new DeletePersonPhotoHandler(
            service.Object, overrides.Object, snapshot.Object,
            mediaStore.Object, BuildMapper(), NullLogger<DeletePersonPhotoHandler>.Instance);

        // Delete the portrait — but the gallery still references the same id.
        await handler.Handle(
            new DeletePersonPhotoCommand("p-0002", "portrait", "editor@example.com"),
            default);

        mediaStore.Verify(m => m.DeleteAsync(It.IsAny<string>(), It.IsAny<CancellationToken>()), Times.Never);
    }
}
