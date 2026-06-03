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
        Sex = Sex.Female,
        Birth = new LifeEvent { Year = 1842, Place = new LocalizedText { Ru = "Краков", En = "Kraków" } },
        Death = new LifeEvent { Year = 1910, Approx = true },
        Vocation = Vocation.Teacher,
        Portrait = "p-0001.jpg",
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
        dto.Birth.Place!.En.Should().Be("Kraków");
        dto.Death!.Approx.Should().BeTrue();
        dto.Residences.Should().ContainSingle().Which.MapUrl.Should().Be("https://maps.google.com/x");
        dto.Residences.Should().ContainSingle().Which.Place.En.Should().Be("Vilnius");
        dto.Links.Should().ContainSingle().Which.Type.Should().Be("facebook");
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
}
