using Mapster;

namespace FamilyTree.Application.Mapping;

public static class MappingConfig
{
    public static void Register(TypeAdapterConfig config)
    {
        config.NewConfig<LocalizedText, LocalizedTextDto>();

        config.NewConfig<Person, PersonSummaryDto>()
            .Map(dest => dest.Sex, src => src.Sex.ToString().ToLowerInvariant())
            .Map(dest => dest.Vocation, src => src.Vocation.ToString().ToLowerInvariant())
            .Map(dest => dest.BirthYear, src => src.Birth.Year)
            .Map(dest => dest.DeathYear, src => src.Death == null ? (int?)null : src.Death.Year);

        config.NewConfig<Person, PersonDto>()
            .Map(dest => dest.Sex, src => src.Sex.ToString().ToLowerInvariant())
            .Map(dest => dest.Vocation, src => src.Vocation.ToString().ToLowerInvariant());

        config.NewConfig<LifeEvent, LifeEventDto>();
        config.NewConfig<Residence, ResidenceDto>();
        config.NewConfig<SocialLink, SocialLinkDto>();
        config.NewConfig<Parents, ParentsDto>();
        config.NewConfig<Union, UnionDto>();
        config.NewConfig<FamilyGraph, FamilyGraphDto>();
    }
}
