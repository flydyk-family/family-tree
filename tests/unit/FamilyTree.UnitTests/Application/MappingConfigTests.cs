using FamilyTree.Application.Dtos;
using FamilyTree.Application.Mapping;
using FamilyTree.Domain;
using Mapster;

namespace FamilyTree.UnitTests.Application;

public sealed class MappingConfigTests
{
    private static TypeAdapterConfig BuildConfig()
    {
        var config = new TypeAdapterConfig();
        MappingConfig.Register(config);
        return config;
    }

    private static Person SamplePerson() => new()
    {
        Id = "p-0001",
        GivenName = new LocalizedText { Ru = "Анна", En = "Anna" },
        Surname = new LocalizedText { Ru = "Ковальская", En = "Kowalska" },
        MaidenName = new LocalizedText { Ru = "Новак", En = "Nowak" },
        MiddleName = new LocalizedText { Ru = "Янович", Be = "Янавіч", En = "Yanovich" },
        Sex = Sex.Female,
        Birth = new LifeEvent { Year = 1842, Place = new LocalizedText { Ru = "Краков", En = "Kraków" } },
        Death = new LifeEvent { Year = 1910, Approx = true },
        Vocation = Vocation.Teacher,
        Portrait = "p-0001.jpg",
        PortraitThumb = "uploads/p-0001/h1.thumb.webp",
        PortraitVideo = "p-0001.mp4",
        Residences = [new Residence { Place = new LocalizedText { Ru = "Вильнюс", En = "Vilnius" }, MapUrl = "https://maps.google.com/x" }],
        Links = [new SocialLink { Type = "facebook", Url = "https://fb.com/x" }],
        Parents = new Parents { MotherId = "p-0003", FatherId = "p-0004" },
        MarriedIntoFamily = true,
        IsDefaultRoot = true
    };

    [Fact]
    public void Map_WhenPersonToSummary_ShouldLowercaseEnumsAndFlattenYears()
    {
        var dto = SamplePerson().Adapt<PersonSummaryDto>(BuildConfig());

        dto.Sex.Should().Be("female");
        dto.Vocation.Should().Be("teacher");
        dto.BirthYear.Should().Be(1842);
        dto.DeathYear.Should().Be(1910);
        dto.Parents.MotherId.Should().Be("p-0003");
        dto.IsDefaultRoot.Should().BeTrue();
        dto.GivenName.Ru.Should().Be("Анна");
        dto.GivenName.En.Should().Be("Anna");
        dto.Surname.En.Should().Be("Kowalska");
    }

    [Fact]
    public void Map_WhenPersonToDetail_ShouldMapNestedCollectionsAndEvents()
    {
        var dto = SamplePerson().Adapt<PersonDto>(BuildConfig());

        dto.Sex.Should().Be("female");
        dto.GivenName.Ru.Should().Be("Анна");
        dto.MaidenName!.En.Should().Be("Nowak");
        dto.MiddleName!.Ru.Should().Be("Янович");
        dto.MiddleName.En.Should().Be("Yanovich");
        dto.Birth.Place!.En.Should().Be("Kraków");
        dto.Death!.Approx.Should().BeTrue();
        dto.Residences.Should().ContainSingle().Which.MapUrl.Should().Be("https://maps.google.com/x");
        dto.Residences.Should().ContainSingle().Which.Place.En.Should().Be("Vilnius");
        dto.Links.Should().ContainSingle().Which.Type.Should().Be("facebook");
    }

    [Fact]
    public void Map_WhenPortraitVideoSet_ShouldMapToSummaryAndDetail()
    {
        var summary = SamplePerson().Adapt<PersonSummaryDto>(BuildConfig());
        var detail = SamplePerson().Adapt<PersonDto>(BuildConfig());

        summary.Portrait.Should().Be("p-0001.jpg");
        summary.PortraitThumb.Should().Be("uploads/p-0001/h1.thumb.webp");
        summary.PortraitVideo.Should().Be("p-0001.mp4");
        detail.Portrait.Should().Be("p-0001.jpg");
        detail.PortraitVideo.Should().Be("p-0001.mp4");
    }

    [Fact]
    public void Map_WhenPortraitThumbSet_ShouldMapToSummaryDto()
    {
        var person = SamplePerson() with { PortraitThumb = "uploads/p-0001/h1.thumb.webp" };

        var summary = person.Adapt<PersonSummaryDto>(BuildConfig());

        summary.PortraitThumb.Should().Be("uploads/p-0001/h1.thumb.webp");
    }

    [Fact]
    public void Map_WhenOptionalLocalizedFieldsAbsent_ShouldMapToNullDto()
    {
        var person = new Person
        {
            Id = "p-9999",
            GivenName = new LocalizedText { Ru = "Тест" },
            Surname = new LocalizedText { Ru = "Персона" },
            Birth = new LifeEvent { Year = 1900 }
        };

        var dto = person.Adapt<PersonDto>(BuildConfig());

        dto.MaidenName.Should().BeNull();
        dto.MiddleName.Should().BeNull();
        dto.Summary.Should().BeNull();
        dto.Biography.Should().BeNull();
        dto.Birth.Place.Should().BeNull();
        dto.GivenName.Ru.Should().Be("Тест");
    }

    [Fact]
    public void Map_WhenGraphToDto_ShouldMapPeopleAndUnions()
    {
        var graph = new FamilyGraph(
            [SamplePerson()],
            [new Union { Id = "u-0001", PartnerIds = ["p-0001", "p-0002"], MarriageYear = 1865 }]);

        var dto = graph.Adapt<FamilyGraphDto>(BuildConfig());

        dto.People.Should().ContainSingle().Which.Id.Should().Be("p-0001");
        dto.Unions.Should().ContainSingle().Which.PartnerIds.Should().Equal("p-0001", "p-0002");
    }

    [Fact]
    public void Map_WhenResidenceDtoHasCoords_ShouldRoundTripToResidence()
    {
        var dto = new ResidenceDto(
            new LocalizedTextDto("Краков", "Кракаў", "Kraków"),
            1762, 1790, 50.0614, 19.9372, "https://www.google.com/maps/search/?api=1&query=50.0614,19.9372",
            "ChIJ0RhONcBEFkcRv4pHdrW2a7Q");

        var residence = dto.Adapt<Residence>(BuildConfig());

        residence.Place.En.Should().Be("Kraków");
        residence.FromYear.Should().Be(1762);
        residence.Lat.Should().Be(50.0614);
        residence.Lng.Should().Be(19.9372);
        residence.MapUrl.Should().Be("https://www.google.com/maps/search/?api=1&query=50.0614,19.9372");
        residence.PlaceId.Should().Be("ChIJ0RhONcBEFkcRv4pHdrW2a7Q");
    }
}
