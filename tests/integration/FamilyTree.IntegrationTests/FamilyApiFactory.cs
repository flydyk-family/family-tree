using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;

namespace FamilyTree.IntegrationTests;

public class FamilyApiFactory : WebApplicationFactory<Program>
{
    protected override void ConfigureWebHost(IWebHostBuilder builder)
    {
        builder.UseSetting("FamilyData:Source", TestHostSettings.FixturePath("family.test.json"));
        builder.UseHermeticInfrastructure();
    }
}
