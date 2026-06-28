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

public sealed class AddPersonPhotoHandlerTests
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
        GivenName = new LocalizedText { En = "Anna" },
        Surname = new LocalizedText { En = "Kowalska" },
        Sex = Sex.Female,
        Vocation = Vocation.Teacher,
        Birth = new LifeEvent { Year = 1900 }
    };

    [Fact]
    public async Task Handle_WhenPortraitRole_ShouldStoreBothKeysAndAppendPortraitOverride()
    {
        var service = new Mock<IFamilyQueryService>();
        service.SetupSequence(s => s.GetPersonAsync("p-0001", It.IsAny<CancellationToken>()))
            .ReturnsAsync(NewPerson("p-0001"))
            .ReturnsAsync(NewPerson("p-0001"));
        var overrides = new Mock<IPersonOverrideStore>();
        overrides.Setup(o => o.GetLatestMediaAsync("p-0001", It.IsAny<CancellationToken>()))
            .ReturnsAsync((PersonMediaOverride?)null);
        var processor = new Mock<IImageProcessor>();
        processor.Setup(p => p.Process(It.IsAny<ReadOnlyMemory<byte>>()))
            .Returns(new ProcessedImage([1, 2, 3], [4, 5], 100, 100));
        var mediaStore = new Mock<IMediaStore>();
        var snapshot = new Mock<IFamilySnapshotProvider>();

        var handler = new AddPersonPhotoHandler(
            service.Object, overrides.Object, snapshot.Object,
            mediaStore.Object, processor.Object, BuildMapper(),
            NullLogger<AddPersonPhotoHandler>.Instance);

        var result = await handler.Handle(
            new AddPersonPhotoCommand("p-0001", PhotoRole.Portrait, [9, 9], "editor@example.com"),
            default);

        result.Should().NotBeNull();
        mediaStore.Verify(m => m.PutAsync(
            It.Is<string>(k => k.EndsWith(".webp") && !k.Contains(".thumb")),
            It.IsAny<ReadOnlyMemory<byte>>(), "image/webp", It.IsAny<CancellationToken>()), Times.Once);
        mediaStore.Verify(m => m.PutAsync(
            It.Is<string>(k => k.EndsWith(".thumb.webp")),
            It.IsAny<ReadOnlyMemory<byte>>(), "image/webp", It.IsAny<CancellationToken>()), Times.Once);
        overrides.Verify(o => o.AppendMediaAsync(
            "p-0001",
            It.Is<PersonMediaOverride>(mo => mo.Portrait != null && mo.Gallery.Count == 0),
            "editor@example.com",
            It.IsAny<CancellationToken>()), Times.Once);
        snapshot.Verify(s => s.RefreshAsync(It.IsAny<CancellationToken>()), Times.Once);
    }

    [Fact]
    public async Task Handle_WhenGalleryRole_ShouldAppendToGalleryAndLeavePortraitUnchanged()
    {
        var existingPortrait = new Photo("portid", "uploads/p-0001/portid.webp", "uploads/p-0001/portid.thumb.webp");
        var existing = new PersonMediaOverride(existingPortrait, []);

        var service = new Mock<IFamilyQueryService>();
        service.SetupSequence(s => s.GetPersonAsync("p-0001", It.IsAny<CancellationToken>()))
            .ReturnsAsync(NewPerson("p-0001"))
            .ReturnsAsync(NewPerson("p-0001"));
        var overrides = new Mock<IPersonOverrideStore>();
        overrides.Setup(o => o.GetLatestMediaAsync("p-0001", It.IsAny<CancellationToken>()))
            .ReturnsAsync(existing);
        var processor = new Mock<IImageProcessor>();
        processor.Setup(p => p.Process(It.IsAny<ReadOnlyMemory<byte>>()))
            .Returns(new ProcessedImage([1, 2, 3], [4, 5], 200, 200));
        var mediaStore = new Mock<IMediaStore>();
        var snapshot = new Mock<IFamilySnapshotProvider>();

        var handler = new AddPersonPhotoHandler(
            service.Object, overrides.Object, snapshot.Object,
            mediaStore.Object, processor.Object, BuildMapper(),
            NullLogger<AddPersonPhotoHandler>.Instance);

        var result = await handler.Handle(
            new AddPersonPhotoCommand("p-0001", PhotoRole.Gallery, [7, 8, 9], "editor@example.com"),
            default);

        result.Should().NotBeNull();
        overrides.Verify(o => o.AppendMediaAsync(
            "p-0001",
            It.Is<PersonMediaOverride>(mo =>
                mo.Portrait != null &&
                mo.Portrait.Id == "portid" &&
                mo.Gallery.Count == 1),
            "editor@example.com",
            It.IsAny<CancellationToken>()), Times.Once);
    }

    [Fact]
    public async Task Handle_WhenPersonMissing_ShouldReturnNull()
    {
        var service = new Mock<IFamilyQueryService>();
        service.Setup(s => s.GetPersonAsync("p-0001", It.IsAny<CancellationToken>()))
            .ReturnsAsync((Person?)null);
        var handler = new AddPersonPhotoHandler(
            service.Object, Mock.Of<IPersonOverrideStore>(), Mock.Of<IFamilySnapshotProvider>(),
            Mock.Of<IMediaStore>(), Mock.Of<IImageProcessor>(), BuildMapper(),
            NullLogger<AddPersonPhotoHandler>.Instance);

        var result = await handler.Handle(
            new AddPersonPhotoCommand("p-0001", PhotoRole.Gallery, [1], "editor@example.com"),
            default);

        result.Should().BeNull();
    }

    [Fact]
    public async Task Handle_WhenGalleryRole_ShouldDeduplicateByPhotoId()
    {
        // If the same content bytes are uploaded twice, the content-addressed id will collide —
        // the second upload should not add a duplicate entry to the gallery.
        var processor = new Mock<IImageProcessor>();
        // Return the same bytes so MediaKeyGenerator produces the same id.
        processor.Setup(p => p.Process(It.IsAny<ReadOnlyMemory<byte>>()))
            .Returns(new ProcessedImage([1, 2, 3], [4, 5], 100, 100));

        var (existingId, existingFull, existingThumb) = MediaKeyGenerator.ForPerson("p-0001", new byte[] { 1, 2, 3 });
        var existingPhoto = new Photo(existingId, existingFull, existingThumb);
        var existingOverride = new PersonMediaOverride(null, [existingPhoto]);

        var service = new Mock<IFamilyQueryService>();
        service.SetupSequence(s => s.GetPersonAsync("p-0001", It.IsAny<CancellationToken>()))
            .ReturnsAsync(NewPerson("p-0001"))
            .ReturnsAsync(NewPerson("p-0001"));
        var overrides = new Mock<IPersonOverrideStore>();
        overrides.Setup(o => o.GetLatestMediaAsync("p-0001", It.IsAny<CancellationToken>()))
            .ReturnsAsync(existingOverride);
        var snapshot = new Mock<IFamilySnapshotProvider>();

        var handler = new AddPersonPhotoHandler(
            service.Object, overrides.Object, snapshot.Object,
            Mock.Of<IMediaStore>(), processor.Object, BuildMapper(),
            NullLogger<AddPersonPhotoHandler>.Instance);

        await handler.Handle(
            new AddPersonPhotoCommand("p-0001", PhotoRole.Gallery, [1, 2, 3], "editor@example.com"),
            default);

        overrides.Verify(o => o.AppendMediaAsync(
            "p-0001",
            It.Is<PersonMediaOverride>(mo => mo.Gallery.Count == 1),
            "editor@example.com",
            It.IsAny<CancellationToken>()), Times.Once);
    }
}
