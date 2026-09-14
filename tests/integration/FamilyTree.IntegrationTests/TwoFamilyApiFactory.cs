using Microsoft.AspNetCore.Hosting;

namespace FamilyTree.IntegrationTests;

/// <summary>A test host serving two families from the fixture registry.</summary>
public sealed class TwoFamilyApiFactory : FamilyApiFactory
{
    protected override void ConfigureWebHost(IWebHostBuilder builder)
    {
        base.ConfigureWebHost(builder);
        builder.UseTwoFamilyRegistry();
    }
}
