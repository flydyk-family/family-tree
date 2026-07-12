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
        var dto = new PersonProfileDto(null, null, null, "male", 1897, null, "teacher");

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
        var dto = new PersonProfileDto(null, null, null, null, null, null, null);
        dto.Adapt<PersonProfileOverride>(config).Sex.Should().BeNull();
    }
}
