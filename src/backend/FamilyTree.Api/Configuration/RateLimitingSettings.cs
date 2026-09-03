namespace FamilyTree.Api.Configuration;

public sealed class RateLimitingSettings
{
    public int PermitLimit { get; init; } = 100;

    public int WindowSeconds { get; init; } = 60;

    /// <summary>Separate, tighter budget for the geocoding proxy. Those routes are the only
    /// ones that spend money per call (billed Google requests), so they get their own bucket
    /// rather than sharing the general read allowance. A picker session costs at most a few
    /// requests per placed pin — one reverse lookup plus three locale lookups — so this is
    /// generous for real editing while capping a runaway client or a curious editor.</summary>
    public GeocodeRateLimitingSettings Geocode { get; init; } = new();
}

public sealed class GeocodeRateLimitingSettings
{
    public int PermitLimit { get; init; } = 40;

    public int WindowSeconds { get; init; } = 60;
}
