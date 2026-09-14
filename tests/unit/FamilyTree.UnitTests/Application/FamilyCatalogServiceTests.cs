using FamilyTree.Application.Services;
using FamilyTree.Domain;

namespace FamilyTree.UnitTests.Application;

public sealed class FamilyCatalogServiceTests
{
    [Fact]
    public async Task GetFamiliesAsync_WhenTwoFamiliesAreRegistered_ShouldListBothAndMarkTheDefault()
    {
        var registry = new FamilyRegistry(
        [
            new FamilyRegistryEntry("perovsky", "family.json", new LocalizedText { En = "Perovsky" }, null),
            new FamilyRegistryEntry("kowalski", "kowalski.json", new LocalizedText { En = "Kowalski" }, null)
        ], "perovsky");

        var families = await new FamilyCatalogService(registry).GetFamiliesAsync(CancellationToken.None);

        families.Should().Equal(
            new FamilySummary("perovsky", registry.Families[0].Name, true),
            new FamilySummary("kowalski", registry.Families[1].Name, false));
    }
}
