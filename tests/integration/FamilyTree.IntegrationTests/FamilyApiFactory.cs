using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;

namespace FamilyTree.IntegrationTests;

public sealed class FamilyApiFactory : WebApplicationFactory<Program>
{
    protected override void ConfigureWebHost(IWebHostBuilder builder)
    {
        var fixturePath = Path.Combine(AppContext.BaseDirectory, "Fixtures", "family.test.json");
        builder.UseSetting("FamilyData:Source", fixturePath);
        builder.UseEnvironment("Development");
    }
}
