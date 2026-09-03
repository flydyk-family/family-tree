using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;

namespace FamilyTree.IntegrationTests;

public sealed class FamilyApiFactory : WebApplicationFactory<Program>
{
    protected override void ConfigureWebHost(IWebHostBuilder builder)
    {
        var fixturePath = Path.Combine(AppContext.BaseDirectory, "Fixtures", "family.test.json");
        builder.UseSetting("FamilyData:Source", fixturePath);
        // Development env auto-loads the developer's local user-secrets; blank any real
        // Firestore/R2/geocoding credentials so this test host can never wire up production
        // infrastructure (see AuthApiFactory's fuller rationale for the same overrides).
        builder.UseSetting("GoogleMaps:GeocodingApiKey", "");
        builder.UseSetting("Firestore:ProjectId", "");
        builder.UseSetting("R2:AccountId", "");
        builder.UseSetting("R2:Bucket", "");
        builder.UseSetting("R2:AccessKeyId", "");
        builder.UseSetting("R2:SecretAccessKey", "");
        builder.UseEnvironment("Development");
    }
}
