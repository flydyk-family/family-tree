namespace FamilyTree.Api.Auth;

public interface ISessionManager
{
    Task<SignInResult?> SignInAsync(string idToken, CancellationToken cancellationToken);
    Task SignOutAsync(string token, CancellationToken cancellationToken);
}
