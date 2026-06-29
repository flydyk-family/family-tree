namespace FamilyTree.Domain;

/// <summary>An editor's media override for one person: the portrait (if set), the gallery photos,
/// and the bare seed keys the editor has hidden (seed media can't be deleted, only suppressed).</summary>
public sealed record PersonMediaOverride(Photo? Portrait, IReadOnlyList<Photo> Gallery)
{
    /// <summary>Bare seed filenames (no '/') the editor has hidden for this person — a hidden seed
    /// portrait falls back to an uploaded portrait or initials; a hidden seed video is dropped.</summary>
    public IReadOnlyList<string> HiddenSeeds { get; init; } = [];
}
