using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;

namespace FamilyTree.Infrastructure;

public static class InfrastructureServiceCollectionExtensions
{
    public static IServiceCollection AddInfrastructure(this IServiceCollection services, IConfiguration configuration)
    {
        services.Configure<FamilyDataOptions>(configuration.GetSection(FamilyDataOptions.SectionName));
        services.AddSingleton<IFamilyDataLoader, JsonFamilyDataLoader>();
        services.AddSingleton<FamilyStore>();
        services.AddScoped<IPersonRepository, InMemoryPersonRepository>();
        services.AddScoped<IUnionRepository, InMemoryUnionRepository>();
        return services;
    }
}
