namespace FamilyTree.Api.Configuration;

public sealed class SecuritySettings
{
    public OriginVerifySettings OriginVerify { get; init; } = new();
}
