using FamilyTree.Domain;

namespace FamilyTree.UnitTests.Domain;

public sealed class MediaKeyGeneratorTests
{
    private static readonly FamilyRegistry Single = FamilyRegistry.Single("family.json");

    private static readonly FamilyRegistry TwoFamilies = new(
    [
        new FamilyRegistryEntry("wisniewski", "family.json", new LocalizedText(), null),
        new FamilyRegistryEntry("kowalski", "kowalski.json", new LocalizedText(), null)
    ], "wisniewski");

    [Fact]
    public void ForPerson_WhenSameBytes_ShouldProduceStableKeys()
    {
        var bytes = new byte[] { 1, 2, 3, 4 };
        var a = MediaKeyGenerator.ForPerson(Single, FamilyRegistry.SyntheticId, "p-0001", bytes);
        var b = MediaKeyGenerator.ForPerson(Single, FamilyRegistry.SyntheticId, "p-0001", bytes);

        a.Should().Be(b);
        a.FullKey.Should().Be($"uploads/p-0001/{a.Id}.webp");
        a.ThumbKey.Should().Be($"uploads/p-0001/{a.Id}.thumb.webp");
        a.Id.Should().HaveLength(20);
    }

    [Fact]
    public void ForPerson_WhenDifferentBytes_ShouldProduceDifferentIds()
    {
        var a = MediaKeyGenerator.ForPerson(Single, FamilyRegistry.SyntheticId, "p-0001", new byte[] { 1 });
        var b = MediaKeyGenerator.ForPerson(Single, FamilyRegistry.SyntheticId, "p-0001", new byte[] { 2 });
        a.Id.Should().NotBe(b.Id);
    }

    [Fact]
    public void ForPerson_WhenFamilyIsTheDefault_ShouldKeepTheHistoricalLayout() =>
        MediaKeyGenerator.ForPerson(TwoFamilies, "wisniewski", "p-0001", new byte[] { 1 }).FullKey
            .Should().StartWith("uploads/p-0001/");

    [Fact]
    public void ForPerson_WhenFamilyIsNotTheDefault_ShouldInsertTheFamilySegment() =>
        MediaKeyGenerator.ForPerson(TwoFamilies, "kowalski", "p-0001", new byte[] { 1 }).FullKey
            .Should().StartWith("uploads/kowalski/p-0001/");

    [Fact]
    public void ForPerson_WhenSameBytesGoToTwoFamilies_ShouldShareIdButNotKey()
    {
        var a = MediaKeyGenerator.ForPerson(TwoFamilies, "wisniewski", "p-0001", new byte[] { 1 });
        var b = MediaKeyGenerator.ForPerson(TwoFamilies, "kowalski", "p-0001", new byte[] { 1 });

        b.Id.Should().Be(a.Id);
        b.FullKey.Should().NotBe(a.FullKey);
    }
}
