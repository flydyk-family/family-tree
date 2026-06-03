using FamilyTree.Application.Services;
using FamilyTree.Domain;
using Moq;

namespace FamilyTree.UnitTests.Application;

public sealed class FamilyQueryServiceTests
{
    private static Person NewPerson(string id) =>
        new() { Id = id, GivenName = "Test", Surname = "Person", Birth = new LifeEvent { Year = 1800 } };

    [Fact]
    public async Task GetGraphAsync_WhenCalled_ShouldCombinePeopleAndUnionsFromRepositories()
    {
        var people = new List<Person> { NewPerson("p-0001") };
        var unions = new List<Union> { new() { Id = "u-0001" } };

        var personRepository = new Mock<IPersonRepository>();
        personRepository.Setup(r => r.GetAllAsync(It.IsAny<CancellationToken>()))
            .ReturnsAsync(people);
        var unionRepository = new Mock<IUnionRepository>();
        unionRepository.Setup(r => r.GetAllAsync(It.IsAny<CancellationToken>()))
            .ReturnsAsync(unions);

        var service = new FamilyQueryService(personRepository.Object, unionRepository.Object);

        var graph = await service.GetGraphAsync(CancellationToken.None);

        graph.People.Should().ContainSingle().Which.Id.Should().Be("p-0001");
        graph.Unions.Should().ContainSingle().Which.Id.Should().Be("u-0001");
    }

    [Fact]
    public async Task GetPersonAsync_WhenCalled_ShouldDelegateToRepository()
    {
        var personRepository = new Mock<IPersonRepository>();
        personRepository.Setup(r => r.GetByIdAsync("p-0001", It.IsAny<CancellationToken>()))
            .ReturnsAsync(NewPerson("p-0001"));
        var unionRepository = new Mock<IUnionRepository>();

        var service = new FamilyQueryService(personRepository.Object, unionRepository.Object);

        var person = await service.GetPersonAsync("p-0001", CancellationToken.None);

        person.Should().NotBeNull();
        personRepository.Verify(r => r.GetByIdAsync("p-0001", It.IsAny<CancellationToken>()), Times.Once);
    }
}
