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
    private readonly IFamilyHealthRollup _rollup;

    public FamilyDataHealthCheck(IFamilyDataHealthSource source, IFamilyHealthRollup rollup)
    {
        _source = source;
        _rollup = rollup;
    }

    public Task<HealthCheckResult> CheckHealthAsync(HealthCheckContext context, CancellationToken cancellationToken = default)
    {
        // The verdict tracks the default family only (it gates deploys); other families' degradation
        // is reported in the body without failing the probe.
        var data = new Dictionary<string, object> { ["degradedFamilies"] = _rollup.DegradedFamilies };
        if (_source.IsDataSourceDegraded)
        {
            return Task.FromResult(HealthCheckResult.Degraded(
                $"Family data refresh has failed {_source.ConsecutiveRefreshFailures} times in a row; serving stale data.",
                data: data));
        }

        return Task.FromResult(HealthCheckResult.Healthy(data: data));
    }
}
