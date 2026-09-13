using Microsoft.AspNetCore.Hosting;

namespace FamilyTree.IntegrationTests;

/// <summary>Host settings shared by the integration test factories.</summary>
internal static class TestHostSettings
{
    public static string FixturePath(string fileName) => Path.Combine(AppContext.BaseDirectory, "Fixtures", fileName);

    /// <summary>Runs the host in Development with every external service unconfigured.</summary>
    /// <remarks>Development auto-loads the developer's local user-secrets, which may carry a real geocoding
    /// key, Firestore project or R2 credentials. Blanking them keeps tests hermetic and stops them wiring
    /// FirestoreDb/R2MediaStore, which would write to production data stores.</remarks>
    public static IWebHostBuilder UseHermeticInfrastructure(this IWebHostBuilder builder)
    {
        builder.UseSetting("GoogleMaps:GeocodingApiKey", "");
        builder.UseSetting("Firestore:ProjectId", "");
        builder.UseSetting("R2:AccountId", "");
        builder.UseSetting("R2:Bucket", "");
        builder.UseSetting("R2:AccessKeyId", "");
        builder.UseSetting("R2:SecretAccessKey", "");
        return builder.UseEnvironment("Development");
    }

    /// <summary>Serves the two fixture families (perovsky default, kowalski) from <c>families.test.json</c>.</summary>
    public static IWebHostBuilder UseTwoFamilyRegistry(this IWebHostBuilder builder) =>
        builder.UseSetting("FamilyData:Registry", FixturePath("families.test.json"));
}
