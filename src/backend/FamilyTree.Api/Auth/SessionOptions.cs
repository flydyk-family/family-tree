namespace FamilyTree.Api.Auth;

public sealed class SessionOptions
{
    public string CookieName { get; set; } = "ft_session";

    public int LifetimeDays { get; set; } = 7;

    public bool SlidingRenewal { get; set; } = true;
}
