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
                ["FamilyData:Source"] = "Data/custom.json",
                ["FamilyData:SnapshotTtlMinutes"] = "5",
                ["MediatR:LicenseKey"] = "abc-123",
                ["RateLimiting:PermitLimit"] = "250",
                ["RateLimiting:WindowSeconds"] = "30",
                ["Authentication:Google:ClientId"] = "client-xyz.apps.googleusercontent.com",
                ["Authentication:Google:Editors:0"] = "editor@example.com",
                ["Authentication:Session:CookieName"] = "ft_custom",
                ["Authentication:Session:LifetimeDays"] = "3",
                ["Authentication:Session:SlidingRenewal"] = "false",
                ["Firestore:ProjectId"] = "my-project",
                ["Firestore:SessionsCollection"] = "s",
                ["Firestore:OverridesCollection"] = "o"
            })
            .Build();

        var settings = configuration.Get<AppSettings>();

        settings.Should().NotBeNull();
        settings!.FamilyData.Source.Should().Be("Data/custom.json");
        settings.FamilyData.SnapshotTtlMinutes.Should().Be(5);
        settings.MediatR.LicenseKey.Should().Be("abc-123");
        settings.RateLimiting.PermitLimit.Should().Be(250);
        settings.RateLimiting.WindowSeconds.Should().Be(30);
        settings!.Authentication.Google.ClientId.Should().Be("client-xyz.apps.googleusercontent.com");
        settings.Authentication.Google.Editors.Should().ContainSingle().Which.Should().Be("editor@example.com");
        settings.Authentication.Session.CookieName.Should().Be("ft_custom");
        settings.Authentication.Session.LifetimeDays.Should().Be(3);
        settings.Authentication.Session.SlidingRenewal.Should().BeFalse();
        settings.Firestore.ProjectId.Should().Be("my-project");
        settings.Firestore.SessionsCollection.Should().Be("s");
        settings.Firestore.OverridesCollection.Should().Be("o");
    }

    [Fact]
    public void Bind_WhenSectionsMissing_ShouldFallBackToBehaviorPreservingDefaults()
    {
        var configuration = new ConfigurationBuilder()
            .AddInMemoryCollection(new Dictionary<string, string?>())
            .Build();

        var settings = configuration.Get<AppSettings>() ?? new AppSettings();

        settings.FamilyData.Source.Should().Be("Data/family.json");
        settings.FamilyData.SnapshotTtlMinutes.Should().Be(10);
        settings.MediatR.LicenseKey.Should().Be("");
        settings.RateLimiting.PermitLimit.Should().Be(100);
        settings.RateLimiting.WindowSeconds.Should().Be(60);
        settings.Authentication.Google.ClientId.Should().Be("");
        settings.Authentication.Google.Editors.Should().BeEmpty();
        settings.Authentication.Session.CookieName.Should().Be("ft_session");
        settings.Authentication.Session.LifetimeDays.Should().Be(7);
        settings.Authentication.Session.SlidingRenewal.Should().BeTrue();
        settings.Firestore.ProjectId.Should().Be("");
        settings.Firestore.SessionsCollection.Should().Be("sessions");
        settings.Firestore.OverridesCollection.Should().Be("personOverrides");
    }

    // AuthApiFactory/FamilyApiFactory blank Firestore:ProjectId and R2:* via UseSetting so a
    // developer's real local user-secrets (auto-loaded in the Development environment) can
    // never wire an integration test host to production Firestore/R2. This pins the underlying
    // mechanism that guarantee relies on: a configuration source added later always wins over
    // one added earlier, exactly how WebApplicationFactory's UseSetting layers on top of
    // whatever AddUserSecrets already contributed.
    [Fact]
    public void Bind_WhenALaterSourceBlanksAnEarlierRealValue_ShouldResolveToTheLaterBlank()
    {
        var configuration = new ConfigurationBuilder()
            // Stands in for a developer's real local user-secrets.json for this project.
            .AddInMemoryCollection(new Dictionary<string, string?>
            {
                ["Firestore:ProjectId"] = "some-real-gcp-project",
                ["R2:AccountId"] = "some-real-account-id"
            })
            // Stands in for WebApplicationFactory.UseSetting, added after user-secrets.
            .AddInMemoryCollection(new Dictionary<string, string?>
            {
                ["Firestore:ProjectId"] = "",
                ["R2:AccountId"] = ""
            })
            .Build();

        var settings = configuration.Get<AppSettings>();

        settings!.Firestore.ProjectId.Should().Be("");
        settings.R2.AccountId.Should().Be("");
    }
}
