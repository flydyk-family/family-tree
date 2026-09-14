using Microsoft.AspNetCore.Hosting;

namespace FamilyTree.IntegrationTests;

/// <summary>
/// A test host serving two families from the fixture registry with editor auth wired in, so write tests
/// can run against a family-scoped route.
/// </summary>
public sealed class TwoFamilyAuthApiFactory : AuthApiFactory
{
    protected override void ConfigureWebHost(IWebHostBuilder builder)
    {
        base.ConfigureWebHost(builder);
        builder.UseTwoFamilyRegistry();
    }
}
