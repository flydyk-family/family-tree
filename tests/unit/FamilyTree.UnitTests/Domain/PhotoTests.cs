using FamilyTree.Domain;

namespace FamilyTree.UnitTests.Domain;

public sealed class PhotoTests
{
    [Fact]
    public void PersonMediaOverride_WhenConstructed_ShouldExposePortraitAndGallery()
    {
        var portrait = new Photo("hash1", "uploads/p-0001/hash1.webp", "uploads/p-0001/hash1.thumb.webp");
        var gallery = new[] { new Photo("hash2", "uploads/p-0001/hash2.webp", "uploads/p-0001/hash2.thumb.webp") };

        var media = new PersonMediaOverride(portrait, gallery);

        media.Portrait.Should().Be(portrait);
        media.Gallery.Should().ContainSingle().Which.Id.Should().Be("hash2");
    }
}
