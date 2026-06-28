using FamilyTree.Domain;

namespace FamilyTree.UnitTests.Domain;

public sealed class MediaKeyGeneratorTests
{
    [Fact]
    public void ForPerson_WhenSameBytes_ShouldProduceStableKeys()
    {
        var bytes = new byte[] { 1, 2, 3, 4 };
        var a = MediaKeyGenerator.ForPerson("p-0001", bytes);
        var b = MediaKeyGenerator.ForPerson("p-0001", bytes);

        a.Should().Be(b);
        a.FullKey.Should().Be($"uploads/p-0001/{a.Id}.webp");
        a.ThumbKey.Should().Be($"uploads/p-0001/{a.Id}.thumb.webp");
        a.Id.Should().HaveLength(20);
    }

    [Fact]
    public void ForPerson_WhenDifferentBytes_ShouldProduceDifferentIds()
    {
        var a = MediaKeyGenerator.ForPerson("p-0001", new byte[] { 1 });
        var b = MediaKeyGenerator.ForPerson("p-0001", new byte[] { 2 });
        a.Id.Should().NotBe(b.Id);
    }
}
