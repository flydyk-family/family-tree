using FamilyTree.Domain;
using FamilyTree.Infrastructure;
using Moq;

namespace FamilyTree.UnitTests.Infrastructure;

public sealed class InMemoryRepositoryTests
{
    private static FamilyStore BuildStore()
    {
        var people = new List<Person>
        {
            new() { Id = "p-0001", GivenName = "Jan", Surname = "Kowalski", Birth = new LifeEvent { Year = 1750 } },
            new() { Id = "p-0002", GivenName = "Anna", Surname = "Kowalska", Birth = new LifeEvent { Year = 1755 } }
        };
        var unions = new List<Union>
        {
            new() { Id = "u-0001", PartnerIds = ["p-0001", "p-0002"] }
        };

        var loader = new Mock<IFamilyDataLoader>();
        loader.Setup(l => l.Load()).Returns(new FamilyGraph(people, unions));
        return new FamilyStore(loader.Object);
    }

    [Fact]
    public async Task GetAllAsync_WhenStoreHasPeople_ShouldReturnAllPeople()
    {
        var repository = new InMemoryPersonRepository(BuildStore());

        var result = await repository.GetAllAsync(CancellationToken.None);

        result.Should().HaveCount(2);
    }

    [Fact]
    public async Task GetByIdAsync_WhenIdExists_ShouldReturnMatchingPerson()
    {
        var repository = new InMemoryPersonRepository(BuildStore());

        var result = await repository.GetByIdAsync("p-0002", CancellationToken.None);

        result.Should().NotBeNull();
        result!.GivenName.Should().Be("Anna");
    }

    [Fact]
    public async Task GetByIdAsync_WhenIdMissing_ShouldReturnNull()
    {
        var repository = new InMemoryPersonRepository(BuildStore());

        var result = await repository.GetByIdAsync("p-9999", CancellationToken.None);

        result.Should().BeNull();
    }

    [Fact]
    public async Task GetAllAsync_WhenStoreHasUnions_ShouldReturnAllUnions()
    {
        var repository = new InMemoryUnionRepository(BuildStore());

        var result = await repository.GetAllAsync(CancellationToken.None);

        result.Should().ContainSingle().Which.Id.Should().Be("u-0001");
    }
}
