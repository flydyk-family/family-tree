using FamilyTree.Domain;
using FamilyTree.Infrastructure;
using Microsoft.Extensions.DependencyInjection;

namespace FamilyTree.UnitTests.Infrastructure;

public sealed class InfrastructureSelectionTests
{
    private static ServiceDescriptor Descriptor<TService>(IServiceCollection services) =>
        services.Last(d => d.ServiceType == typeof(TService));

    [Fact]
    public void AddInfrastructure_WhenFirestoreProjectIdBlank_ShouldRegisterInMemoryStores()
    {
        var services = new ServiceCollection();

        services.AddInfrastructure(new FamilyDataOptions(), new FirestoreOptions { ProjectId = "" });

        // ISessionStore is forwarded to the concrete InMemorySessionStore (so the sweeper can
        // share the same instance), so resolve it rather than inspecting ImplementationType.
        using var provider = services.BuildServiceProvider();
        provider.GetRequiredService<ISessionStore>().Should().BeOfType<InMemorySessionStore>();
        Descriptor<IPersonOverrideStore>(services).ImplementationType.Should().Be(typeof(InMemoryPersonOverrideStore));
    }

    [Fact]
    public void AddInfrastructure_WhenFirestoreProjectIdSet_ShouldRegisterFirestoreStores()
    {
        var services = new ServiceCollection();

        services.AddInfrastructure(new FamilyDataOptions(), new FirestoreOptions { ProjectId = "proj" });

        Descriptor<ISessionStore>(services).ImplementationType.Should().Be(typeof(FirestoreSessionStore));
        Descriptor<IPersonOverrideStore>(services).ImplementationType.Should().Be(typeof(FirestorePersonOverrideStore));
    }

    [Fact]
    public void AddInfrastructure_WhenSourceIsLocalPath_ShouldRegisterJsonLoader()
    {
        var services = new ServiceCollection();

        services.AddInfrastructure(new FamilyDataOptions { Source = "Data/family.json" }, new FirestoreOptions());

        Descriptor<IFamilyDataLoader>(services).ImplementationType.Should().Be(typeof(JsonFamilyDataLoader));
    }

    [Fact]
    public void AddInfrastructure_WhenSourceIsGcsUri_ShouldRegisterGcsLoader()
    {
        var services = new ServiceCollection();

        services.AddInfrastructure(new FamilyDataOptions { Source = "gs://bucket/family.json" }, new FirestoreOptions());

        Descriptor<IFamilyDataLoader>(services).ImplementationType.Should().Be(typeof(GcsFamilyDataLoader));
    }
}
