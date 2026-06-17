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
                ["RateLimiting:WindowSeconds"] = "30",
                ["Authentication:Google:ClientId"] = "client-xyz.apps.googleusercontent.com",
                ["Authentication:Google:Editors:0"] = "editor@example.com",
                ["Authentication:Session:CookieName"] = "ft_custom",
                ["Authentication:Session:LifetimeDays"] = "3",
                ["Authentication:Session:SlidingRenewal"] = "false"
            })
            .Build();

        var settings = configuration.Get<AppSettings>();

        settings.Should().NotBeNull();
        settings!.FamilyData.FilePath.Should().Be("Data/custom.json");
        settings.MediatR.LicenseKey.Should().Be("abc-123");
        settings.RateLimiting.PermitLimit.Should().Be(250);
        settings.RateLimiting.WindowSeconds.Should().Be(30);
        settings!.Authentication.Google.ClientId.Should().Be("client-xyz.apps.googleusercontent.com");
        settings.Authentication.Google.Editors.Should().ContainSingle().Which.Should().Be("editor@example.com");
        settings.Authentication.Session.CookieName.Should().Be("ft_custom");
        settings.Authentication.Session.LifetimeDays.Should().Be(3);
        settings.Authentication.Session.SlidingRenewal.Should().BeFalse();
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
        settings.Authentication.Google.ClientId.Should().Be("");
        settings.Authentication.Google.Editors.Should().BeEmpty();
        settings.Authentication.Session.CookieName.Should().Be("ft_session");
        settings.Authentication.Session.LifetimeDays.Should().Be(7);
        settings.Authentication.Session.SlidingRenewal.Should().BeTrue();
    }
}
