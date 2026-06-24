using FamilyTree.Api.Health;
using FamilyTree.Infrastructure;
using Microsoft.Extensions.Diagnostics.HealthChecks;

namespace FamilyTree.UnitTests.Api;

public sealed class FamilyDataHealthCheckTests
{
    private sealed class FakeHealthSource : IFamilyDataHealthSource
    {
        public int ConsecutiveRefreshFailures { get; init; }
        public bool IsDataSourceDegraded { get; init; }
    }

    [Fact]
    public async Task CheckHealthAsync_WhenSourceHealthy_ShouldReturnHealthy()
    {
        var check = new FamilyDataHealthCheck(new FakeHealthSource { IsDataSourceDegraded = false });

        var result = await check.CheckHealthAsync(new HealthCheckContext(), CancellationToken.None);

        result.Status.Should().Be(HealthStatus.Healthy);
    }

    [Fact]
    public async Task CheckHealthAsync_WhenSourceDegraded_ShouldReturnDegraded()
    {
        var check = new FamilyDataHealthCheck(
            new FakeHealthSource { IsDataSourceDegraded = true, ConsecutiveRefreshFailures = 5 });

        var result = await check.CheckHealthAsync(new HealthCheckContext(), CancellationToken.None);

        result.Status.Should().Be(HealthStatus.Degraded);
    }
}
