namespace FamilyTree.Api.Configuration;

public sealed class SessionSettings
{
    public string CookieName { get; init; } = "ft_session";

    public int LifetimeDays { get; init; } = 7;

    public bool SlidingRenewal { get; init; } = true;
}
