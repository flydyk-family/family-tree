using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;

namespace FamilyTree.IntegrationTests;

/// <summary>A test host serving two families from the fixture registry.</summary>
public sealed class TwoFamilyApiFactory : WebApplicationFactory<Program>
{
    protected override void ConfigureWebHost(IWebHostBuilder builder)
    {
        var fixtures = Path.Combine(AppContext.BaseDirectory, "Fixtures");
        builder.UseSetting("FamilyData:Source", Path.Combine(fixtures, "family.test.json"));
        builder.UseSetting("FamilyData:Registry", Path.Combine(fixtures, "families.test.json"));
        builder.UseSetting("GoogleMaps:GeocodingApiKey", "");
        builder.UseSetting("Firestore:ProjectId", "");
        builder.UseSetting("R2:AccountId", "");
        builder.UseSetting("R2:Bucket", "");
        builder.UseSetting("R2:AccessKeyId", "");
        builder.UseSetting("R2:SecretAccessKey", "");
        builder.UseEnvironment("Development");
    }
}
