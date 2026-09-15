using FamilyTree.Application.Abstractions;
using FamilyTree.Application.Families;
using FamilyTree.Application.Family;
using FamilyTree.Application.Mapping;
using FamilyTree.Application.People;
using FamilyTree.Domain;
using Mapster;
using MapsterMapper;
using Moq;

namespace FamilyTree.UnitTests.Application;

public sealed class HandlerTests
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
        GivenName = new LocalizedText { Ru = "Анна", En = "Anna" },
        Surname = new LocalizedText { Ru = "Ковальская", En = "Kowalska" },
        Sex = Sex.Female,
        Vocation = Vocation.Teacher,
        Birth = new LifeEvent { Year = 1842 }
    };

    [Fact]
    public async Task Handle_WhenGetAllPeople_ShouldReturnMappedSummaries()
    {
        var service = new Mock<IFamilyQueryService>();
        service.Setup(s => s.GetAllPeopleAsync(It.IsAny<CancellationToken>()))
            .ReturnsAsync(new List<Person> { NewPerson("p-0001") });
        var handler = new GetAllPeopleHandler(service.Object, BuildMapper());

        var result = await handler.Handle(new GetAllPeopleQuery(), CancellationToken.None);

        result.Should().ContainSingle();
        result[0].Sex.Should().Be("female");
    }

    [Fact]
    public async Task Handle_WhenGetFamilies_ShouldReturnMappedSummaries()
    {
        var catalog = new Mock<IFamilyCatalogService>();
        catalog.Setup(c => c.GetFamiliesAsync(It.IsAny<CancellationToken>()))
            .ReturnsAsync(new List<FamilySummary>
            {
                new("wisniewski", new LocalizedText { En = "Wisniewski" }, true),
                new("kowalski", new LocalizedText { En = "Kowalski" }, false)
            });
        var handler = new GetFamiliesHandler(catalog.Object, BuildMapper());

        var result = await handler.Handle(new GetFamiliesQuery(), CancellationToken.None);

        result.Select(family => (family.Id, family.Name.En, family.IsDefault))
            .Should().Equal(("wisniewski", "Wisniewski", true), ("kowalski", "Kowalski", false));
    }

    [Fact]
    public async Task Handle_WhenGetPersonByIdAndMissing_ShouldReturnNull()
    {
        var service = new Mock<IFamilyQueryService>();
        service.Setup(s => s.GetPersonAsync("p-9999", It.IsAny<CancellationToken>()))
            .ReturnsAsync((Person?)null);
        var handler = new GetPersonByIdHandler(service.Object, BuildMapper());

        var result = await handler.Handle(new GetPersonByIdQuery("p-9999"), CancellationToken.None);

        result.Should().BeNull();
    }

    [Fact]
    public async Task Handle_WhenGetPersonByIdAndFound_ShouldReturnMappedDetail()
    {
        var service = new Mock<IFamilyQueryService>();
        service.Setup(s => s.GetPersonAsync("p-0001", It.IsAny<CancellationToken>()))
            .ReturnsAsync(NewPerson("p-0001"));
        var handler = new GetPersonByIdHandler(service.Object, BuildMapper());

        var result = await handler.Handle(new GetPersonByIdQuery("p-0001"), CancellationToken.None);

        result.Should().NotBeNull();
        result!.Vocation.Should().Be("teacher");
    }

    [Fact]
    public async Task Handle_WhenGetFamilyGraph_ShouldReturnMappedGraph()
    {
        var service = new Mock<IFamilyQueryService>();
        service.Setup(s => s.GetGraphAsync(It.IsAny<CancellationToken>()))
            .ReturnsAsync(new FamilyGraph(
                [NewPerson("p-0001")],
                [new Union { Id = "u-0001", PartnerIds = ["p-0001"] }]));
        var handler = new GetFamilyGraphHandler(service.Object, BuildMapper());

        var result = await handler.Handle(new GetFamilyGraphQuery(), CancellationToken.None);

        result.People.Should().ContainSingle();
        result.Unions.Should().ContainSingle().Which.Id.Should().Be("u-0001");
    }
}
