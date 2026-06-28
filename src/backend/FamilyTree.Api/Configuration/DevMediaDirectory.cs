namespace FamilyTree.Api.Configuration;

/// <summary>
/// Resolves the local-dev media directory so editor-uploaded photos land where the Vite dev
/// server serves <c>/media</c> — the repo-root <c>media/</c> folder (<c>vite.config.ts</c> →
/// <c>../../media</c>). The content root is the API project directory; the repo root is its
/// great-grandparent (<c>src/backend/FamilyTree.Api</c>), anchored on the solution file so the
/// lookup degrades gracefully (returns <c>null</c>) outside a source checkout.
/// </summary>
public static class DevMediaDirectory
{
    private const string SolutionMarker = "FamilyTree.slnx";

    /// <summary>
    /// Returns the absolute repo-root <c>media/</c> path when <paramref name="contentRootPath"/>
    /// sits three levels below a directory containing the solution file; otherwise <c>null</c>.
    /// </summary>
    public static string? ResolveRepoRootMedia(string contentRootPath)
    {
        var repoRoot = Path.GetFullPath(Path.Combine(contentRootPath, "..", "..", ".."));
        return File.Exists(Path.Combine(repoRoot, SolutionMarker))
            ? Path.Combine(repoRoot, "media")
            : null;
    }
}
