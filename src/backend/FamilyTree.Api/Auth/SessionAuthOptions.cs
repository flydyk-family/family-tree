namespace FamilyTree.Api.Auth;

public sealed class SessionAuthOptions
{
    public string CookieName { get; set; } = "ft_session";

    public int LifetimeDays { get; set; } = 7;

    public bool SlidingRenewal { get; set; } = true;
}
