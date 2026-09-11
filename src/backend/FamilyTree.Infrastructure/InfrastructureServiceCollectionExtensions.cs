using FamilyTree.Domain;
using Google.Cloud.Firestore;
using Google.Cloud.Storage.V1;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Options;

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
            options.Registry = familyData.Registry;
        });
        services.Configure<FirestoreOptions>(options =>
        {
            options.ProjectId = firestore.ProjectId;
            options.SessionsCollection = firestore.SessionsCollection;
            options.OverridesCollection = firestore.OverridesCollection;
            options.MediaOverridesCollection = firestore.MediaOverridesCollection;
        });
        // R2Options is immutable (init-only); register the already-built instance directly
        // rather than mutating one through Configure<T>.
        services.AddSingleton<IOptions<R2Options>>(Options.Create(r2));

        services.AddSingleton<IImageProcessor, ImageSharpImageProcessor>();
        services.AddSingleton<IFamilyGraphValidator, FamilyGraphValidator>();

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

        // Lazy: only constructed (and so only needs ADC) when something resolves it — a gs://
        // registry, or any registered family (including one listed by a local registry) with a
        // gs:// seed source.
        services.AddSingleton(_ => StorageClient.Create());

        if (string.IsNullOrWhiteSpace(firestore.ProjectId))
        {
            // The sweeper needs the concrete store; forward ISessionStore to the same instance.
            services.AddSingleton<InMemorySessionStore>();
            services.AddSingleton<ISessionStore>(sp => sp.GetRequiredService<InMemorySessionStore>());
            services.AddHostedService<ExpiredSessionSweeper>();
            services.AddKeyedSingleton<IPersonOverrideStore, InMemoryPersonOverrideStore>(FamilySnapshotRegistry.RawOverrideStoreKey);
        }
        else
        {
            services.AddSingleton(_ => FirestoreDb.Create(firestore.ProjectId));
            services.AddSingleton<ISessionStore, FirestoreSessionStore>();
            services.AddKeyedSingleton<IPersonOverrideStore, FirestorePersonOverrideStore>(FamilySnapshotRegistry.RawOverrideStoreKey);
        }

        if (familyData.IsGcsRegistry)
        {
            services.AddSingleton<IRegistryFileReader>(sp => new GcsRegistryFileReader(sp.GetRequiredService<StorageClient>()));
        }
        else
        {
            services.AddSingleton<IRegistryFileReader, LocalRegistryFileReader>();
        }
        services.AddSingleton<FamilyRegistryLoader>();
        // Read once; startup resolves it eagerly so a bad registry fails fast.
        services.AddSingleton(sp => sp.GetRequiredService<FamilyRegistryLoader>().Load());
        services.AddSingleton<IFamilyDataLoaderFactory, FamilyDataLoaderFactory>();
        services.AddSingleton<FamilySnapshotRegistry>();
        services.AddSingleton<IFamilyDataHealthSource>(sp =>
            sp.GetRequiredService<FamilySnapshotRegistry>().HealthFor(sp.GetRequiredService<FamilyRegistry>().DefaultFamilyId));

        // The family travels as a scoped context, so repositories and handlers stay family-agnostic.
        services.AddScoped<FamilyContext>();
        services.AddScoped<IFamilyContext>(sp => sp.GetRequiredService<FamilyContext>());
        services.AddScoped<IFamilySnapshotProvider>(sp =>
            sp.GetRequiredService<FamilySnapshotRegistry>().For(sp.GetRequiredService<FamilyContext>().FamilyId));
        services.AddScoped<IPersonOverrideStore>(sp => new FamilyScopedOverrideStore(
            sp.GetRequiredKeyedService<IPersonOverrideStore>(FamilySnapshotRegistry.RawOverrideStoreKey),
            sp.GetRequiredService<FamilyRegistry>(),
            sp.GetRequiredService<FamilyContext>().FamilyId));

        services.AddScoped<IPersonRepository, InMemoryPersonRepository>();
        services.AddScoped<IUnionRepository, InMemoryUnionRepository>();
        return services;
    }
}
