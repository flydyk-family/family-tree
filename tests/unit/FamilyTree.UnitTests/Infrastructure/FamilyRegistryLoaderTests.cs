using System.Text.Json;
using FamilyTree.Domain;
using FamilyTree.Infrastructure;
using Microsoft.Extensions.Logging.Abstractions;
using Microsoft.Extensions.Options;
using Moq;

namespace FamilyTree.UnitTests.Infrastructure;

public sealed class FamilyRegistryLoaderTests
{
    private const string TwoFamilies = """
    {
      "defaultFamily": "wisniewski",
      "families": [
        { "id": "wisniewski", "source": "family.json", "name": { "en": "Wisniewski" } },
        { "id": "kowalski", "source": "kowalski.json", "mediaPrefix": "portraits/kw",
          "name": { "en": "Kowalski" } }
      ]
    }
    """;

    [Fact]
    public void Parse_WhenRegistryListsTwoFamilies_ShouldExposeBothAndTheDefault()
    {
        var registry = FamilyRegistryLoader.Parse(TwoFamilies, "Data/families.json");

        registry.Families.Should().HaveCount(2);
        registry.DefaultFamilyId.Should().Be("wisniewski");
        registry.IsDefault("wisniewski").Should().BeTrue();
        registry.IsDefault("kowalski").Should().BeFalse();
    }

    [Fact]
    public void Parse_WhenSourceIsRelative_ShouldResolveItBesideTheRegistry()
    {
        var registry = FamilyRegistryLoader.Parse(TwoFamilies, "Data/families.json");

        registry.Find("kowalski")!.Source.Should().Be("Data/kowalski.json");
    }

    [Fact]
    public void Parse_WhenRegistryIsInGcs_ShouldResolveSourcesInTheSameFolder()
    {
        var registry = FamilyRegistryLoader.Parse(TwoFamilies, "gs://seeds/prod/families.json");

        registry.Find("kowalski")!.Source.Should().Be("gs://seeds/prod/kowalski.json");
    }

    [Theory]
    [InlineData("gs://other/x.json")]
    [InlineData("/abs/x.json")]
    public void ResolveSource_WhenSourceIsAbsolute_ShouldKeepItUnchanged(string source)
    {
        FamilyRegistryLoader.ResolveSource("Data/families.json", source).Should().Be(source);
    }

    [Fact]
    public void MediaPrefixFor_WhenMediaPrefixIsConfigured_ShouldUseIt()
    {
        var registry = FamilyRegistryLoader.Parse(TwoFamilies, "Data/families.json");

        registry.MediaPrefixFor("kowalski").Should().Be("portraits/kw");
    }

    [Fact]
    public void MediaPrefixFor_WhenMediaPrefixIsOmitted_ShouldDeriveItFromTheId()
    {
        var registry = new FamilyRegistry(
        [
            new FamilyRegistryEntry("wisniewski", "a.json", new LocalizedText(), null),
            new FamilyRegistryEntry("nowak", "b.json", new LocalizedText(), null)
        ], "wisniewski");

        registry.MediaPrefixFor("wisniewski").Should().Be("portraits");
        registry.MediaPrefixFor("nowak").Should().Be("portraits/nowak");
    }

    [Fact]
    public void Parse_WhenDefaultFamilyIsNotListed_ShouldThrow()
    {
        var json = """
        { "defaultFamily": "missing",
          "families": [ { "id": "wisniewski", "source": "family.json", "name": { "en": "P" } } ] }
        """;

        var act = () => FamilyRegistryLoader.Parse(json, "families.json");

        act.Should().Throw<InvalidOperationException>().WithMessage("*missing*");
    }

    [Fact]
    public void Parse_WhenTwoFamiliesShareAnId_ShouldThrow()
    {
        var json = """
        { "defaultFamily": "a",
          "families": [ { "id": "a", "source": "a.json", "name": { "en": "A" } },
                        { "id": "a", "source": "b.json", "name": { "en": "B" } } ] }
        """;

        var act = () => FamilyRegistryLoader.Parse(json, "families.json");

        act.Should().Throw<InvalidOperationException>().WithMessage("*duplicate*");
    }

    [Theory]
    [InlineData("Wisniewski")]
    [InlineData("per_ovsky")]
    [InlineData("per/ovsky")]
    [InlineData("")]
    public void Parse_WhenFamilyIdIsNotSlugShaped_ShouldThrow(string id)
    {
        var json = JsonSerializer.Serialize(new
        {
            defaultFamily = id,
            families = new[] { new { id, source = "a.json", name = new { en = "A" } } }
        });

        var act = () => FamilyRegistryLoader.Parse(json, "families.json");

        act.Should().Throw<InvalidOperationException>();
    }

    [Fact]
    public void Parse_WhenFamilyHasNoSource_ShouldThrow()
    {
        var json = """{ "defaultFamily": "a", "families": [ { "id": "a", "name": { "en": "A" } } ] }""";

        var act = () => FamilyRegistryLoader.Parse(json, "families.json");

        act.Should().Throw<InvalidOperationException>().WithMessage("*source*");
    }

    [Fact]
    public void Parse_WhenDefaultFamilySetsMediaPrefix_ShouldThrow()
    {
        var json = """
        { "defaultFamily": "a",
          "families": [ { "id": "a", "source": "a.json", "mediaPrefix": "portraits/a", "name": { "en": "A" } } ] }
        """;

        var act = () => FamilyRegistryLoader.Parse(json, "families.json");

        act.Should().Throw<InvalidOperationException>().WithMessage("*mediaPrefix*default*");
    }

    [Fact]
    public void Parse_WhenRegistryListsNoFamilies_ShouldThrow()
    {
        var act = () => FamilyRegistryLoader.Parse("""{ "defaultFamily": "a", "families": [] }""", "families.json");

        act.Should().Throw<InvalidOperationException>().WithMessage("*no families*");
    }

    [Fact]
    public void Load_WhenNoRegistryIsConfigured_ShouldSynthesizeTheDefaultFamily()
    {
        var reader = new Mock<IRegistryFileReader>(MockBehavior.Strict);
        var loader = new FamilyRegistryLoader(
            Options.Create(new FamilyDataOptions { Source = "Data/family.json" }),
            reader.Object,
            NullLogger<FamilyRegistryLoader>.Instance);

        var registry = loader.Load();

        registry.DefaultFamilyId.Should().Be(FamilyRegistry.SyntheticId);
        registry.Default.Source.Should().Be("Data/family.json");
        registry.MediaPrefixFor(FamilyRegistry.SyntheticId).Should().Be("portraits");
    }

    [Fact]
    public void Load_WhenRegistryIsConfigured_ShouldReadAndParseIt()
    {
        var reader = new Mock<IRegistryFileReader>();
        reader.Setup(r => r.Read("Data/families.json")).Returns(TwoFamilies);
        var loader = new FamilyRegistryLoader(
            Options.Create(new FamilyDataOptions { Registry = "Data/families.json" }),
            reader.Object,
            NullLogger<FamilyRegistryLoader>.Instance);

        loader.Load().Families.Should().HaveCount(2);
    }
}
