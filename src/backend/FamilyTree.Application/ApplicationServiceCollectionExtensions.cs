using System.Reflection;
using FamilyTree.Application.Abstractions;
using FamilyTree.Application.Behaviors;
using FamilyTree.Application.Mapping;
using FamilyTree.Application.Services;
using FluentValidation;
using Mapster;
using Microsoft.Extensions.DependencyInjection;

namespace FamilyTree.Application;

public static class ApplicationServiceCollectionExtensions
{
    public static IServiceCollection AddApplication(this IServiceCollection services, string? mediatRLicenseKey = null)
    {
        var assembly = Assembly.GetExecutingAssembly();

        // MediatR 14's startup license check resolves ILoggerFactory, so ensure
        // logging is registered even when AddApplication runs on a bare
        // ServiceCollection (e.g. in unit tests). AddLogging is idempotent, so a
        // host that already configured logging keeps its providers.
        services.AddLogging();

        services.AddMediatR(configuration =>
        {
            configuration.RegisterServicesFromAssembly(assembly);

            // Apply the Lucky Penny community license when a key is supplied (via
            // config/env); without it MediatR still runs, just unlicensed.
            if (!string.IsNullOrWhiteSpace(mediatRLicenseKey))
            {
                configuration.LicenseKey = mediatRLicenseKey;
            }
        });
        services.AddTransient(typeof(IPipelineBehavior<,>), typeof(ValidationBehavior<,>));
        services.AddValidatorsFromAssembly(assembly);

        var typeAdapterConfig = new TypeAdapterConfig();
        MappingConfig.Register(typeAdapterConfig);
        services.AddSingleton(typeAdapterConfig);
        services.AddSingleton<IMapper>(new Mapper(typeAdapterConfig));

        services.AddScoped<IFamilyQueryService, FamilyQueryService>();

        return services;
    }
}
