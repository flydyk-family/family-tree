using FamilyTree.Application.Behaviors;
using FamilyTree.Application.Mapping;
using FamilyTree.Application.Services;
using FluentValidation;
using Microsoft.Extensions.DependencyInjection;

namespace FamilyTree.Application;

public static class DependencyInjection
{
    public static IServiceCollection AddApplication(this IServiceCollection services)
    {
        var assembly = typeof(DependencyInjection).Assembly;

        services.AddMediatR(configuration =>
        {
            configuration.RegisterServicesFromAssembly(assembly);
            configuration.AddOpenBehavior(typeof(ValidationBehavior<,>));
        });

        services.AddValidatorsFromAssembly(assembly);

        services.AddSingleton<IGenerationCalculator, GenerationCalculator>();
        services.AddSingleton<ITreeProjectionService, TreeProjectionService>();
        services.AddSingleton<PersonMapper>();

        return services;
    }
}
