using FamilyTree.Api.Configuration;
using Microsoft.Extensions.Configuration;

namespace FamilyTree.IntegrationTests;

public sealed class AppSettingsBindingTests
{
    [Fact]
    public void Bind_WhenAllSectionsPresent_ShouldPopulateEveryNestedValue()
    {
        var configuration = new ConfigurationBuilder()
            .AddInMemoryCollection(new Dictionary<string, string?>
            {
                ["FamilyData:FilePath"] = "Data/custom.json",
                ["MediatR:LicenseKey"] = "abc-123",
                ["RateLimiting:PermitLimit"] = "250",
                ["RateLimiting:WindowSeconds"] = "30"
            })
            .Build();

        var settings = configuration.Get<AppSettings>();

        settings.Should().NotBeNull();
        settings!.FamilyData.FilePath.Should().Be("Data/custom.json");
        settings.MediatR.LicenseKey.Should().Be("abc-123");
        settings.RateLimiting.PermitLimit.Should().Be(250);
        settings.RateLimiting.WindowSeconds.Should().Be(30);
    }

    [Fact]
    public void Bind_WhenSectionsMissing_ShouldFallBackToBehaviorPreservingDefaults()
    {
        var configuration = new ConfigurationBuilder()
            .AddInMemoryCollection(new Dictionary<string, string?>())
            .Build();

        var settings = configuration.Get<AppSettings>() ?? new AppSettings();

        settings.FamilyData.FilePath.Should().Be("Data/family.json");
        settings.MediatR.LicenseKey.Should().Be("");
        settings.RateLimiting.PermitLimit.Should().Be(100);
        settings.RateLimiting.WindowSeconds.Should().Be(60);
    }
}
