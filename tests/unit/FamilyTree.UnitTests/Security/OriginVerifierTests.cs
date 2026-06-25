using FamilyTree.Api.Security;
using Microsoft.Extensions.Options;

namespace FamilyTree.UnitTests.Security;

public sealed class OriginVerifierTests
{
    private static OriginVerifier Build(params string[] secrets) =>
        new(Options.Create(new OriginVerifyOptions { Secrets = secrets }));

    [Fact]
    public void IsEnabled_WhenNoSecretsConfigured_ShouldBeFalse()
    {
        Build().IsEnabled.Should().BeFalse();
    }

    [Fact]
    public void IsEnabled_WhenOnlyBlankSecretsConfigured_ShouldBeFalse()
    {
        Build("", "   ").IsEnabled.Should().BeFalse();
    }

    [Fact]
    public void IsEnabled_WhenSecretConfigured_ShouldBeTrue()
    {
        Build("s3cr3t").IsEnabled.Should().BeTrue();
    }

    [Fact]
    public void IsTrusted_WhenHeaderMatchesConfiguredSecret_ShouldBeTrue()
    {
        Build("s3cr3t").IsTrusted("s3cr3t").Should().BeTrue();
    }

    [Fact]
    public void IsTrusted_WhenHeaderMatchesAnyOfASet_ShouldBeTrue()
    {
        var verifier = Build("old-secret", "new-secret");
        verifier.IsTrusted("old-secret").Should().BeTrue();
        verifier.IsTrusted("new-secret").Should().BeTrue();
    }

    [Fact]
    public void IsTrusted_WhenHeaderWrong_ShouldBeFalse()
    {
        Build("s3cr3t").IsTrusted("nope").Should().BeFalse();
    }

    [Fact]
    public void IsTrusted_WhenHeaderEmpty_ShouldBeFalse()
    {
        Build("s3cr3t").IsTrusted("").Should().BeFalse();
    }

    [Fact]
    public void IsTrusted_WhenHeaderNull_ShouldBeFalse()
    {
        Build("s3cr3t").IsTrusted(null).Should().BeFalse();
    }
}
