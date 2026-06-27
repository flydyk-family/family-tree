using FamilyTree.Infrastructure;
using Microsoft.Extensions.Diagnostics.HealthChecks;

namespace FamilyTree.Api.Health;

/// <summary>
/// Reports the family-data source as Degraded once snapshot refreshes have failed
/// repeatedly (the app is serving last-good but stale data). Degraded keeps the /health
/// probe returning 200 — so Cloud Run does not restart a still-serving instance — while
/// surfacing the problem in the report body for monitoring.
/// </summary>
public sealed class FamilyDataHealthCheck : IHealthCheck
{
    private readonly IFamilyDataHealthSource _source;

    public FamilyDataHealthCheck(IFamilyDataHealthSource source)
    {
        _source = source;
    }

    public Task<HealthCheckResult> CheckHealthAsync(HealthCheckContext context, CancellationToken cancellationToken = default)
    {
        if (_source.IsDataSourceDegraded)
        {
            return Task.FromResult(HealthCheckResult.Degraded(
                $"Family data refresh has failed {_source.ConsecutiveRefreshFailures} times in a row; serving stale data."));
        }

        return Task.FromResult(HealthCheckResult.Healthy());
    }
}
