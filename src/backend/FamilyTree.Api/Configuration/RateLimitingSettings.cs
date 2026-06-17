namespace FamilyTree.Api.Configuration;

public sealed class RateLimitingSettings
{
    public int PermitLimit { get; init; } = 100;

    public int WindowSeconds { get; init; } = 60;
}
