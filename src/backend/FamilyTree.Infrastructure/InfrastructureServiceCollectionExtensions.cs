using FamilyTree.Domain;
using Google.Cloud.Firestore;
using Google.Cloud.Storage.V1;
using Microsoft.Extensions.DependencyInjection;

namespace FamilyTree.Infrastructure;

public static class InfrastructureServiceCollectionExtensions
{
    public static IServiceCollection AddInfrastructure(
        this IServiceCollection services,
        FamilyDataOptions familyData,
        FirestoreOptions firestore)
    {
        services.Configure<FamilyDataOptions>(options =>
        {
            options.Source = familyData.Source;
            options.SnapshotTtlMinutes = familyData.SnapshotTtlMinutes;
        });
        services.Configure<FirestoreOptions>(options =>
        {
            options.ProjectId = firestore.ProjectId;
            options.SessionsCollection = firestore.SessionsCollection;
            options.OverridesCollection = firestore.OverridesCollection;
        });

        services.AddSingleton(TimeProvider.System);

        if (familyData.IsGcsSource)
        {
            services.AddSingleton(_ => StorageClient.Create());
            services.AddSingleton<IFamilyDataLoader, GcsFamilyDataLoader>();
        }
        else
        {
            services.AddSingleton<IFamilyDataLoader, JsonFamilyDataLoader>();
        }

        services.AddSingleton<IFamilySnapshotProvider, FamilySnapshotProvider>();

        if (string.IsNullOrWhiteSpace(firestore.ProjectId))
        {
            services.AddSingleton<ISessionStore, InMemorySessionStore>();
            services.AddSingleton<IPersonOverrideStore, InMemoryPersonOverrideStore>();
        }
        else
        {
            services.AddSingleton(_ => FirestoreDb.Create(firestore.ProjectId));
            services.AddSingleton<ISessionStore, FirestoreSessionStore>();
            services.AddSingleton<IPersonOverrideStore, FirestorePersonOverrideStore>();
        }

        services.AddScoped<IPersonRepository, InMemoryPersonRepository>();
        services.AddScoped<IUnionRepository, InMemoryUnionRepository>();
        return services;
    }
}
