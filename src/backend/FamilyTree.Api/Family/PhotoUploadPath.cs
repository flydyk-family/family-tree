namespace FamilyTree.Api.Family;

/// <summary>Recognises the photo-upload routes, aliased and family-scoped, which get the larger body cap.</summary>
public static class PhotoUploadPath
{
    public static bool IsMatch(PathString path)
    {
        if (path.StartsWithSegments("/api/people", out var rest))
        {
            return IsPersonPhotos(rest);
        }

        if (path.StartsWithSegments("/api/families", out var familyRest))
        {
            // "/{familyId}/people/{id}/photos"
            var segments = familyRest.Value?.Split('/', StringSplitOptions.RemoveEmptyEntries) ?? [];
            return segments.Length == 4 && segments[1] == "people" && segments[3] == "photos";
        }

        return false;
    }

    // "/{id}/photos"
    private static bool IsPersonPhotos(PathString rest)
    {
        var segments = rest.Value?.Split('/', StringSplitOptions.RemoveEmptyEntries) ?? [];
        return segments.Length == 2 && segments[1] == "photos";
    }
}
