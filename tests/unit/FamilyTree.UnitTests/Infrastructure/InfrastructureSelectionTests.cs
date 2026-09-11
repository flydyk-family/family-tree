using FamilyTree.Domain;
using FamilyTree.Infrastructure;
using Microsoft.Extensions.DependencyInjection;

namespace FamilyTree.UnitTests.Infrastructure;

public sealed class InfrastructureSelectionTests
{
    private static ServiceDescriptor Descriptor<TService>(IServiceCollection services) =>
        services.Last(d => d.ServiceType == typeof(TService));

    private static ServiceDescriptor KeyedDescriptor<TService>(IServiceCollection services, object key) =>
        services.Last(d => d.ServiceType == typeof(TService) && d.IsKeyedService && Equals(d.ServiceKey, key));

    [Fact]
    public void AddInfrastructure_WhenFirestoreProjectIdBlank_ShouldRegisterInMemoryStores()
    {
        var services = new ServiceCollection();

        services.AddInfrastructure(new FamilyDataOptions(), new FirestoreOptions { ProjectId = "" });

        // ISessionStore is forwarded to the concrete InMemorySessionStore (so the sweeper can
        // share the same instance), so resolve it rather than inspecting ImplementationType.
        using var provider = services.BuildServiceProvider();
        provider.GetRequiredService<ISessionStore>().Should().BeOfType<InMemorySessionStore>();
        KeyedDescriptor<IPersonOverrideStore>(services, FamilySnapshotRegistry.RawOverrideStoreKey)
            .KeyedImplementationType.Should().Be(typeof(InMemoryPersonOverrideStore));
    }

    [Fact]
    public void AddInfrastructure_WhenFirestoreProjectIdSet_ShouldRegisterFirestoreStores()
    {
        var services = new ServiceCollection();

        services.AddInfrastructure(new FamilyDataOptions(), new FirestoreOptions { ProjectId = "proj" });

        Descriptor<ISessionStore>(services).ImplementationType.Should().Be(typeof(FirestoreSessionStore));
        KeyedDescriptor<IPersonOverrideStore>(services, FamilySnapshotRegistry.RawOverrideStoreKey)
            .KeyedImplementationType.Should().Be(typeof(FirestorePersonOverrideStore));
    }
}
