using FamilyTree.Application.Dtos;
using FamilyTree.Application.Mapping;
using FamilyTree.Domain;
using Mapster;

namespace FamilyTree.UnitTests.Mapping;

public sealed class PersonProfileMappingTests
{
    private static TypeAdapterConfig NewConfig()
    {
        var config = new TypeAdapterConfig();
        MappingConfig.Register(config);
        return config;
    }

    [Fact]
    public void Map_DtoToDomain_WhenSexAndVocationLowercase_ShouldParseCaseInsensitively()
    {
        var config = NewConfig();
        var dto = new PersonProfileDto(null, null, null, null,"male", 1897, null, null, null, null, null, "teacher");

        var domain = dto.Adapt<PersonProfileOverride>(config);

        domain.Sex.Should().Be(Sex.Male);
        domain.Vocation.Should().Be(Vocation.Teacher);
        domain.BirthYear.Should().Be(1897);
        domain.DeathYear.Should().BeNull();
    }

    [Fact]
    public void Map_DtoToDomain_WhenSexNull_ShouldLeaveSexNull()
    {
        var config = NewConfig();
        var dto = new PersonProfileDto(null, null, null, null, null, null, null, null, null, null, null, null);
        dto.Adapt<PersonProfileOverride>(config).Sex.Should().BeNull();
    }

    [Fact]
    public void Map_DtoToDomain_ShouldCarryLocalizedNames()
    {
        var config = NewConfig();
        var dto = new PersonProfileDto(
            new LocalizedTextDto("Пётр", "Пётр", "Peter"), null,
            new LocalizedTextDto("Новак", null, "Nowak"),
            new LocalizedTextDto("Янович", "Янавіч", "Yanovich"),
            null, null, null, null, null, null, null, null);

        var domain = dto.Adapt<PersonProfileOverride>(config);

        domain.GivenName.Should().BeEquivalentTo(new { En = "Peter" });
        domain.MaidenName.Should().BeEquivalentTo(new { En = "Nowak" });
        domain.MiddleName.Should().BeEquivalentTo(new { Ru = "Янович", Be = "Янавіч" });
    }

    [Fact]
    public void Map_DtoToDomain_ShouldCarryMonthAndDay()
    {
        var config = NewConfig();
        var dto = new PersonProfileDto(null, null, null, null, null, 1901, 5, 3, 1980, 6, 12, null);

        var domain = dto.Adapt<PersonProfileOverride>(config);

        domain.BirthYear.Should().Be(1901);
        domain.BirthMonth.Should().Be(5);
        domain.BirthDay.Should().Be(3);
        domain.DeathYear.Should().Be(1980);
        domain.DeathMonth.Should().Be(6);
        domain.DeathDay.Should().Be(12);
    }

    [Fact]
    public void Map_WhenProfileDtoHasResidences_ShouldMapListToOverride()
    {
        var config = NewConfig();
        var dto = new PersonProfileDto(
            null, null, null, null, null, null, null, null, null, null, null, null,
            Residences: new[]
            {
                new ResidenceDto(new LocalizedTextDto("Краков", "Кракаў", "Kraków"), 1762, 1790, 50.0614, 19.9372, null)
            });

        var over = dto.Adapt<PersonProfileOverride>(config);

        // ContainSingle also fails on null, so it covers the NotBeNull intent without `!`.
        var residence = over.Residences.Should().ContainSingle().Which;
        residence.Place.En.Should().Be("Kraków");
        residence.Lat.Should().Be(50.0614);
    }

    [Fact]
    public void Map_WhenProfileDtoResidencesNull_ShouldMapToNull()
    {
        var config = NewConfig();
        var dto = new PersonProfileDto(null, null, null, null, null, null, null, null, null, null, null, null, Residences: null);

        dto.Adapt<PersonProfileOverride>(config).Residences.Should().BeNull();
    }
}
