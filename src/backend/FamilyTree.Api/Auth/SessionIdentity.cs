namespace FamilyTree.Api.Auth;

public sealed record SessionIdentity(string Email, string Name, bool CanEdit);
