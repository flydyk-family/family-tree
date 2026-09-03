using Mapster;

namespace FamilyTree.Application.Mapping;

public static class MappingConfig
{
    public static void Register(TypeAdapterConfig config)
    {
        config.NewConfig<LocalizedText, LocalizedTextDto>();
        config.NewConfig<LocalizedTextDto, LocalizedText>();

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
        config.NewConfig<ResidenceDto, Residence>();
        config.NewConfig<SocialLink, SocialLinkDto>();
        config.NewConfig<Parents, ParentsDto>();
        config.NewConfig<Union, UnionDto>();
        config.NewConfig<FamilyGraph, FamilyGraphDto>();

        config.NewConfig<PersonProfileOverride, PersonProfileDto>()
            .Map(dest => dest.Sex, src => src.Sex == null ? null : src.Sex.ToString()!.ToLowerInvariant())
            .Map(dest => dest.Vocation, src => src.Vocation == null ? null : src.Vocation.ToString()!.ToLowerInvariant());

        config.NewConfig<PersonProfileDto, PersonProfileOverride>()
            .Map(dest => dest.Sex, src => ParseSex(src.Sex))
            .Map(dest => dest.Vocation, src => ParseVocation(src.Vocation));
    }

    private static Sex? ParseSex(string? value) =>
        Enum.TryParse<Sex>(value, ignoreCase: true, out var s) ? s : null;

    private static Vocation? ParseVocation(string? value) =>
        Enum.TryParse<Vocation>(value, ignoreCase: true, out var v) ? v : null;
}
