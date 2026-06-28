namespace FamilyTree.Domain;

/// <summary>An uploaded image and its thumbnail, identified by a content hash.
/// <see cref="Full"/> and <see cref="Thumb"/> are R2 object keys (e.g. "uploads/p-0001/ab12.webp").</summary>
public sealed record Photo(string Id, string Full, string Thumb);
