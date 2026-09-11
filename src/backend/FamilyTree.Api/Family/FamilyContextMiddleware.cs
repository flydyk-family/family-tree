using FamilyTree.Domain;

namespace FamilyTree.Api.Family;

/// <summary>Sets the request's family from the <c>familyId</c> route value (the unprefixed alias routes
/// keep the default). An unregistered family short-circuits with a 404 before any seed loads.</summary>
public sealed class FamilyContextMiddleware
{
    private readonly RequestDelegate _next;

    public FamilyContextMiddleware(RequestDelegate next)
    {
        _next = next;
    }

    public async Task InvokeAsync(HttpContext httpContext, FamilyRegistry registry, FamilyContext familyContext)
    {
        if (httpContext.Request.RouteValues.TryGetValue("familyId", out var value) && value?.ToString() is { Length: > 0 } familyId)
        {
            if (!registry.Contains(familyId))
            {
                httpContext.Response.StatusCode = StatusCodes.Status404NotFound;
                return;
            }

            familyContext.FamilyId = familyId;
        }

        await _next(httpContext);
    }
}
