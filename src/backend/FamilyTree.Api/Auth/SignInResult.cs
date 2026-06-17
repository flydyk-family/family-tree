namespace FamilyTree.Api.Auth;

public sealed record SignInResult(string Token, SessionIdentity Identity);
