using FamilyTree.Domain;
using FamilyTree.Infrastructure;
using Microsoft.Extensions.DependencyInjection;

namespace FamilyTree.IntegrationTests;

/// <summary>Both WebApplicationFactory subclasses run in the Development environment, which
/// auto-loads a developer's local user-secrets. If Firestore:ProjectId or the R2:* credentials
/// were ever set there (e.g. to test uploads against real infra by hand), every integration
/// test on that machine would otherwise wire up real Firestore/R2 clients instead of the
/// in-memory/local-file test doubles. These tests pin that the blanking overrides in
/// AuthApiFactory/FamilyApiFactory hold regardless of what the environment provides.</summary>
public sealed class TestHostIsolationTests : IClassFixture<AuthApiFactory>, IClassFixture<FamilyApiFactory>
{
    private readonly AuthApiFactory _auth;
    private readonly FamilyApiFactory _family;

    public TestHostIsolationTests(AuthApiFactory auth, FamilyApiFactory family)
    {
        _auth = auth;
        _family = family;
    }

    [Fact]
    public void AuthApiFactory_ShouldResolveInMemoryAndLocalStores_NotFirestoreOrR2()
    {
        _auth.Services.GetService<IPersonOverrideStore>().Should().BeOfType<InMemoryPersonOverrideStore>();
        _auth.Services.GetService<IMediaStore>().Should().BeOfType<LocalFileMediaStore>();
    }

    [Fact]
    public void FamilyApiFactory_ShouldResolveInMemoryAndLocalStores_NotFirestoreOrR2()
    {
        _family.Services.GetService<IPersonOverrideStore>().Should().BeOfType<InMemoryPersonOverrideStore>();
        _family.Services.GetService<IMediaStore>().Should().BeOfType<LocalFileMediaStore>();
    }
}
