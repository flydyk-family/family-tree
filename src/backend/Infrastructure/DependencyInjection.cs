using FamilyTree.Application.Abstractions;
using Microsoft.Extensions.DependencyInjection;

namespace FamilyTree.Infrastructure;

public static class DependencyInjection
{
    public static IServiceCollection AddInfrastructure(
        this IServiceCollection services,
        Action<FamilyDataOptions>? configureOptions = null)
    {
        var optionsBuilder = services.AddOptions<FamilyDataOptions>();
        if (configureOptions is not null)
        {
            optionsBuilder.Configure(configureOptions);
        }

        services.AddSingleton<IFamilyDataStore, JsonFamilyDataStore>();
        services.AddSingleton<IFamilyRepository, JsonFamilyRepository>();

        return services;
    }
}
