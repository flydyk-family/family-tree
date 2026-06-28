using FamilyTree.Application.Dtos;
using FamilyTree.Application.Mapping;
using FamilyTree.Domain;
using Mapster;

namespace FamilyTree.UnitTests.Application;

public sealed class PersonMappingTests
{
    private static TypeAdapterConfig BuildConfig()
    {
        var config = new TypeAdapterConfig();
        MappingConfig.Register(config);
        return config;
    }

    [Fact]
    public void Map_WhenPersonHasGalleryAndThumb_ShouldMapPhotoFields()
    {
        var person = new Person
        {
            Id = "p-0001",
            GivenName = new LocalizedText { En = "A" },
            Surname = new LocalizedText { En = "B" },
            Birth = new LifeEvent(),
            Portrait = "uploads/p-0001/h1.webp",
            PortraitThumb = "uploads/p-0001/h1.thumb.webp",
            Gallery = [new Photo("h2", "uploads/p-0001/h2.webp", "uploads/p-0001/h2.thumb.webp")]
        };

        var dto = person.Adapt<PersonDto>(BuildConfig());

        dto.PortraitThumb.Should().Be("uploads/p-0001/h1.thumb.webp");
        dto.Gallery.Should().ContainSingle().Which.Should().Be(new PhotoDto("h2", "uploads/p-0001/h2.webp", "uploads/p-0001/h2.thumb.webp"));
    }
}
