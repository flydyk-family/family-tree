using FamilyTree.Domain;
using FamilyTree.Infrastructure;
using Moq;

namespace FamilyTree.UnitTests.Infrastructure;

public sealed class InMemoryRepositoryTests
{
    private static IPersonOverrideStore EmptyOverrides()
    {
        var overrides = new Mock<IPersonOverrideStore>();
        overrides.Setup(o => o.GetLatestBiographyAsync(It.IsAny<string>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync((LocalizedText?)null);
        overrides.Setup(o => o.GetLatestBiographiesAsync(It.IsAny<CancellationToken>()))
            .ReturnsAsync(new Dictionary<string, LocalizedText>());
        return overrides.Object;
    }

    private static FamilyStore BuildStore()
    {
        var people = new List<Person>
        {
            new() { Id = "p-0001", GivenName = new LocalizedText { Ru = "Ян", En = "Jan" }, Surname = new LocalizedText { Ru = "Ковальский", En = "Kowalski" }, Birth = new LifeEvent { Year = 1750 } },
            new() { Id = "p-0002", GivenName = new LocalizedText { Ru = "Анна", En = "Anna" }, Surname = new LocalizedText { Ru = "Ковальская", En = "Kowalska" }, Birth = new LifeEvent { Year = 1755 } }
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
        var repository = new InMemoryPersonRepository(BuildStore(), EmptyOverrides());

        var result = await repository.GetAllAsync(CancellationToken.None);

        result.Should().HaveCount(2);
    }

    [Fact]
    public async Task GetByIdAsync_WhenIdExists_ShouldReturnMatchingPerson()
    {
        var repository = new InMemoryPersonRepository(BuildStore(), EmptyOverrides());

        var result = await repository.GetByIdAsync("p-0002", CancellationToken.None);

        result.Should().NotBeNull();
        result!.GivenName.Resolve("en").Should().Be("Anna");
    }

    [Fact]
    public async Task GetByIdAsync_WhenIdMissing_ShouldReturnNull()
    {
        var repository = new InMemoryPersonRepository(BuildStore(), EmptyOverrides());

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
