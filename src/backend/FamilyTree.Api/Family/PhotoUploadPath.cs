using System.Text.RegularExpressions;

namespace FamilyTree.Api.Family;

/// <summary>Recognises the photo-upload routes, aliased and family-scoped, which get the larger body cap.</summary>
public static partial class PhotoUploadPath
{
    public static bool IsMatch(PathString path) => PhotoRoute().IsMatch(path.Value ?? string.Empty);

    // "/api/people/{id}/photos" or "/api/families/{familyId}/people/{id}/photos"; case-insensitive like routing.
    [GeneratedRegex("^/api/(?:families/[^/]+/)?people/[^/]+/photos/?$", RegexOptions.IgnoreCase | RegexOptions.CultureInvariant)]
    private static partial Regex PhotoRoute();
}
