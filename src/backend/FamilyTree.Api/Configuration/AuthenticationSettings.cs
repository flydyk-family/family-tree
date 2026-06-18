namespace FamilyTree.Api.Configuration;

public sealed class AuthenticationSettings
{
    public GoogleSettings Google { get; init; } = new();

    public SessionSettings Session { get; init; } = new();
}
