namespace FamilyTree.Api.Auth;

// Returned by GET /api/auth/me (always 200) and POST /api/auth/session. SignedIn is
// false for an anonymous caller — the endpoint no longer 401s, so a not-signed-in
// page load isn't a console/network error. When false, the other fields are empty.
public sealed record MeResponse(bool SignedIn, string Email, string Name, bool CanEdit);
