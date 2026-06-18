namespace FamilyTree.Api.Auth;

public sealed record MeResponse(string Email, string Name, bool CanEdit);
