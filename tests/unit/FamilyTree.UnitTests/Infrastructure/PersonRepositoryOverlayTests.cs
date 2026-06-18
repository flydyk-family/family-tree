using FamilyTree.Domain;
using FamilyTree.Infrastructure;
using Moq;

namespace FamilyTree.UnitTests.Infrastructure;

public sealed class PersonRepositoryOverlayTests
{
    private static FamilyStore BuildStore()
    {
        var people = new List<Person>
        {
            new() { Id = "p-0001", GivenName = new LocalizedText { En = "Jan" }, Surname = new LocalizedText { En = "Kowalski" }, Birth = new LifeEvent { Year = 1750 }, Biography = new LocalizedText { En = "seed bio" } },
            new() { Id = "p-0002", GivenName = new LocalizedText { En = "Anna" }, Surname = new LocalizedText { En = "Kowalska" }, Birth = new LifeEvent { Year = 1755 } }
        };
        var loader = new Mock<IFamilyDataLoader>();
        loader.Setup(l => l.Load()).Returns(new FamilyGraph(people, new List<Union>()));
        return new FamilyStore(loader.Object);
    }

    [Fact]
    public async Task GetByIdAsync_WhenOverrideExists_ShouldReturnOverriddenBiography()
    {
        var overrides = new Mock<IPersonOverrideStore>();
        overrides.Setup(o => o.GetLatestBiographyAsync("p-0001", It.IsAny<CancellationToken>()))
            .ReturnsAsync(new LocalizedText { En = "edited bio" });
        var repository = new InMemoryPersonRepository(BuildStore(), overrides.Object);

        var person = await repository.GetByIdAsync("p-0001", CancellationToken.None);

        person.Should().NotBeNull();
        person!.Biography!.En.Should().Be("edited bio");
    }

    [Fact]
    public async Task GetByIdAsync_WhenNoOverride_ShouldReturnSeedPersonUnchanged()
    {
        var overrides = new Mock<IPersonOverrideStore>();
        overrides.Setup(o => o.GetLatestBiographyAsync(It.IsAny<string>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync((LocalizedText?)null);
        var repository = new InMemoryPersonRepository(BuildStore(), overrides.Object);

        var person = await repository.GetByIdAsync("p-0001", CancellationToken.None);

        person!.Biography!.En.Should().Be("seed bio");
    }

    [Fact]
    public async Task GetAllAsync_WhenOverrideExists_ShouldOverlayOnlyTheMatchingPerson()
    {
        var overrides = new Mock<IPersonOverrideStore>();
        overrides.Setup(o => o.GetLatestBiographiesAsync(It.IsAny<CancellationToken>()))
            .ReturnsAsync(new Dictionary<string, LocalizedText> { ["p-0002"] = new LocalizedText { En = "anna edited" } });
        var repository = new InMemoryPersonRepository(BuildStore(), overrides.Object);

        var people = await repository.GetAllAsync(CancellationToken.None);

        people.Single(p => p.Id == "p-0002").Biography!.En.Should().Be("anna edited");
        people.Single(p => p.Id == "p-0001").Biography!.En.Should().Be("seed bio");
    }
}
