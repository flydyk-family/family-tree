using FamilyTree.Domain;

namespace FamilyTree.UnitTests.Domain;

public sealed class StorageKeysTests
{
    private static readonly FamilyRegistry Registry = new(
    [
        new FamilyRegistryEntry("perovsky", "family.json", new LocalizedText(), null),
        new FamilyRegistryEntry("kowalski", "kowalski.json", new LocalizedText(), null)
    ], "perovsky");

    [Fact]
    public void OverrideKey_WhenFamilyIsTheDefault_ShouldReturnTheBarePersonId() =>
        StorageKeys.OverrideKey(Registry, "perovsky", "p-0001").Should().Be("p-0001");

    [Fact]
    public void OverrideKey_WhenFamilyIsNotTheDefault_ShouldPrefixWithoutASlash()
    {
        var key = StorageKeys.OverrideKey(Registry, "kowalski", "p-0001");

        key.Should().Be("kowalski__p-0001");
        key.Should().NotContain("/");
    }

    [Fact]
    public void UploadPrefix_WhenFamilyIsTheDefault_ShouldKeepTheHistoricalLayout() =>
        StorageKeys.UploadPrefix(Registry, "perovsky", "p-0001").Should().Be("uploads/p-0001");

    [Fact]
    public void UploadPrefix_WhenFamilyIsNotTheDefault_ShouldInsertTheFamilySegment() =>
        StorageKeys.UploadPrefix(Registry, "kowalski", "p-0001").Should().Be("uploads/kowalski/p-0001");

    [Fact]
    public void ExpandSeedMedia_WhenFamilyIsTheDefault_ShouldLeaveABareNameAlone() =>
        StorageKeys.ExpandSeedMedia(Registry, "perovsky", "p-0001.jpg").Should().Be("p-0001.jpg");

    [Fact]
    public void ExpandSeedMedia_WhenFamilyIsNotTheDefault_ShouldPrefixABareName() =>
        StorageKeys.ExpandSeedMedia(Registry, "kowalski", "p-0001.jpg").Should().Be("portraits/kowalski/p-0001.jpg");

    [Fact]
    public void ExpandSeedMedia_WhenReferenceAlreadyHasASlash_ShouldLeaveItUntouched() =>
        StorageKeys.ExpandSeedMedia(Registry, "kowalski", "uploads/p-0001/ab.webp").Should().Be("uploads/p-0001/ab.webp");

    [Theory]
    [InlineData("uploads/p-0001/ab.webp", true)]
    [InlineData("uploads/kowalski/p-0001/ab.webp", true)]
    [InlineData("p-0001.jpg", false)]
    [InlineData("portraits/kowalski/p-0001.jpg", false)]
    public void IsUploadKey_WhenGivenAReference_ShouldRecogniseOnlyTheUploadsPrefix(string reference, bool expected) =>
        StorageKeys.IsUploadKey(reference).Should().Be(expected);
}
