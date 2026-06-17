using FamilyTree.Domain;
using Microsoft.Extensions.DependencyInjection;

namespace FamilyTree.Infrastructure;

public static class InfrastructureServiceCollectionExtensions
{
    public static IServiceCollection AddInfrastructure(this IServiceCollection services, FamilyDataOptions familyData)
    {
        services.Configure<FamilyDataOptions>(options => options.FilePath = familyData.FilePath);
        services.AddSingleton<IFamilyDataLoader, JsonFamilyDataLoader>();
        services.AddSingleton<FamilyStore>();
        services.AddSingleton<ISessionStore, InMemorySessionStore>();
        services.AddSingleton<IPersonOverrideStore, InMemoryPersonOverrideStore>();
        services.AddScoped<IPersonRepository, InMemoryPersonRepository>();
        services.AddScoped<IUnionRepository, InMemoryUnionRepository>();
        return services;
    }
}
