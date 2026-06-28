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

public class SuppressSeedMediaHandlerTests
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

    [Fact]
    public async Task Handle_WhenHidingActiveSeedPortrait_ShouldAddSeedKeyToHiddenSeeds()
    {
        var service = new Mock<IFamilyQueryService>();
        service.Setup(s => s.GetPersonAsync("p-0001", It.IsAny<CancellationToken>()))
            .ReturnsAsync(NewPerson("p-0001") with { Portrait = "p-0001.jpg" }); // seed portrait active
        var overrides = new Mock<IPersonOverrideStore>();
        overrides.Setup(o => o.GetLatestMediaAsync("p-0001", It.IsAny<CancellationToken>()))
            .ReturnsAsync((PersonMediaOverride?)null);
        var snapshot = new Mock<IFamilySnapshotProvider>();

        var handler = new SuppressSeedMediaHandler(service.Object, overrides.Object, snapshot.Object,
            BuildMapper(), NullLogger<SuppressSeedMediaHandler>.Instance);
        await handler.Handle(new SuppressSeedMediaCommand("p-0001", "portrait", "e@x.com"), default);

        overrides.Verify(o => o.AppendMediaAsync("p-0001",
            It.Is<PersonMediaOverride>(mo => mo.HiddenSeeds.Count == 1 && mo.HiddenSeeds[0] == "p-0001.jpg"),
            "e@x.com", It.IsAny<CancellationToken>()), Times.Once);
    }

    [Fact]
    public async Task Handle_WhenHidingSeedVideo_ShouldAddVideoKeyToHiddenSeeds()
    {
        var service = new Mock<IFamilyQueryService>();
        service.Setup(s => s.GetPersonAsync("p-0001", It.IsAny<CancellationToken>()))
            .ReturnsAsync(NewPerson("p-0001") with { PortraitVideo = "p-0001.mp4" });
        var overrides = new Mock<IPersonOverrideStore>();
        overrides.Setup(o => o.GetLatestMediaAsync("p-0001", It.IsAny<CancellationToken>()))
            .ReturnsAsync((PersonMediaOverride?)null);

        var handler = new SuppressSeedMediaHandler(service.Object, overrides.Object,
            new Mock<IFamilySnapshotProvider>().Object, BuildMapper(),
            NullLogger<SuppressSeedMediaHandler>.Instance);
        await handler.Handle(new SuppressSeedMediaCommand("p-0001", "video", "e@x.com"), default);

        overrides.Verify(o => o.AppendMediaAsync("p-0001",
            It.Is<PersonMediaOverride>(mo => mo.HiddenSeeds.Contains("p-0001.mp4")),
            "e@x.com", It.IsAny<CancellationToken>()), Times.Once);
    }

    [Fact]
    public async Task Handle_WhenNoSuchSeed_ShouldNotAppend()
    {
        var service = new Mock<IFamilyQueryService>();
        service.Setup(s => s.GetPersonAsync("p-0001", It.IsAny<CancellationToken>()))
            .ReturnsAsync(NewPerson("p-0001") with { Portrait = "uploads/p-0001/a.webp" }); // uploaded, not seed
        var overrides = new Mock<IPersonOverrideStore>();
        overrides.Setup(o => o.GetLatestMediaAsync("p-0001", It.IsAny<CancellationToken>()))
            .ReturnsAsync((PersonMediaOverride?)null);

        var handler = new SuppressSeedMediaHandler(service.Object, overrides.Object,
            new Mock<IFamilySnapshotProvider>().Object, BuildMapper(),
            NullLogger<SuppressSeedMediaHandler>.Instance);
        await handler.Handle(new SuppressSeedMediaCommand("p-0001", "video", "e@x.com"), default);

        overrides.Verify(o => o.AppendMediaAsync(It.IsAny<string>(), It.IsAny<PersonMediaOverride>(),
            It.IsAny<string>(), It.IsAny<CancellationToken>()), Times.Never);
    }
}
