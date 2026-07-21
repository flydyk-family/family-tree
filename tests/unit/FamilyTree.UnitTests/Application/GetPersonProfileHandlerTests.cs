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

public sealed class GetPersonProfileHandlerTests
{
    private static IMapper Mapper()
    {
        var config = new TypeAdapterConfig();
        MappingConfig.Register(config);
        return new Mapper(config);
    }

    [Fact]
    public async Task Handle_WhenPersonMissing_ShouldReturnNull()
    {
        var service = new Mock<IFamilyQueryService>();
        service.Setup(s => s.GetPersonAsync("p-9", It.IsAny<CancellationToken>())).ReturnsAsync((Person?)null);
        var store = new Mock<IPersonOverrideStore>();
        var handler = new GetPersonProfileHandler(service.Object, store.Object, Mapper());

        var result = await handler.Handle(new GetPersonProfileQuery("p-9"), CancellationToken.None);

        result.Should().BeNull();
    }

    [Fact]
    public async Task Handle_WhenOverrideExists_ShouldReturnIt()
    {
        var service = new Mock<IFamilyQueryService>();
        service.Setup(s => s.GetPersonAsync("p-1", It.IsAny<CancellationToken>())).ReturnsAsync(TestPeople.Person("p-1"));
        var store = new Mock<IPersonOverrideStore>();
        store.Setup(s => s.GetLatestProfileAsync("p-1", It.IsAny<CancellationToken>()))
             .ReturnsAsync(new PersonProfileOverride { BirthYear = 1897 });
        var handler = new GetPersonProfileHandler(service.Object, store.Object, Mapper());

        var result = await handler.Handle(new GetPersonProfileQuery("p-1"), CancellationToken.None);

        result!.BirthYear.Should().Be(1897);
    }

    [Fact]
    public async Task Handle_WhenPersonExistsButNoOverride_ShouldReturnEmptyDto()
    {
        var service = new Mock<IFamilyQueryService>();
        service.Setup(s => s.GetPersonAsync("p-1", It.IsAny<CancellationToken>())).ReturnsAsync(TestPeople.Person("p-1"));
        var store = new Mock<IPersonOverrideStore>();
        store.Setup(s => s.GetLatestProfileAsync("p-1", It.IsAny<CancellationToken>()))
             .ReturnsAsync((PersonProfileOverride?)null);
        var handler = new GetPersonProfileHandler(service.Object, store.Object, Mapper());

        var result = await handler.Handle(new GetPersonProfileQuery("p-1"), CancellationToken.None);

        result.Should().NotBeNull();
        result!.GivenName.Should().BeNull();
        result.Surname.Should().BeNull();
        result.Sex.Should().BeNull();
        result.BirthYear.Should().BeNull();
        result.DeathYear.Should().BeNull();
        result.Vocation.Should().BeNull();
        result.MaidenName.Should().BeNull();
        result.MiddleName.Should().BeNull();
    }
}
