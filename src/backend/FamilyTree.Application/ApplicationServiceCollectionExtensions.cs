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
    public static IServiceCollection AddApplication(this IServiceCollection services)
    {
        var assembly = Assembly.GetExecutingAssembly();

        services.AddMediatR(configuration => configuration.RegisterServicesFromAssembly(assembly));
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
