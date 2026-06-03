using FamilyTree.Domain;

namespace FamilyTree.UnitTests.Domain;

public sealed class LocalizedTextTests
{
    [Theory]
    [InlineData("ru", "Тадеуш")]
    [InlineData("be", "Тадэвуш")]
    [InlineData("en", "Tadeusz")]
    public void Resolve_WhenLocaleHasValue_ShouldReturnThatLocale(string locale, string expected)
    {
        var text = new LocalizedText { Ru = "Тадеуш", Be = "Тадэвуш", En = "Tadeusz" };

        text.Resolve(locale).Should().Be(expected);
    }

    [Fact]
    public void Resolve_WhenRequestedLocaleMissing_ShouldFallBackToRussian()
    {
        var text = new LocalizedText { Ru = "Тадеуш", En = "Tadeusz" };

        text.Resolve("be").Should().Be("Тадеуш");
    }

    [Fact]
    public void Resolve_WhenRussianMissing_ShouldFallBackToEnglish()
    {
        var text = new LocalizedText { En = "Tadeusz" };

        text.Resolve("ru").Should().Be("Tadeusz");
    }

    [Fact]
    public void Resolve_WhenOnlyBelarusianPresent_ShouldReturnBelarusian()
    {
        var text = new LocalizedText { Be = "Тадэвуш" };

        text.Resolve("ru").Should().Be("Тадэвуш");
    }

    [Fact]
    public void Resolve_WhenAllEmpty_ShouldReturnNull()
    {
        new LocalizedText().Resolve("ru").Should().BeNull();
    }

    [Fact]
    public void Resolve_WhenUnknownLocale_ShouldUseFallbackChain()
    {
        new LocalizedText { Ru = "Тадеуш" }.Resolve("xx").Should().Be("Тадеуш");
    }
}
