using FamilyTree.Domain;
using FamilyTree.Infrastructure;

namespace FamilyTree.UnitTests.Infrastructure;

public sealed class FamilyScopedOverrideStoreTests
{
    private static readonly FamilyRegistry Registry = new(
    [
        new FamilyRegistryEntry("perovsky", "family.json", new LocalizedText(), null),
        new FamilyRegistryEntry("kowalski", "kowalski.json", new LocalizedText(), null)
    ], "perovsky");

    private readonly InMemoryPersonOverrideStore _inner = new();

    private IPersonOverrideStore For(string familyId) => new FamilyScopedOverrideStore(_inner, Registry, familyId);

    [Fact]
    public async Task AppendBiographyAsync_WhenFamilyIsNotTheDefault_ShouldWriteUnderPrefixedKey()
    {
        await For("kowalski").AppendBiographyAsync("p-1", new LocalizedText { En = "k" }, "e", CancellationToken.None);

        (await _inner.GetLatestBiographyAsync("kowalski__p-1", CancellationToken.None))!.En.Should().Be("k");
        (await _inner.GetLatestBiographyAsync("p-1", CancellationToken.None)).Should().BeNull();
    }

    [Fact]
    public async Task AppendBiographyAsync_WhenFamilyIsTheDefault_ShouldWriteUnderTheBareKey()
    {
        await For("perovsky").AppendBiographyAsync("p-1", new LocalizedText { En = "d" }, "e", CancellationToken.None);

        (await _inner.GetLatestBiographyAsync("p-1", CancellationToken.None))!.En.Should().Be("d");
    }

    [Fact]
    public async Task GetLatestBiographiesAsync_WhenBothFamiliesHaveEdits_ShouldReturnOnlyItsOwn()
    {
        await For("perovsky").AppendBiographyAsync("p-1", new LocalizedText { En = "d" }, "e", CancellationToken.None);
        await For("kowalski").AppendBiographyAsync("p-1", new LocalizedText { En = "k" }, "e", CancellationToken.None);

        var perovsky = await For("perovsky").GetLatestBiographiesAsync(CancellationToken.None);
        var kowalski = await For("kowalski").GetLatestBiographiesAsync(CancellationToken.None);

        perovsky.Should().ContainSingle().Which.Should().Match<KeyValuePair<string, LocalizedText>>(p => p.Key == "p-1" && p.Value.En == "d");
        kowalski.Should().ContainSingle().Which.Should().Match<KeyValuePair<string, LocalizedText>>(p => p.Key == "p-1" && p.Value.En == "k");
    }

    [Fact]
    public async Task GetLatestProfileAsync_WhenOnlyTheOtherFamilyHasOne_ShouldReturnNull()
    {
        await For("kowalski").AppendProfileAsync("p-1", new PersonProfileOverride(), "e", CancellationToken.None);

        (await For("perovsky").GetLatestProfileAsync("p-1", CancellationToken.None)).Should().BeNull();
    }

    [Fact]
    public async Task GetLatestMediaMapAsync_WhenBothFamiliesHaveMedia_ShouldReturnOnlyItsOwn()
    {
        await For("perovsky").AppendMediaAsync("p-1", new PersonMediaOverride(null, []), "e", CancellationToken.None);
        await For("kowalski").AppendMediaAsync("p-2", new PersonMediaOverride(null, []), "e", CancellationToken.None);

        (await For("kowalski").GetLatestMediaMapAsync(CancellationToken.None)).Keys.Should().Equal("p-2");
        (await For("perovsky").GetLatestMediaMapAsync(CancellationToken.None)).Keys.Should().Equal("p-1");
    }
}
