using Microsoft.AspNetCore.Mvc;

namespace FamilyTree.Api.Family;

/// <summary>Writes the 404 for an unregistered family in the same ProblemDetails shape as the API's other 404s.</summary>
public static class FamilyNotFound
{
    public static Task WriteAsync(HttpContext context, string familyId)
    {
        context.Response.StatusCode = StatusCodes.Status404NotFound;
        return context.Response.WriteAsJsonAsync(
            new ProblemDetails
            {
                Type = "https://tools.ietf.org/html/rfc9110#section-15.5.5",
                Title = "Not Found",
                Status = StatusCodes.Status404NotFound,
                Detail = $"Family '{familyId}' is not registered."
            },
            options: null,
            contentType: "application/problem+json");
    }
}
