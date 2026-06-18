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

        Descriptor<ISessionStore>(services).ImplementationType.Should().Be(typeof(InMemorySessionStore));
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
}
