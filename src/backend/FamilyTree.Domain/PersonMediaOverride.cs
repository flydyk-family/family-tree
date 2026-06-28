namespace FamilyTree.Domain;

/// <summary>An editor's media override for one person: the portrait (if set) and the gallery photos.</summary>
public sealed record PersonMediaOverride(Photo? Portrait, IReadOnlyList<Photo> Gallery);
