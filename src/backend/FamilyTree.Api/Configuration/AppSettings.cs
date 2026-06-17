namespace FamilyTree.Api.Configuration;

/// <summary>
/// Strongly-typed root for the application's own configuration sections, mirroring
/// the shape of appsettings.json. Framework sections (Logging, AllowedHosts) are
/// intentionally excluded — they stay with the host. Bound once in Program.cs;
/// nothing outside the composition root depends on this type.
/// </summary>
public sealed class AppSettings
{
    public FamilyDataSettings FamilyData { get; init; } = new();

    public MediatRSettings MediatR { get; init; } = new();

    public RateLimitingSettings RateLimiting { get; init; } = new();
}

public sealed class FamilyDataSettings
{
    public string FilePath { get; init; } = "Data/family.json";
}

public sealed class MediatRSettings
{
    public string LicenseKey { get; init; } = "";
}

public sealed class RateLimitingSettings
{
    public int PermitLimit { get; init; } = 100;

    public int WindowSeconds { get; init; } = 60;
}
