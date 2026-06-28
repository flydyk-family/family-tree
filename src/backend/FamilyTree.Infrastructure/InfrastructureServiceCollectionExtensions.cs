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
        FirestoreOptions firestore,
        R2Options? r2 = null)
    {
        r2 ??= new R2Options();

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
            options.MediaOverridesCollection = firestore.MediaOverridesCollection;
        });
        services.Configure<R2Options>(options =>
        {
            options.AccountId = r2.AccountId;
            options.Bucket = r2.Bucket;
            options.AccessKeyId = r2.AccessKeyId;
            options.SecretAccessKey = r2.SecretAccessKey;
            options.LocalMediaDirectory = r2.LocalMediaDirectory;
        });

        services.AddSingleton<IImageProcessor, ImageSharpImageProcessor>();

        if (r2.IsConfigured)
        {
            services.AddSingleton<IMediaStore, R2MediaStore>();
        }
        else
        {
            var root = string.IsNullOrWhiteSpace(r2.LocalMediaDirectory)
                ? Path.Combine(AppContext.BaseDirectory, "media")
                : r2.LocalMediaDirectory;
            services.AddSingleton<IMediaStore>(_ => new LocalFileMediaStore(root));
        }

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

        // One instance behind two roles: the read-path provider and the health source the
        // family-data health check reads (kept off IFamilySnapshotProvider to keep it pure).
        services.AddSingleton<FamilySnapshotProvider>();
        services.AddSingleton<IFamilySnapshotProvider>(sp => sp.GetRequiredService<FamilySnapshotProvider>());
        services.AddSingleton<IFamilyDataHealthSource>(sp => sp.GetRequiredService<FamilySnapshotProvider>());

        if (string.IsNullOrWhiteSpace(firestore.ProjectId))
        {
            // The sweeper needs the concrete store; forward ISessionStore to the same instance.
            services.AddSingleton<InMemorySessionStore>();
            services.AddSingleton<ISessionStore>(sp => sp.GetRequiredService<InMemorySessionStore>());
            services.AddHostedService<ExpiredSessionSweeper>();
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
