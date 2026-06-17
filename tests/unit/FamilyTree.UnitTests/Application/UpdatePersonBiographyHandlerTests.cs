using FamilyTree.Application.Abstractions;
using FamilyTree.Application.Dtos;
using FamilyTree.Application.Mapping;
using FamilyTree.Application.People;
using FamilyTree.Domain;
using Mapster;
using MapsterMapper;
using Moq;

namespace FamilyTree.UnitTests.Application;

public sealed class UpdatePersonBiographyHandlerTests
{
    private static IMapper BuildMapper()
    {
        var config = new TypeAdapterConfig();
        MappingConfig.Register(config);
        return new Mapper(config);
    }

    private static Person NewPerson(string id, LocalizedText? biography = null) => new()
    {
        Id = id,
        GivenName = new LocalizedText { En = "Anna" },
        Surname = new LocalizedText { En = "Kowalska" },
        Sex = Sex.Female,
        Vocation = Vocation.Teacher,
        Birth = new LifeEvent { Year = 1842 },
        Biography = biography
    };

    [Fact]
    public async Task Handle_WhenPersonExists_ShouldAppendAndReturnMergedDto()
    {
        var service = new Mock<IFamilyQueryService>();
        var overrides = new Mock<IPersonOverrideStore>();
        service.SetupSequence(s => s.GetPersonAsync("p-0001", It.IsAny<CancellationToken>()))
            .ReturnsAsync(NewPerson("p-0001"))
            .ReturnsAsync(NewPerson("p-0001", new LocalizedText { En = "new bio" }));
        var handler = new UpdatePersonBiographyHandler(service.Object, overrides.Object, BuildMapper());

        var result = await handler.Handle(
            new UpdatePersonBiographyCommand("p-0001", new LocalizedTextDto(null, null, "new bio"), "editor@example.com"),
            CancellationToken.None);

        result.Should().NotBeNull();
        result!.Biography!.En.Should().Be("new bio");
        overrides.Verify(o => o.AppendBiographyAsync(
            "p-0001",
            It.Is<LocalizedText>(b => b.En == "new bio"),
            "editor@example.com",
            It.IsAny<CancellationToken>()), Times.Once);
    }

    [Fact]
    public async Task Handle_WhenPersonMissing_ShouldReturnNullAndNotAppend()
    {
        var service = new Mock<IFamilyQueryService>();
        service.Setup(s => s.GetPersonAsync("p-9999", It.IsAny<CancellationToken>()))
            .ReturnsAsync((Person?)null);
        var overrides = new Mock<IPersonOverrideStore>();
        var handler = new UpdatePersonBiographyHandler(service.Object, overrides.Object, BuildMapper());

        var result = await handler.Handle(
            new UpdatePersonBiographyCommand("p-9999", new LocalizedTextDto(null, null, "x"), "editor@example.com"),
            CancellationToken.None);

        result.Should().BeNull();
        overrides.Verify(o => o.AppendBiographyAsync(
            It.IsAny<string>(), It.IsAny<LocalizedText>(), It.IsAny<string>(), It.IsAny<CancellationToken>()),
            Times.Never);
    }
}
